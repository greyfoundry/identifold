package io.greyfoundry.identifold.storage.mysql

import com.mysql.cj.jdbc.MysqlDataSource
import io.greyfoundry.identifold.storage.ReferenceReservation
import io.greyfoundry.identifold.storage.SequenceAllocationRequest
import java.net.URI
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.Test

class MySQLStorageAdapterTest {
    @Test
    fun reservesAllocatesAndResolves() = runBlocking {
        val databaseUrl = System.getenv("IDENTIFOLD_TEST_MYSQL_URL")
        assumeTrue(databaseUrl != null)
        val uri = URI.create(databaseUrl)
        val credentials = uri.userInfo.split(":", limit = 2)
        val dataSource = MysqlDataSource().apply {
            setUrl("jdbc:mysql://${uri.host}:${uri.port}${uri.path}")
            user = credentials[0]
            password = credentials[1]
        }
        dataSource.connection.use { connection ->
            connection.createStatement().use { statement ->
                statement.executeUpdate("DELETE FROM identifold_sequence_allocations")
                statement.executeUpdate("DELETE FROM identifold_sequences")
                statement.executeUpdate("DELETE FROM identifold_references")
            }
        }

        val adapter = KotlinMySQLStorageAdapter(dataSource, Dispatchers.Unconfined)
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
