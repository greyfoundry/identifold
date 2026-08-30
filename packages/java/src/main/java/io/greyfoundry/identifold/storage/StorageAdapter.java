package io.greyfoundry.identifold.storage;

import java.util.concurrent.CompletionStage;

public interface StorageAdapter {
    CompletionStage<Boolean> reserve(ReferenceReservation request);

    CompletionStage<ReferenceMapping> resolve(String reference, String namespace);

    CompletionStage<Long> allocate(SequenceAllocationRequest request);
}
