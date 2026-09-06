from __future__ import annotations

import asyncio
import os
from urllib.parse import urlparse

from identifold.storage import ReferenceReservation
from identifold.storage.mysql import MySQLStorageAdapter


async def main() -> None:
    from mysql.connector.aio import connect

    value = os.environ["IDENTIFOLD_TEST_MYSQL_URL"]
    url = urlparse(value)
    connection = await connect(
        host=url.hostname or "127.0.0.1",
        port=url.port or 3306,
        user=url.username,
        password=url.password,
        database=url.path.lstrip("/"),
        autocommit=True,
    )
    try:
        adapter = MySQLStorageAdapter(connection)
        request = ReferenceReservation(
            "01890f8c-7b2a-7cc3-98b0-112233445568",
            "order",
            "ORD-9876-5432-10-X",
        )
        reserved = await adapter.reserve(request)
        mapping = await adapter.resolve(request.reference, request.namespace)
        print({"reserved": reserved, "mapping": mapping})
    finally:
        await connection.close()


if __name__ == "__main__":
    asyncio.run(main(), loop_factory=asyncio.SelectorEventLoop)
