package io.greyfoundry.identifold.storage.sqlite

import io.greyfoundry.identifold.storage.ReferenceReservation
import io.greyfoundry.identifold.storage.SequenceAllocationRequest
import java.nio.file.Files
import java.nio.file.Path
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.sqlite.SQLiteDataSource

class SqliteStorageAdapterTest {
    @Test
    fun reservesAllocatesReplaysAndResolves() = runBlocking {
        val dataSource = SQLiteDataSource().apply {
            url = "jdbc:sqlite:file:identifold-kotlin?mode=memory&cache=shared"
        }
        val keeper = dataSource.connection
        val root = Path.of("..", "..").toAbsolutePath().normalize()
        val migration = Files.readString(
            root.resolve("integrations/sqlite/migrations/001_identifold.up.sql"),
        )
        keeper.createStatement().use { statement ->
            migration.split(';').filter(String::isNotBlank).forEach(statement::execute)
        }

        try {
            val adapter = KotlinSqliteStorageAdapter(dataSource)
            val randomMid = "01890f8c-7b2a-7cc3-98b0-112233445566"
            val randomRef = "ORD-0123-4567-89-P"
            assertTrue(adapter.reserve(ReferenceReservation(randomMid, "order", randomRef)))
            assertFalse(
                adapter.reserve(
                    ReferenceReservation(
                        "01890f8c-7b2a-7cc3-98b0-112233445569",
                        "order",
                        randomRef,
                    ),
                ),
            )
            val randomMapping = adapter.resolve(randomRef, "order")
            assertNotNull(randomMapping)
            assertEquals(randomMid, randomMapping?.machineId)

            val request = SequenceAllocationRequest(
                "01890f8c-7b2a-7cc3-98b0-112233445567",
                "receipt",
                "RCT",
                null,
                4,
            )
            assertEquals(1L, adapter.allocate(request))
            assertEquals(1L, adapter.allocate(request))
            val sequenceMapping = adapter.resolve("RCT-0001-1", "receipt")
            assertNotNull(sequenceMapping)
            assertEquals(request.machineId, sequenceMapping?.machineId)
        } finally {
            keeper.close()
        }
    }
}
