from __future__ import annotations

import asyncio
import os
from pathlib import Path

import pytest

from identifold.storage import (
    ReferenceMapping,
    ReferenceReservation,
    SequenceAllocationRequest,
)
from identifold.storage.postgres import PostgresStorageAdapter

psycopg = pytest.importorskip("psycopg")


def test_postgres_adapter_reserves_allocates_and_resolves() -> None:
    database_url = os.environ.get("IDENTIFOLD_TEST_DATABASE_URL")
    if database_url is None:
        pytest.skip("IDENTIFOLD_TEST_DATABASE_URL is not configured")

    async def exercise() -> None:
        async with await psycopg.AsyncConnection.connect(database_url) as connection:
            root = Path(__file__).parents[3]
            await connection.execute(
                (
                    root / "integrations/postgres/migrations/001_identifold.down.sql"
                ).read_text()
            )
            for migration in (
                "001_identifold.up.sql",
                "003_idempotent_replay.up.sql",
                "004_reference_lookup.up.sql",
            ):
                await connection.execute(
                    (root / "integrations/postgres/migrations" / migration).read_text()
                )
            await connection.commit()

            adapter = PostgresStorageAdapter(connection)
            random_mid = "01890f8c-7b2a-7cc3-98b0-112233445566"
            random_ref = "ORD-0123-4567-89-P"
            assert await adapter.reserve(
                ReferenceReservation(random_mid, "order", random_ref)
            )
            assert await adapter.resolve(random_ref, "order") == ReferenceMapping(
                random_mid, "order"
            )

            sequence_mid = "01890f8c-7b2a-7cc3-98b0-112233445567"
            request = SequenceAllocationRequest(sequence_mid, "receipt", "RCT", None, 4)
            assert await adapter.allocate(request) == 1
            assert await adapter.allocate(request) == 1
            assert await adapter.resolve("RCT-0001-1", "receipt") == ReferenceMapping(
                sequence_mid, "receipt"
            )

    asyncio.run(exercise(), loop_factory=asyncio.SelectorEventLoop)
