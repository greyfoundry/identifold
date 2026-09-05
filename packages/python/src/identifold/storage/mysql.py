from __future__ import annotations

import asyncio
import re
import uuid
from typing import Any, Protocol

from identifold import IdentifoldError

from .base import (
    ReferenceMapping,
    ReferenceReservation,
    SequenceAllocationRequest,
    StorageAdapter,
)

_SEQUENTIAL_REFERENCE = re.compile(
    r"^([A-Z]{2,8})-(?:(\d{4})-)?(\d{4,18})-[0-9A-Z*~$=U]$"
)


class AsyncMySQLCursor(Protocol):
    async def execute(self, query: str, params: tuple[object, ...]) -> None: ...

    async def fetchall(self) -> list[tuple[Any, ...]]: ...

    async def nextset(self) -> bool | None: ...

    async def close(self) -> None: ...


class AsyncMySQLConnection(Protocol):
    async def cursor(self, *, buffered: bool = False) -> AsyncMySQLCursor: ...


class MySQLStorageAdapter(StorageAdapter):
    """MySQL and MariaDB adapter for a caller-owned asynchronous connection."""

    def __init__(self, connection: AsyncMySQLConnection) -> None:
        self._connection = connection
        self._lock = asyncio.Lock()

    async def reserve(self, request: ReferenceReservation) -> bool:
        row = await self._query_one(
            "CALL identifold_reserve_reference(%s, %s, %s)",
            (
                self._machine_id_bytes(request.machine_id),
                request.namespace,
                request.reference,
            ),
        )
        if (
            row is None
            or len(row) != 1
            or not isinstance(row[0], (bool, int))
            or int(row[0]) not in (0, 1)
        ):
            raise self._conflict()
        return bool(row[0])

    async def resolve(self, reference: str, namespace: str) -> ReferenceMapping | None:
        row = await self._query_one(
            "SELECT machine_id, namespace FROM identifold_references "
            "WHERE reference = %s AND namespace = %s",
            (reference, namespace),
        )
        if row is None:
            parts = _SEQUENTIAL_REFERENCE.fullmatch(reference)
            if parts is None:
                return None
            row = await self._query_one(
                "SELECT machine_id, namespace "
                "FROM identifold_sequence_allocations "
                "WHERE namespace = %s AND reference_prefix = %s "
                "AND scope = %s AND sequence = %s",
                (
                    namespace,
                    parts.group(1),
                    parts.group(2) or "",
                    int(parts.group(3)),
                ),
            )
        if row is None:
            return None
        if len(row) != 2 or not isinstance(row[1], str):
            raise self._conflict()
        try:
            machine_id = str(uuid.UUID(bytes=bytes(row[0])))
        except (TypeError, ValueError):
            raise self._conflict() from None
        return ReferenceMapping(machine_id, row[1])

    async def allocate(self, request: SequenceAllocationRequest) -> int:
        machine_id = self._machine_id_bytes(request.machine_id)
        for attempt in range(5):
            try:
                row = await self._query_one(
                    "CALL identifold_allocate_sequence(%s, %s, %s, %s, %s)",
                    (
                        machine_id,
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
                    raise self._conflict()
                return row[0]
            except IdentifoldError:
                raise
            except Exception as error:  # noqa: BLE001 - connector exception trees vary
                if attempt < 4 and self._is_transient(error):
                    await asyncio.sleep((2**attempt) / 1000)
                    continue
                raise self._map_error(error) from None
        raise self._conflict()

    async def _query_one(
        self, query: str, params: tuple[object, ...]
    ) -> tuple[Any, ...] | None:
        async with self._lock:
            cursor: AsyncMySQLCursor | None = None
            try:
                cursor = await self._connection.cursor(buffered=True)
                await cursor.execute(query, params)
                rows = await cursor.fetchall()
                while await cursor.nextset():
                    await cursor.fetchall()
                if len(rows) > 1:
                    raise self._conflict()
                return rows[0] if rows else None
            except IdentifoldError:
                raise
            except Exception as error:  # noqa: BLE001 - connector exception trees vary
                raise self._map_error(error) from None
            finally:
                if cursor is not None:
                    await cursor.close()

    @staticmethod
    def _machine_id_bytes(value: str) -> bytes:
        try:
            return uuid.UUID(value).bytes
        except (AttributeError, ValueError):
            raise MySQLStorageAdapter._conflict() from None

    @staticmethod
    def _map_error(error: Exception) -> IdentifoldError:
        if isinstance(error, IdentifoldError):
            return error
        sqlstate = getattr(error, "sqlstate", None)
        if sqlstate == "22003":
            return IdentifoldError(
                "sequence_overflow", "Sequential reference capacity is exhausted"
            )
        if sqlstate == "22023":
            return IdentifoldError(
                "invalid_allocation_policy",
                "Sequential allocation policy is invalid",
            )
        return MySQLStorageAdapter._conflict()

    @staticmethod
    def _is_transient(error: Exception) -> bool:
        return (
            getattr(error, "errno", None) in (1205, 1213)
            or getattr(error, "sqlstate", None) == "40001"
        )

    @staticmethod
    def _conflict() -> IdentifoldError:
        return IdentifoldError(
            "allocation_conflict", "Database operation could not be committed"
        )
