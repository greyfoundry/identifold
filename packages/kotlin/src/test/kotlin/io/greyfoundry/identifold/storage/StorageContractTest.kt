package io.greyfoundry.identifold.storage

import kotlin.coroutines.Continuation
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.startCoroutine

private class FakeStorage : StorageAdapter {
    override suspend fun reserve(request: ReferenceReservation) = true

    override suspend fun resolve(reference: String, namespace: String) =
        ReferenceMapping("01890f8c-7b2a-7cc3-98b0-112233445566", namespace)

    override suspend fun allocate(request: SequenceAllocationRequest) = 1L
}

private suspend fun exerciseStorageContract() {
    val adapter: StorageAdapter = FakeStorage()
    val reservation = ReferenceReservation(
        "01890f8c-7b2a-7cc3-98b0-112233445566",
        "order",
        "ORD-0123-4567-89-P",
    )
    check(adapter.reserve(reservation))
    check(adapter.resolve(reservation.reference, reservation.namespace)?.machineId == reservation.machineId)
    check(adapter.allocate(SequenceAllocationRequest(
        reservation.machineId, "receipt", "RCT", null, 4,
    )) == 1L)
}

fun main() {
    var failure: Throwable? = null
    ::exerciseStorageContract.startCoroutine(object : Continuation<Unit> {
        override val context = EmptyCoroutineContext
        override fun resumeWith(result: Result<Unit>) {
            failure = result.exceptionOrNull()
        }
    })
    failure?.let { throw it }
}
