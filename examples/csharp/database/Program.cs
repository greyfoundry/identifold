using Greyfoundry.Identifold.Storage;
using Greyfoundry.Identifold.Storage.Postgres;
using Npgsql;

var uri = new Uri(Environment.GetEnvironmentVariable("DATABASE_URL")
    ?? throw new InvalidOperationException("DATABASE_URL is required"));
var credentials = uri.UserInfo.Split(':', 2);
var dataSource = NpgsqlDataSource.Create(new NpgsqlConnectionStringBuilder
{
    Host = uri.Host,
    Port = uri.Port,
    Database = uri.AbsolutePath.TrimStart('/'),
    Username = credentials[0],
    Password = credentials[1],
}.ConnectionString);
await using (dataSource)
{
    var adapter = new PostgresStorageAdapter(dataSource);
    var request = new ReferenceReservation(
        "01890f8c-7b2a-7cc3-98b0-112233445566", "order", "ORD-0123-4567-89-P");
    var reserved = await adapter.ReserveAsync(request);
    var mapping = await adapter.ResolveAsync(request.Reference, request.Namespace);
    Console.WriteLine($"reserved={reserved} mapping={mapping}");
}
