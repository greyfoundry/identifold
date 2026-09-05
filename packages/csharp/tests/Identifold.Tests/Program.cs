using Greyfoundry.Identifold;
using Greyfoundry.Identifold.Storage;
using Greyfoundry.Identifold.Storage.Postgres;
using Greyfoundry.Identifold.Storage.Sqlite;
using Greyfoundry.Identifold.Storage.MySql;
using Microsoft.Data.Sqlite;
using MySqlConnector;
using Npgsql;

const string mid = "019d4c72-c910-7a84-b313-53c3ac61a32f";
var pid = Identifiers.PublicIdFromMachineId(mid, "order");
if (pid != "order_01kn675j8gfa2b64tkrep638sf") throw new Exception(pid);
var parsed = Identifiers.ParsePublicId(pid);
if (parsed.MachineId != mid || parsed.Namespace != "order") throw new Exception("round trip");
if (Identifiers.CheckSymbol("0123456789", false) != 'P') throw new Exception("random checksum");
if (Identifiers.CheckSymbol("2026001842", true) != 'M') throw new Exception("sequential checksum");

var storage = new FakeStorage();
IStorageAdapter storageAdapter = storage;
var reservation = new ReferenceReservation(mid, "order", "ORD-0123-4567-89-P");
if (!await storageAdapter.ReserveAsync(reservation)) throw new Exception("reserve");
var mapping = await storageAdapter.ResolveAsync(reservation.Reference, reservation.Namespace);
if (mapping?.MachineId != mid) throw new Exception("resolve");
if (await storageAdapter.AllocateAsync(new SequenceAllocationRequest(
    mid, "receipt", "RCT", null, 4)) != 1) throw new Exception("allocate");

await using (var sqlite = new SqliteConnection("Data Source=:memory:"))
{
    await sqlite.OpenAsync();
    var root = Directory.GetCurrentDirectory();
    while (!Directory.Exists(Path.Combine(root, "integrations")))
        root = Directory.GetParent(root)?.FullName ?? throw new Exception("repository root");
    await using (var migration = sqlite.CreateCommand())
    {
        migration.CommandText = await File.ReadAllTextAsync(Path.Combine(
            root, "integrations", "sqlite", "migrations", "001_identifold.up.sql"));
        await migration.ExecuteNonQueryAsync();
    }
    var adapter = new SqliteStorageAdapter(sqlite);
    const string sqliteMid = "01890f8c-7b2a-7cc3-98b0-112233445566";
    const string sqliteRef = "ORD-0123-4567-89-P";
    if (!await adapter.ReserveAsync(new(sqliteMid, "order", sqliteRef)))
        throw new Exception("sqlite reserve");
    if ((await adapter.ResolveAsync(sqliteRef, "order"))?.MachineId != sqliteMid)
        throw new Exception("sqlite resolve");
    var sqliteRequest = new SequenceAllocationRequest(
        "01890f8c-7b2a-7cc3-98b0-112233445567", "receipt", "RCT", null, 4);
    if (await adapter.AllocateAsync(sqliteRequest) != 1 ||
        await adapter.AllocateAsync(sqliteRequest) != 1)
        throw new Exception("sqlite allocate");
    if ((await adapter.ResolveAsync("RCT-0001-1", "receipt"))?.MachineId != sqliteRequest.MachineId)
        throw new Exception("sqlite sequential resolve");
}

var databaseUrl = Environment.GetEnvironmentVariable("IDENTIFOLD_TEST_DATABASE_URL");
if (databaseUrl is not null)
{
    var uri = new Uri(databaseUrl);
    var credentials = uri.UserInfo.Split(':', 2);
    var connectionString = new NpgsqlConnectionStringBuilder
    {
        Host = uri.Host,
        Port = uri.Port,
        Database = uri.AbsolutePath.TrimStart('/'),
        Username = credentials[0],
        Password = credentials[1],
    }.ConnectionString;
    await using var dataSource = NpgsqlDataSource.Create(connectionString);
    await using (var connection = await dataSource.OpenConnectionAsync())
    {
        var root = Directory.GetCurrentDirectory();
        while (!Directory.Exists(Path.Combine(root, "integrations")))
            root = Directory.GetParent(root)?.FullName ?? throw new Exception("repository root");
        foreach (var migration in new[]
        {
            "001_identifold.down.sql",
            "001_identifold.up.sql",
            "003_idempotent_replay.up.sql",
            "004_reference_lookup.up.sql",
        })
        {
            await using var command = connection.CreateCommand();
            command.CommandText = await File.ReadAllTextAsync(Path.Combine(
                root, "integrations", "postgres", "migrations", migration));
            await command.ExecuteNonQueryAsync();
        }
    }

    var postgres = new PostgresStorageAdapter(dataSource);
    const string randomMid = "01890f8c-7b2a-7cc3-98b0-112233445566";
    const string randomRef = "ORD-0123-4567-89-P";
    if (!await postgres.ReserveAsync(new(randomMid, "order", randomRef)))
        throw new Exception("postgres reserve");
    if ((await postgres.ResolveAsync(randomRef, "order"))?.MachineId != randomMid)
        throw new Exception("postgres resolve");
    var request = new SequenceAllocationRequest(
        "01890f8c-7b2a-7cc3-98b0-112233445567", "receipt", "RCT", null, 4);
    if (await postgres.AllocateAsync(request) != 1 || await postgres.AllocateAsync(request) != 1)
        throw new Exception("postgres allocate");
    if ((await postgres.ResolveAsync("RCT-0001-1", "receipt"))?.MachineId != request.MachineId)
        throw new Exception("postgres sequential resolve");
}

var mysqlUrl = Environment.GetEnvironmentVariable("IDENTIFOLD_TEST_MYSQL_URL");
if (mysqlUrl is not null)
{
    var uri = new Uri(mysqlUrl);
    var credentials = uri.UserInfo.Split(':', 2);
    var connectionString = new MySqlConnectionStringBuilder
    {
        Server = uri.Host,
        Port = (uint)uri.Port,
        Database = uri.AbsolutePath.TrimStart('/'),
        UserID = credentials[0],
        Password = credentials[1],
    }.ConnectionString;
    await using (var connection = new MySqlConnection(connectionString))
    {
        await connection.OpenAsync();
        foreach (var table in new[]
        {
            "identifold_sequence_allocations",
            "identifold_sequences",
            "identifold_references",
        })
        {
            await using var command = connection.CreateCommand();
            command.CommandText = $"DELETE FROM {table}";
            await command.ExecuteNonQueryAsync();
        }
    }

    var mysql = new MySqlStorageAdapter(connectionString);
    const string randomMid = "01890f8c-7b2a-7cc3-98b0-112233445566";
    const string randomRef = "ORD-0123-4567-89-P";
    if (!await mysql.ReserveAsync(new(randomMid, "order", randomRef)))
        throw new Exception("mysql reserve");
    if ((await mysql.ResolveAsync(randomRef, "order"))?.MachineId != randomMid)
        throw new Exception("mysql resolve");
    var request = new SequenceAllocationRequest(
        "01890f8c-7b2a-7cc3-98b0-112233445567", "receipt", "RCT", null, 4);
    if (await mysql.AllocateAsync(request) != 1 || await mysql.AllocateAsync(request) != 1)
        throw new Exception("mysql allocate");
    if ((await mysql.ResolveAsync("RCT-0001-1", "receipt"))?.MachineId != request.MachineId)
        throw new Exception("mysql sequential resolve");
}

sealed class FakeStorage : IStorageAdapter
{
    public ValueTask<bool> ReserveAsync(ReferenceReservation request, CancellationToken cancellationToken = default)
        => ValueTask.FromResult(true);

    public ValueTask<ReferenceMapping?> ResolveAsync(
        string reference,
        string namespaceName,
        CancellationToken cancellationToken = default)
        => ValueTask.FromResult<ReferenceMapping?>(new(
            "019d4c72-c910-7a84-b313-53c3ac61a32f",
            namespaceName));

    public ValueTask<ulong> AllocateAsync(
        SequenceAllocationRequest request,
        CancellationToken cancellationToken = default)
        => ValueTask.FromResult<ulong>(1);
}
