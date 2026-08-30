package io.greyfoundry.identifold.storage

data class ReferenceReservation(
    val machineId: String,
    val namespace: String,
    val reference: String,
)

data class ReferenceMapping(
    val machineId: String,
    val namespace: String,
)

data class SequenceAllocationRequest(
    val machineId: String,
    val namespace: String,
    val referencePrefix: String,
    val scope: String?,
    val width: Int,
)

interface StorageAdapter {
    suspend fun reserve(request: ReferenceReservation): Boolean

    suspend fun resolve(reference: String, namespace: String): ReferenceMapping?

    suspend fun allocate(request: SequenceAllocationRequest): Long
}
