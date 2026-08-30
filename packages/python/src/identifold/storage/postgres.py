from __future__ import annotations

from typing import Any, Protocol

from identifold import IdentifoldError

from .base import (
    ReferenceMapping,
    ReferenceReservation,
    SequenceAllocationRequest,
    StorageAdapter,
)


class AsyncCursor(Protocol):
    async def fetchone(self) -> tuple[Any, ...] | None: ...


class AsyncPostgresConnection(Protocol):
    async def execute(
        self, query: str, params: tuple[object, ...] = ()
    ) -> AsyncCursor: ...


class PostgresStorageAdapter(StorageAdapter):
    """Storage adapter for a caller-owned psycopg-compatible async connection."""

    def __init__(self, connection: AsyncPostgresConnection) -> None:
        self._connection = connection

    async def reserve(self, request: ReferenceReservation) -> bool:
        row = await self._query_one(
            "SELECT identifold_reserve_reference(%s::uuid, %s::text, %s::text)",
            (request.machine_id, request.namespace, request.reference),
        )
        if row is None or len(row) != 1 or not isinstance(row[0], bool):
            raise IdentifoldError(
                "allocation_conflict",
                "Reference reservation returned an invalid result",
            )
        return row[0]

    async def resolve(self, reference: str, namespace: str) -> ReferenceMapping | None:
        row = await self._query_one(
            "SELECT resolved_machine_id::text, resolved_namespace "
            "FROM identifold_resolve_reference(%s::text, %s::text)",
            (reference, namespace),
        )
        if row is None:
            return None
        if len(row) != 2 or not isinstance(row[0], str) or not isinstance(row[1], str):
            raise IdentifoldError(
                "allocation_conflict", "Reference lookup returned an invalid result"
            )
        return ReferenceMapping(row[0], row[1])

    async def allocate(self, request: SequenceAllocationRequest) -> int:
        row = await self._query_one(
            "SELECT identifold_allocate_sequence(%s::uuid, %s::text, %s::text, %s::text, %s::smallint)",
            (
                request.machine_id,
                request.namespace,
                request.reference_prefix,
                request.scope,
                request.width,
            ),
        )
        if (
            row is None
            or len(row) != 1
            or isinstance(row[0], bool)
            or not isinstance(row[0], int)
            or row[0] < 0
        ):
            raise IdentifoldError(
                "allocation_conflict", "Sequence allocation returned an invalid result"
            )
        return row[0]

    async def _query_one(
        self, query: str, params: tuple[object, ...]
    ) -> tuple[Any, ...] | None:
        try:
            cursor = await self._connection.execute(query, params)
            return await cursor.fetchone()
        except IdentifoldError:
            raise
        except Exception as error:  # noqa: BLE001 - drivers expose distinct exception trees
            sqlstate = getattr(error, "sqlstate", None)
            if sqlstate == "22003":
                raise IdentifoldError(
                    "sequence_overflow", "Sequential reference capacity is exhausted"
                ) from None
            if sqlstate == "22023":
                raise IdentifoldError(
                    "invalid_allocation_policy",
                    "Sequential allocation policy is invalid",
                ) from None
            raise IdentifoldError(
                "allocation_conflict", "Database operation could not be committed"
            ) from None
