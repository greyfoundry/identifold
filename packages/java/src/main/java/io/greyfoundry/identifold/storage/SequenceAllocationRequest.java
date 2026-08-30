package io.greyfoundry.identifold.storage;

public record SequenceAllocationRequest(
    String machineId,
    String namespace,
    String referencePrefix,
    String scope,
    int width
) {}
