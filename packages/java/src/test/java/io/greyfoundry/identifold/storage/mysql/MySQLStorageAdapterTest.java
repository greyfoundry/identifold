package io.greyfoundry.identifold.storage.mysql;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.mysql.cj.jdbc.MysqlDataSource;
import io.greyfoundry.identifold.storage.ReferenceReservation;
import io.greyfoundry.identifold.storage.SequenceAllocationRequest;
import java.net.URI;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;

final class MySQLStorageAdapterTest {
    @Test
    void reservesAllocatesAndResolves() throws Exception {
        var databaseUrl = System.getenv("IDENTIFOLD_TEST_MYSQL_URL");
        Assumptions.assumeTrue(databaseUrl != null);
        var uri = URI.create(databaseUrl);
        var credentials = uri.getUserInfo().split(":", 2);
        var dataSource = new MysqlDataSource();
        dataSource.setUrl("jdbc:mysql://" + uri.getHost() + ":" + uri.getPort() + uri.getPath());
        dataSource.setUser(credentials[0]);
        dataSource.setPassword(credentials[1]);

        try (var connection = dataSource.getConnection();
             var statement = connection.createStatement()) {
            statement.executeUpdate("DELETE FROM identifold_sequence_allocations");
            statement.executeUpdate("DELETE FROM identifold_sequences");
            statement.executeUpdate("DELETE FROM identifold_references");
        }

        var adapter = new MySQLStorageAdapter(dataSource, Runnable::run);
        var randomMid = "01890f8c-7b2a-7cc3-98b0-112233445566";
        var randomRef = "ORD-0123-4567-89-P";
        assertTrue(adapter.reserve(new ReferenceReservation(randomMid, "order", randomRef))
            .toCompletableFuture().join());
        var mapping = adapter.resolve(randomRef, "order").toCompletableFuture().join();
        assertNotNull(mapping);
        assertEquals(randomMid, mapping.machineId());

        var request = new SequenceAllocationRequest(
            "01890f8c-7b2a-7cc3-98b0-112233445567", "receipt", "RCT", null, 4);
        assertEquals(1L, adapter.allocate(request).toCompletableFuture().join());
        assertEquals(1L, adapter.allocate(request).toCompletableFuture().join());
        assertEquals(request.machineId(), adapter.resolve("RCT-0001-1", "receipt")
            .toCompletableFuture().join().machineId());
    }
}
