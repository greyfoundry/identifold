from __future__ import annotations

import asyncio

from identifold.storage import (
    IdentifoldStorageAdapter,
    ReferenceMapping,
    ReferenceReservation,
    SequenceAllocationRequest,
)


class FakeStorage:
    async def reserve(self, reservation: ReferenceReservation) -> bool:
        return reservation.reference == "ORD-0123-4567-89-P"

    async def resolve(self, reference: str, namespace: str) -> ReferenceMapping | None:
        return ReferenceMapping(
            machine_id="01890f8c-7b2a-7cc3-98b0-112233445566",
            namespace=namespace,
        )

    async def allocate(self, request: SequenceAllocationRequest) -> int:
        return 1


def test_storage_adapter_exposes_all_operations() -> None:
    async def exercise() -> None:
        fake = FakeStorage()
        adapter = IdentifoldStorageAdapter(fake, fake, fake)
        reservation = ReferenceReservation(
            machine_id="01890f8c-7b2a-7cc3-98b0-112233445566",
            namespace="order",
            reference="ORD-0123-4567-89-P",
        )
        assert await adapter.reference_store.reserve(reservation)
        mapping = await adapter.reference_lookup.resolve(reservation.reference, "order")
        assert mapping == ReferenceMapping(reservation.machine_id, "order")
        sequence = await adapter.sequence_allocator.allocate(
            SequenceAllocationRequest(reservation.machine_id, "receipt", "RCT", None, 4)
        )
        assert sequence == 1

    asyncio.run(exercise())
