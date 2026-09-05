using System.Text.RegularExpressions;
using Microsoft.Data.Sqlite;

namespace Greyfoundry.Identifold.Storage.Sqlite;

public sealed partial class SqliteStorageAdapter(SqliteConnection connection) : IStorageAdapter
{
    private readonly SemaphoreSlim gate = new(1, 1);

    public async ValueTask<bool> ReserveAsync(
        ReferenceReservation request,
        CancellationToken cancellationToken = default)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            await using var command = connection.CreateCommand();
            command.CommandText =
                "INSERT INTO identifold_references " +
                "(reference, namespace, machine_id) VALUES ($reference, $namespace, $machine_id) " +
                "ON CONFLICT(reference) DO NOTHING";
            command.Parameters.AddWithValue("$reference", request.Reference);
            command.Parameters.AddWithValue("$namespace", request.Namespace);
            command.Parameters.AddWithValue("$machine_id", MachineIdBytes(request.MachineId));
            return await command.ExecuteNonQueryAsync(cancellationToken) == 1;
        }
        catch (IdentifoldException) { throw; }
        catch (SqliteException) { throw new IdentifoldException("allocation_conflict"); }
        finally { gate.Release(); }
    }

    public async ValueTask<ReferenceMapping?> ResolveAsync(
        string reference,
        string namespaceName,
        CancellationToken cancellationToken = default)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            var random = await ResolveRandomAsync(reference, namespaceName, cancellationToken);
            if (random is not null) return random;
            var match = SequentialReference().Match(reference);
            if (!match.Success) return null;

            await using var command = connection.CreateCommand();
            command.CommandText =
                "SELECT machine_id, namespace FROM identifold_sequence_allocations " +
                "WHERE namespace = $namespace AND reference_prefix = $prefix " +
                "AND scope = $scope AND sequence = $sequence";
            command.Parameters.AddWithValue("$namespace", namespaceName);
            command.Parameters.AddWithValue("$prefix", match.Groups[1].Value);
            command.Parameters.AddWithValue("$scope", match.Groups[2].Value);
            command.Parameters.AddWithValue("$sequence", match.Groups[3].Value);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            return await reader.ReadAsync(cancellationToken)
                ? new ReferenceMapping(BytesMachineId((byte[])reader[0]), reader.GetString(1))
                : null;
        }
        catch (IdentifoldException) { throw; }
        catch (SqliteException) { throw new IdentifoldException("allocation_conflict"); }
        finally { gate.Release(); }
    }

    public async ValueTask<ulong> AllocateAsync(
        SequenceAllocationRequest request,
        CancellationToken cancellationToken = default)
    {
        if (request.Width is < 4 or > 18)
            throw new IdentifoldException("invalid_allocation_policy");

        await gate.WaitAsync(cancellationToken);
        try
        {
            using var transaction = connection.BeginTransaction(deferred: false);
            try
            {
                var scope = request.Scope ?? string.Empty;
                var machineId = MachineIdBytes(request.MachineId);
                await using (var replay = connection.CreateCommand())
                {
                    replay.Transaction = transaction;
                    replay.CommandText =
                        "SELECT sequence, reference_prefix, width " +
                        "FROM identifold_sequence_allocations " +
                        "WHERE namespace = $namespace AND scope = $scope AND machine_id = $machine_id";
                    replay.Parameters.AddWithValue("$namespace", request.Namespace);
                    replay.Parameters.AddWithValue("$scope", scope);
                    replay.Parameters.AddWithValue("$machine_id", machineId);
                    await using var reader = await replay.ExecuteReaderAsync(cancellationToken);
                    if (await reader.ReadAsync(cancellationToken))
                    {
                        if (reader.GetString(1) != request.ReferencePrefix ||
                            reader.GetInt32(2) != request.Width)
                            throw new IdentifoldException("invalid_allocation_policy");
                        var sequence = checked((ulong)reader.GetInt64(0));
                        transaction.Commit();
                        return sequence;
                    }
                }

                await using (var create = connection.CreateCommand())
                {
                    create.Transaction = transaction;
                    create.CommandText =
                        "INSERT INTO identifold_sequences " +
                        "(namespace, scope, reference_prefix, width, last_value) " +
                        "VALUES ($namespace, $scope, $prefix, $width, 0) ON CONFLICT DO NOTHING";
                    AddPolicyParameters(create, request, scope);
                    await create.ExecuteNonQueryAsync(cancellationToken);
                }

                long current;
                await using (var select = connection.CreateCommand())
                {
                    select.Transaction = transaction;
                    select.CommandText =
                        "SELECT reference_prefix, width, last_value FROM identifold_sequences " +
                        "WHERE namespace = $namespace AND scope = $scope";
                    select.Parameters.AddWithValue("$namespace", request.Namespace);
                    select.Parameters.AddWithValue("$scope", scope);
                    await using var reader = await select.ExecuteReaderAsync(cancellationToken);
                    if (!await reader.ReadAsync(cancellationToken) ||
                        reader.GetString(0) != request.ReferencePrefix ||
                        reader.GetInt32(1) != request.Width)
                        throw new IdentifoldException("invalid_allocation_policy");
                    current = reader.GetInt64(2);
                }

                long maximum = 1;
                for (var index = 0; index < request.Width; index++) maximum = checked(maximum * 10);
                maximum--;
                if (current >= maximum) throw new IdentifoldException("sequence_overflow");
                var allocated = checked(current + 1);

                await using (var update = connection.CreateCommand())
                {
                    update.Transaction = transaction;
                    update.CommandText =
                        "UPDATE identifold_sequences SET last_value = $allocated " +
                        "WHERE namespace = $namespace AND scope = $scope";
                    update.Parameters.AddWithValue("$allocated", allocated);
                    update.Parameters.AddWithValue("$namespace", request.Namespace);
                    update.Parameters.AddWithValue("$scope", scope);
                    await update.ExecuteNonQueryAsync(cancellationToken);
                }

                await using (var insert = connection.CreateCommand())
                {
                    insert.Transaction = transaction;
                    insert.CommandText =
                        "INSERT INTO identifold_sequence_allocations " +
                        "(namespace, scope, sequence, machine_id, reference_prefix, width) " +
                        "VALUES ($namespace, $scope, $sequence, $machine_id, $prefix, $width)";
                    AddPolicyParameters(insert, request, scope);
                    insert.Parameters.AddWithValue("$sequence", allocated);
                    insert.Parameters.AddWithValue("$machine_id", machineId);
                    await insert.ExecuteNonQueryAsync(cancellationToken);
                }
                transaction.Commit();
                return checked((ulong)allocated);
            }
            catch
            {
                transaction.Rollback();
                throw;
            }
        }
        catch (IdentifoldException) { throw; }
        catch (SqliteException) { throw new IdentifoldException("allocation_conflict"); }
        catch (OverflowException) { throw new IdentifoldException("sequence_overflow"); }
        finally { gate.Release(); }
    }

    private async ValueTask<ReferenceMapping?> ResolveRandomAsync(
        string reference,
        string namespaceName,
        CancellationToken cancellationToken)
    {
        await using var command = connection.CreateCommand();
        command.CommandText =
            "SELECT machine_id, namespace FROM identifold_references " +
            "WHERE reference = $reference AND namespace = $namespace";
        command.Parameters.AddWithValue("$reference", reference);
        command.Parameters.AddWithValue("$namespace", namespaceName);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken)
            ? new ReferenceMapping(BytesMachineId((byte[])reader[0]), reader.GetString(1))
            : null;
    }

    private static void AddPolicyParameters(
        SqliteCommand command,
        SequenceAllocationRequest request,
        string scope)
    {
        command.Parameters.AddWithValue("$namespace", request.Namespace);
        command.Parameters.AddWithValue("$scope", scope);
        command.Parameters.AddWithValue("$prefix", request.ReferencePrefix);
        command.Parameters.AddWithValue("$width", request.Width);
    }

    private static byte[] MachineIdBytes(string value) =>
        Guid.Parse(value).ToByteArray(bigEndian: true);

    private static string BytesMachineId(byte[] value) =>
        value.Length == 16
            ? new Guid(value, bigEndian: true).ToString()
            : throw new IdentifoldException("allocation_conflict");

    [GeneratedRegex("^([A-Z]{2,8})-(?:([0-9]{4})-)?([0-9]{4,18})-[0-9A-Z*~$=U]$")]
    private static partial Regex SequentialReference();
}
