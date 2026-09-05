using System.Data;
using System.Text.RegularExpressions;
using MySqlConnector;

namespace Greyfoundry.Identifold.Storage.MySql;

public sealed partial class MySqlStorageAdapter(string connectionString) : IStorageAdapter
{
    public async ValueTask<bool> ReserveAsync(
        ReferenceReservation request,
        CancellationToken cancellationToken = default)
    {
        try
        {
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync(cancellationToken);
            await using var command = new MySqlCommand(
                "identifold_reserve_reference",
                connection)
            {
                CommandType = CommandType.StoredProcedure,
            };
            command.Parameters.AddWithValue("@requested_machine_id", MachineIdBytes(request.MachineId));
            command.Parameters.AddWithValue("@requested_namespace", request.Namespace);
            command.Parameters.AddWithValue("@requested_reference", request.Reference);
            var value = await command.ExecuteScalarAsync(cancellationToken);
            return value is bool reserved
                ? reserved
                : value is sbyte integer && integer is 0 or 1
                    ? integer == 1
                    : throw new IdentifoldException("allocation_conflict");
        }
        catch (IdentifoldException) { throw; }
        catch (MySqlException exception) { throw Map(exception); }
        catch (FormatException) { throw new IdentifoldException("allocation_conflict"); }
    }

    public async ValueTask<ReferenceMapping?> ResolveAsync(
        string reference,
        string namespaceName,
        CancellationToken cancellationToken = default)
    {
        try
        {
            await using var connection = new MySqlConnection(connectionString);
            await connection.OpenAsync(cancellationToken);
            var random = await LookupAsync(
                connection,
                "SELECT machine_id, namespace FROM identifold_references " +
                    "WHERE reference = @reference AND namespace = @namespace",
                new Dictionary<string, object>
                {
                    ["@reference"] = reference,
                    ["@namespace"] = namespaceName,
                },
                cancellationToken);
            if (random is not null) return random;

            var match = SequentialReference().Match(reference);
            if (!match.Success) return null;
            return await LookupAsync(
                connection,
                "SELECT machine_id, namespace FROM identifold_sequence_allocations " +
                    "WHERE namespace = @namespace AND reference_prefix = @prefix " +
                    "AND scope = @scope AND sequence = @sequence",
                new Dictionary<string, object>
                {
                    ["@namespace"] = namespaceName,
                    ["@prefix"] = match.Groups[1].Value,
                    ["@scope"] = match.Groups[2].Value,
                    ["@sequence"] = ulong.Parse(match.Groups[3].Value),
                },
                cancellationToken);
        }
        catch (IdentifoldException) { throw; }
        catch (MySqlException exception) { throw Map(exception); }
        catch (FormatException) { throw new IdentifoldException("allocation_conflict"); }
    }

    public async ValueTask<ulong> AllocateAsync(
        SequenceAllocationRequest request,
        CancellationToken cancellationToken = default)
    {
        for (var attempt = 0; attempt < 5; attempt++)
        {
            try
            {
                await using var connection = new MySqlConnection(connectionString);
                await connection.OpenAsync(cancellationToken);
                await using var command = new MySqlCommand(
                    "identifold_allocate_sequence",
                    connection)
                {
                    CommandType = CommandType.StoredProcedure,
                };
                command.Parameters.AddWithValue("@requested_machine_id", MachineIdBytes(request.MachineId));
                command.Parameters.AddWithValue("@requested_namespace", request.Namespace);
                command.Parameters.AddWithValue("@requested_reference_prefix", request.ReferencePrefix);
                command.Parameters.AddWithValue("@requested_scope", request.Scope is null ? DBNull.Value : request.Scope);
                command.Parameters.AddWithValue("@requested_width", request.Width);
                var value = await command.ExecuteScalarAsync(cancellationToken);
                return value switch
                {
                    ulong sequence => sequence,
                    long sequence when sequence >= 0 => (ulong)sequence,
                    _ => throw new IdentifoldException("allocation_conflict"),
                };
            }
            catch (MySqlException exception) when (attempt < 4 && IsTransient(exception))
            {
                await Task.Delay(TimeSpan.FromMilliseconds(1 << attempt), cancellationToken);
            }
            catch (IdentifoldException) { throw; }
            catch (MySqlException exception) { throw Map(exception); }
            catch (FormatException) { throw new IdentifoldException("allocation_conflict"); }
        }
        throw new IdentifoldException("allocation_conflict");
    }

    private static async ValueTask<ReferenceMapping?> LookupAsync(
        MySqlConnection connection,
        string query,
        IReadOnlyDictionary<string, object> parameters,
        CancellationToken cancellationToken)
    {
        await using var command = new MySqlCommand(query, connection);
        foreach (var parameter in parameters)
            command.Parameters.AddWithValue(parameter.Key, parameter.Value);
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        return await reader.ReadAsync(cancellationToken)
            ? new ReferenceMapping(
                BytesMachineId(reader.GetFieldValue<byte[]>(0)),
                reader.GetString(1))
            : null;
    }

    private static byte[] MachineIdBytes(string value) =>
        Guid.Parse(value).ToByteArray(bigEndian: true);

    private static string BytesMachineId(byte[] value) =>
        value.Length == 16
            ? new Guid(value, bigEndian: true).ToString()
            : throw new IdentifoldException("allocation_conflict");

    private static bool IsTransient(MySqlException exception) =>
        exception.Number is 1205 or 1213 || exception.SqlState == "40001";

    private static IdentifoldException Map(MySqlException exception) => exception.SqlState switch
    {
        "22003" => new("sequence_overflow"),
        "22023" => new("invalid_allocation_policy"),
        _ => new("allocation_conflict"),
    };

    [GeneratedRegex("^([A-Z]{2,8})-(?:([0-9]{4})-)?([0-9]{4,18})-[0-9A-Z*~$=U]$")]
    private static partial Regex SequentialReference();
}
