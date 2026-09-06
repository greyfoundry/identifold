using Greyfoundry.Identifold.Storage;
using Greyfoundry.Identifold.Storage.MySql;

var connectionString = Environment.GetEnvironmentVariable("IDENTIFOLD_TEST_MYSQL_URL")
    ?? throw new InvalidOperationException("IDENTIFOLD_TEST_MYSQL_URL is required");
var adapter = new MySqlStorageAdapter(connectionString);
var request = new ReferenceReservation(
    "01890f8c-7b2a-7cc3-98b0-112233445568", "order", "ORD-9876-5432-10-X");
var reserved = await adapter.ReserveAsync(request);
var mapping = await adapter.ResolveAsync(request.Reference, request.Namespace);
Console.WriteLine($"reserved={reserved} mapping={mapping}");
