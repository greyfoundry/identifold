package io.greyfoundry.identifold.storage;

import java.util.concurrent.CompletableFuture;

public final class StorageContractTest {
    public static void main(String[] args) {
        StorageAdapter adapter = new StorageAdapter() {
            public CompletableFuture<Boolean> reserve(ReferenceReservation request) {
                return CompletableFuture.completedFuture(true);
            }

            public CompletableFuture<ReferenceMapping> resolve(String reference, String namespace) {
                return CompletableFuture.completedFuture(new ReferenceMapping(
                    "01890f8c-7b2a-7cc3-98b0-112233445566", namespace));
            }

            public CompletableFuture<Long> allocate(SequenceAllocationRequest request) {
                return CompletableFuture.completedFuture(1L);
            }
        };
        var reservation = new ReferenceReservation(
            "01890f8c-7b2a-7cc3-98b0-112233445566", "order", "ORD-0123-4567-89-P");
        if (!adapter.reserve(reservation).toCompletableFuture().join()) throw new AssertionError("reserve");
        if (!adapter.resolve(reservation.reference(), reservation.namespace()).toCompletableFuture().join().machineId()
            .equals(reservation.machineId())) throw new AssertionError("resolve");
        if (adapter.allocate(new SequenceAllocationRequest(
            reservation.machineId(), "receipt", "RCT", null, 4)).toCompletableFuture().join() != 1L) {
            throw new AssertionError("allocate");
        }
    }
}
