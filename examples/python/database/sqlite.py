from __future__ import annotations

import asyncio
import sqlite3
from pathlib import Path

from identifold.storage import ReferenceReservation
from identifold.storage.sqlite import SqliteStorageAdapter


async def main() -> None:
    connection = sqlite3.connect(":memory:", isolation_level=None)
    connection.row_factory = sqlite3.Row
    try:
        root = Path(__file__).resolve().parents[3]
        connection.executescript(
            (root / "integrations/sqlite/migrations/001_identifold.up.sql").read_text()
        )
        adapter = SqliteStorageAdapter(connection)
        request = ReferenceReservation(
            "01890f8c-7b2a-7cc3-98b0-112233445566",
            "order",
            "ORD-0123-4567-89-P",
        )
        reserved = await adapter.reserve(request)
        mapping = await adapter.resolve(request.reference, request.namespace)
        print({"reserved": reserved, "mapping": mapping})
    finally:
        connection.close()


asyncio.run(main())
