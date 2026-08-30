from __future__ import annotations

import asyncio
import re
import sqlite3
import uuid

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


class SqliteStorageAdapter(StorageAdapter):
    """SQLite adapter using a caller-owned, autocommit connection."""

    def __init__(self, connection: sqlite3.Connection) -> None:
        self._connection = connection
        self._lock = asyncio.Lock()

    async def reserve(self, request: ReferenceReservation) -> bool:
        async with self._lock:
            try:
                cursor = self._connection.execute(
                    "INSERT INTO identifold_references "
                    "(reference, namespace, machine_id) VALUES (?, ?, ?) "
                    "ON CONFLICT(reference) DO NOTHING",
                    (
                        request.reference,
                        request.namespace,
                        uuid.UUID(request.machine_id).bytes,
                    ),
                )
                return cursor.rowcount == 1
            except (sqlite3.Error, ValueError):
                raise IdentifoldError(
                    "allocation_conflict", "Database operation could not be committed"
                ) from None

    async def resolve(self, reference: str, namespace: str) -> ReferenceMapping | None:
        async with self._lock:
            try:
                row = self._connection.execute(
                    "SELECT machine_id, namespace FROM identifold_references "
                    "WHERE reference = ? AND namespace = ?",
                    (reference, namespace),
                ).fetchone()
                if row is None:
                    parts = _SEQUENTIAL_REFERENCE.fullmatch(reference)
                    if parts is None:
                        return None
                    row = self._connection.execute(
                        "SELECT machine_id, namespace "
                        "FROM identifold_sequence_allocations "
                        "WHERE namespace = ? AND reference_prefix = ? "
                        "AND scope = ? AND sequence = ?",
                        (
                            namespace,
                            parts.group(1),
                            parts.group(2) or "",
                            int(parts.group(3)),
                        ),
                    ).fetchone()
                if row is None:
                    return None
                return ReferenceMapping(str(uuid.UUID(bytes=bytes(row[0]))), str(row[1]))
            except (sqlite3.Error, ValueError, TypeError):
                raise IdentifoldError(
                    "allocation_conflict", "Database operation could not be committed"
                ) from None

    async def allocate(self, request: SequenceAllocationRequest) -> int:
        if request.width < 4 or request.width > 18:
            raise IdentifoldError(
                "invalid_allocation_policy",
                "Sequential allocation policy is invalid",
            )
        async with self._lock:
            try:
                self._connection.execute("BEGIN IMMEDIATE")
                scope = request.scope or ""
                machine_id = uuid.UUID(request.machine_id).bytes
                existing = self._connection.execute(
                    "SELECT sequence, reference_prefix, width "
                    "FROM identifold_sequence_allocations "
                    "WHERE namespace = ? AND scope = ? AND machine_id = ?",
                    (request.namespace, scope, machine_id),
                ).fetchone()
                if existing is not None:
                    if (
                        existing[1] != request.reference_prefix
                        or existing[2] != request.width
                    ):
                        raise IdentifoldError(
                            "invalid_allocation_policy",
                            "Sequential allocation policy is invalid",
                        )
                    self._connection.execute("COMMIT")
                    return int(existing[0])

                self._connection.execute(
                    "INSERT INTO identifold_sequences "
                    "(namespace, scope, reference_prefix, width, last_value) "
                    "VALUES (?, ?, ?, ?, 0) ON CONFLICT DO NOTHING",
                    (
                        request.namespace,
                        scope,
                        request.reference_prefix,
                        request.width,
                    ),
                )
                state = self._connection.execute(
                    "SELECT reference_prefix, width, last_value "
                    "FROM identifold_sequences WHERE namespace = ? AND scope = ?",
                    (request.namespace, scope),
                ).fetchone()
                if (
                    state is None
                    or state[0] != request.reference_prefix
                    or state[1] != request.width
                ):
                    raise IdentifoldError(
                        "invalid_allocation_policy",
                        "Sequential allocation policy is invalid",
                    )
                current = int(state[2])
                if current >= 10**request.width - 1:
                    raise IdentifoldError(
                        "sequence_overflow",
                        "Sequential reference capacity is exhausted",
                    )
                allocated = current + 1
                self._connection.execute(
                    "UPDATE identifold_sequences SET last_value = ? "
                    "WHERE namespace = ? AND scope = ?",
                    (allocated, request.namespace, scope),
                )
                self._connection.execute(
                    "INSERT INTO identifold_sequence_allocations "
                    "(namespace, scope, sequence, machine_id, reference_prefix, width) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        request.namespace,
                        scope,
                        allocated,
                        machine_id,
                        request.reference_prefix,
                        request.width,
                    ),
                )
                self._connection.execute("COMMIT")
                return allocated
            except IdentifoldError:
                self._rollback()
                raise
            except (sqlite3.Error, ValueError, TypeError):
                self._rollback()
                raise IdentifoldError(
                    "allocation_conflict", "Database operation could not be committed"
                ) from None

    def _rollback(self) -> None:
        if self._connection.in_transaction:
            self._connection.execute("ROLLBACK")
