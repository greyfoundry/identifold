from __future__ import annotations

import asyncio
import sqlite3
from pathlib import Path

import pytest

from identifold import IdentifoldError
from identifold.storage import (
    ReferenceMapping,
    ReferenceReservation,
    SequenceAllocationRequest,
)
from identifold.storage.sqlite import SqliteStorageAdapter


def test_sqlite_adapter_contract() -> None:
    async def exercise() -> None:
        connection = sqlite3.connect(":memory:", isolation_level=None)
        connection.row_factory = sqlite3.Row
        root = Path(__file__).parents[3]
        connection.executescript(
            (root / "integrations/sqlite/migrations/001_identifold.up.sql").read_text()
        )
        adapter = SqliteStorageAdapter(connection)

        random_mid = "01890f8c-7b2a-7cc3-98b0-112233445566"
        random_ref = "ORD-0123-4567-89-P"
        assert await adapter.reserve(
            ReferenceReservation(random_mid, "order", random_ref)
        )
        assert not await adapter.reserve(
            ReferenceReservation(
                "01890f8c-7b2a-7cc3-98b0-112233445569",
                "order",
                random_ref,
            )
        )
        assert await adapter.resolve(random_ref, "order") == ReferenceMapping(
            random_mid, "order"
        )
        stored = connection.execute(
            "SELECT hex(machine_id) FROM identifold_references"
        ).fetchone()
        assert stored is not None
        assert stored[0] == random_mid.replace("-", "").upper()

        sequence_mid = "01890f8c-7b2a-7cc3-98b0-112233445567"
        request = SequenceAllocationRequest(sequence_mid, "receipt", "RCT", None, 4)
        assert await adapter.allocate(request) == 1
        assert await adapter.allocate(request) == 1
        assert await adapter.resolve("RCT-0001-1", "receipt") == ReferenceMapping(
            sequence_mid, "receipt"
        )
        with pytest.raises(IdentifoldError) as invalid:
            await adapter.allocate(
                SequenceAllocationRequest(sequence_mid, "receipt", "RCT", None, 5)
            )
        assert invalid.value.code == "invalid_allocation_policy"

        connection.executescript(
            """
            DELETE FROM identifold_sequence_allocations;
            DELETE FROM identifold_sequences;
            CREATE TRIGGER identifold_test_reject_allocation
            BEFORE INSERT ON identifold_sequence_allocations
            BEGIN
              SELECT RAISE(ABORT, 'injected_failure');
            END;
            """
        )
        with pytest.raises(IdentifoldError) as conflict:
            await adapter.allocate(
                SequenceAllocationRequest(
                    "01890f8c-7b2a-7cc3-98b0-112233445568",
                    "receipt",
                    "RCT",
                    None,
                    4,
                )
            )
        assert conflict.value.code == "allocation_conflict"
        assert connection.execute(
            "SELECT count(*) FROM identifold_sequences"
        ).fetchone()[0] == 0
        connection.close()

    asyncio.run(exercise(), loop_factory=asyncio.SelectorEventLoop)
