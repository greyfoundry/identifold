using Npgsql;
using NpgsqlTypes;

namespace Greyfoundry.Identifold.Storage.Postgres;

public sealed class PostgresStorageAdapter(NpgsqlDataSource dataSource) : IStorageAdapter
{
    public async ValueTask<bool> ReserveAsync(
        ReferenceReservation request,
        CancellationToken cancellationToken = default)
    {
        try
        {
            await using var command = dataSource.CreateCommand(
                "SELECT identifold_reserve_reference($1::text::uuid, $2::text, $3::text)");
            command.Parameters.AddWithValue(request.MachineId);
            command.Parameters.AddWithValue(request.Namespace);
            command.Parameters.AddWithValue(request.Reference);
            var value = await command.ExecuteScalarAsync(cancellationToken);
            return value is bool reserved
                ? reserved
                : throw new IdentifoldException("allocation_conflict");
        }
        catch (IdentifoldException) { throw; }
        catch (PostgresException exception) { throw Map(exception); }
        catch (NpgsqlException) { throw new IdentifoldException("allocation_conflict"); }
    }

    public async ValueTask<ReferenceMapping?> ResolveAsync(
        string reference,
        string namespaceName,
        CancellationToken cancellationToken = default)
    {
        try
        {
            await using var command = dataSource.CreateCommand(
                "SELECT resolved_machine_id::text, resolved_namespace " +
                "FROM identifold_resolve_reference($1::text, $2::text)");
            command.Parameters.AddWithValue(reference);
            command.Parameters.AddWithValue(namespaceName);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            if (!await reader.ReadAsync(cancellationToken)) return null;
            return new ReferenceMapping(reader.GetString(0), reader.GetString(1));
        }
        catch (PostgresException exception) { throw Map(exception); }
        catch (NpgsqlException) { throw new IdentifoldException("allocation_conflict"); }
    }

    public async ValueTask<ulong> AllocateAsync(
        SequenceAllocationRequest request,
        CancellationToken cancellationToken = default)
    {
        try
        {
            await using var command = dataSource.CreateCommand(
                "SELECT identifold_allocate_sequence(" +
                "$1::text::uuid, $2::text, $3::text, $4::text, $5::smallint)");
            command.Parameters.AddWithValue(request.MachineId);
            command.Parameters.AddWithValue(request.Namespace);
            command.Parameters.AddWithValue(request.ReferencePrefix);
            command.Parameters.Add(new NpgsqlParameter
            {
                NpgsqlDbType = NpgsqlDbType.Text,
                Value = request.Scope is null ? DBNull.Value : request.Scope,
            });
            command.Parameters.AddWithValue((short)request.Width);
            var value = await command.ExecuteScalarAsync(cancellationToken);
            return value is long sequence && sequence >= 0
                ? (ulong)sequence
                : throw new IdentifoldException("allocation_conflict");
        }
        catch (IdentifoldException) { throw; }
        catch (PostgresException exception) { throw Map(exception); }
        catch (NpgsqlException) { throw new IdentifoldException("allocation_conflict"); }
    }

    private static IdentifoldException Map(PostgresException exception) => exception.SqlState switch
    {
        "22003" => new("sequence_overflow"),
        "22023" => new("invalid_allocation_policy"),
        _ => new("allocation_conflict"),
    };
}
