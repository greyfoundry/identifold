package io.greyfoundry.identifold.storage.postgres

import io.greyfoundry.identifold.storage.ReferenceReservation
import io.greyfoundry.identifold.storage.SequenceAllocationRequest
import java.net.URI
import java.nio.file.Files
import java.nio.file.Path
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test
import org.postgresql.ds.PGSimpleDataSource

class PostgresStorageAdapterTest {
    @Test
    fun reservesAllocatesAndResolves() = runBlocking {
        val databaseUrl = System.getenv("IDENTIFOLD_TEST_DATABASE_URL")
        assumeTrue(databaseUrl != null)
        val uri = URI.create(databaseUrl)
        val credentials = uri.userInfo.split(":", limit = 2)
        val dataSource = PGSimpleDataSource().apply {
            serverNames = arrayOf(uri.host)
            portNumbers = intArrayOf(uri.port)
            databaseName = uri.path.removePrefix("/")
            user = credentials[0]
            password = credentials[1]
        }
        dataSource.connection.use { connection ->
            val root = Path.of("..", "..").toAbsolutePath().normalize()
            listOf(
                "001_identifold.down.sql",
                "001_identifold.up.sql",
                "003_idempotent_replay.up.sql",
                "004_reference_lookup.up.sql",
            ).forEach { migration ->
                val script = Files.readString(root.resolve("integrations/postgres/migrations/$migration"))
                connection.createStatement().use { it.execute(script) }
            }
        }

        val adapter = KotlinPostgresStorageAdapter(dataSource, Dispatchers.Unconfined)
        val randomMid = "01890f8c-7b2a-7cc3-98b0-112233445566"
        val randomRef = "ORD-0123-4567-89-P"
        assertTrue(adapter.reserve(ReferenceReservation(randomMid, "order", randomRef)))
        val mapping = adapter.resolve(randomRef, "order")
        assertNotNull(mapping)
        assertEquals(randomMid, mapping?.machineId)

        val request = SequenceAllocationRequest(
            "01890f8c-7b2a-7cc3-98b0-112233445567",
            "receipt",
            "RCT",
            null,
            4,
        )
        assertEquals(1, adapter.allocate(request))
        assertEquals(1, adapter.allocate(request))
        assertEquals(request.machineId, adapter.resolve("RCT-0001-1", "receipt")?.machineId)
    }
}
