using Greyfoundry.Identifold;
using Greyfoundry.Identifold.Storage;

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
