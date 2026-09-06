from __future__ import annotations

import asyncio
import os
from urllib.parse import urlparse

import pytest

from identifold import IdentifoldError
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

            contender_mids = [
                f"01890f8c-7b2a-7cc3-98b1-{index:012x}" for index in range(20)
            ]
            contender_results = await asyncio.gather(
                *(
                    adapter.reserve(
                        ReferenceReservation(mid, "order", "ORD-CONCURRENT-X")
                    )
                    for mid in contender_mids
                )
            )
            assert contender_results.count(True) == 1

            cursor = await connection.cursor()
            try:
                await cursor.execute(
                    "SELECT HEX(machine_id) FROM identifold_references "
                    "WHERE reference = %s",
                    (random_ref,),
                )
                stored = await cursor.fetchall()
                assert stored == [(random_mid.replace("-", "").upper(),)]
            finally:
                await cursor.close()

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

            concurrent_requests = [
                SequenceAllocationRequest(
                    f"01890f8c-7b2a-7cc3-98b2-{index:012x}",
                    "invoice",
                    "INV",
                    None,
                    4,
                )
                for index in range(32)
            ]
            allocated = await asyncio.gather(
                *(adapter.allocate(item) for item in concurrent_requests)
            )
            assert sorted(allocated) == list(range(1, 33))

            with pytest.raises(IdentifoldError) as invalid:
                await adapter.allocate(
                    SequenceAllocationRequest(
                        request.machine_id, "receipt", "RCT", None, 5
                    )
                )
            assert invalid.value.code == "invalid_allocation_policy"

            cursor = await connection.cursor()
            try:
                await cursor.execute(
                    "INSERT INTO identifold_sequences VALUES (%s, %s, %s, %s, %s)",
                    ("overflow", "", "OVR", 4, 9999),
                )
            finally:
                await cursor.close()
            with pytest.raises(IdentifoldError) as overflow:
                await adapter.allocate(
                    SequenceAllocationRequest(
                        "01890f8c-7b2a-7cc3-98b3-112233445568",
                        "overflow",
                        "OVR",
                        None,
                        4,
                    )
                )
            assert overflow.value.code == "sequence_overflow"
            cursor = await connection.cursor()
            try:
                await cursor.execute(
                    "SELECT counter_value FROM identifold_sequences "
                    "WHERE namespace = %s",
                    ("overflow",),
                )
                assert await cursor.fetchall() == [(9999,)]
            finally:
                await cursor.close()
        finally:
            await connection.close()

    asyncio.run(exercise(), loop_factory=asyncio.SelectorEventLoop)
