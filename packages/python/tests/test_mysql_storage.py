from __future__ import annotations

import asyncio
import os
from urllib.parse import urlparse

import pytest

from identifold.storage import (
    ReferenceMapping,
    ReferenceReservation,
    SequenceAllocationRequest,
)
from identifold.storage.mysql import MySQLStorageAdapter


def test_mysql_adapter_reserves_allocates_and_resolves() -> None:
    database_url = os.getenv("IDENTIFOLD_TEST_MYSQL_URL")
    if database_url is None:
        pytest.skip("IDENTIFOLD_TEST_MYSQL_URL is not configured")

    async def exercise() -> None:
        from mysql.connector.aio import connect

        parsed = urlparse(database_url)
        connection = await connect(
            host=parsed.hostname or "127.0.0.1",
            port=parsed.port or 3306,
            user=parsed.username,
            password=parsed.password,
            database=parsed.path.lstrip("/"),
            autocommit=True,
        )
        try:
            cursor = await connection.cursor()
            try:
                for table in (
                    "identifold_sequence_allocations",
                    "identifold_sequences",
                    "identifold_references",
                ):
                    await cursor.execute(f"DELETE FROM {table}")
            finally:
                await cursor.close()

            adapter = MySQLStorageAdapter(connection)
            random_mid = "01890f8c-7b2a-7cc3-98b0-112233445566"
            random_ref = "ORD-0123-4567-89-P"
            assert await adapter.reserve(
                ReferenceReservation(random_mid, "order", random_ref)
            )
            assert await adapter.resolve(random_ref, "order") == ReferenceMapping(
                random_mid, "order"
            )

            request = SequenceAllocationRequest(
                "01890f8c-7b2a-7cc3-98b0-112233445567",
                "receipt",
                "RCT",
                None,
                4,
            )
            assert await adapter.allocate(request) == 1
            assert await adapter.allocate(request) == 1
            assert await adapter.resolve("RCT-0001-1", "receipt") == ReferenceMapping(
                request.machine_id, "receipt"
            )
        finally:
            await connection.close()

    asyncio.run(exercise(), loop_factory=asyncio.SelectorEventLoop)
