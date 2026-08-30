from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class ReferenceReservation:
    machine_id: str
    namespace: str
    reference: str


@dataclass(frozen=True, slots=True)
class ReferenceMapping:
    machine_id: str
    namespace: str


@dataclass(frozen=True, slots=True)
class SequenceAllocationRequest:
    machine_id: str
    namespace: str
    reference_prefix: str
    scope: str | None
    width: int


class ReferenceStore(Protocol):
    async def reserve(self, reservation: ReferenceReservation) -> bool: ...


class ReferenceLookup(Protocol):
    async def resolve(
        self, reference: str, namespace: str
    ) -> ReferenceMapping | None: ...


class SequenceAllocator(Protocol):
    async def allocate(self, request: SequenceAllocationRequest) -> int: ...


class StorageAdapter(ReferenceStore, ReferenceLookup, SequenceAllocator, Protocol):
    pass


@dataclass(frozen=True, slots=True)
class IdentifoldStorageAdapter:
    reference_store: ReferenceStore
    reference_lookup: ReferenceLookup
    sequence_allocator: SequenceAllocator
