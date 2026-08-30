from __future__ import annotations

import asyncio
import os

import psycopg
from identifold import NamespaceRegistry, create_machine_id, create_reference_candidate
from identifold.storage import ReferenceReservation
from identifold.storage.postgres import PostgresStorageAdapter


async def main() -> None:
    async with await psycopg.AsyncConnection.connect(
        os.environ["DATABASE_URL"]
    ) as connection:
        adapter = PostgresStorageAdapter(connection)
        registry = NamespaceRegistry(
            [
                {
                    "publicPrefix": "order",
                    "reference": {"prefix": "ORD", "strategy": "random"},
                }
            ]
        )
        reference = create_reference_candidate(registry, "order")
        machine_id = create_machine_id()
        reserved = await adapter.reserve(
            ReferenceReservation(machine_id, "order", reference)
        )
        mapping = await adapter.resolve(reference, "order")
        await connection.commit()
        print({"reserved": reserved, "mapping": mapping})


asyncio.run(main(), loop_factory=asyncio.SelectorEventLoop)
