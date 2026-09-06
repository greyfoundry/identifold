using Greyfoundry.Identifold.Storage;
using Greyfoundry.Identifold.Storage.Sqlite;
using Microsoft.Data.Sqlite;

await using var connection = new SqliteConnection("Data Source=:memory:");
await connection.OpenAsync();
await using (var migration = connection.CreateCommand())
{
    migration.CommandText = await File.ReadAllTextAsync(
        Path.Combine("integrations", "sqlite", "migrations", "001_identifold.up.sql"));
    await migration.ExecuteNonQueryAsync();
}
var adapter = new SqliteStorageAdapter(connection);
var request = new ReferenceReservation(
    "01890f8c-7b2a-7cc3-98b0-112233445566", "order", "ORD-0123-4567-89-P");
var reserved = await adapter.ReserveAsync(request);
var mapping = await adapter.ResolveAsync(request.Reference, request.Namespace);
Console.WriteLine($"reserved={reserved} mapping={mapping}");
