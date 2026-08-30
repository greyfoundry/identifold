namespace Greyfoundry.Identifold.Storage;

public sealed record ReferenceReservation(
    string MachineId,
    string Namespace,
    string Reference);

public sealed record ReferenceMapping(string MachineId, string Namespace);

public sealed record SequenceAllocationRequest(
    string MachineId,
    string Namespace,
    string ReferencePrefix,
    string? Scope,
    byte Width);

public interface IStorageAdapter
{
    ValueTask<bool> ReserveAsync(
        ReferenceReservation request,
        CancellationToken cancellationToken = default);

    ValueTask<ReferenceMapping?> ResolveAsync(
        string reference,
        string namespaceName,
        CancellationToken cancellationToken = default);

    ValueTask<ulong> AllocateAsync(
        SequenceAllocationRequest request,
        CancellationToken cancellationToken = default);
}
