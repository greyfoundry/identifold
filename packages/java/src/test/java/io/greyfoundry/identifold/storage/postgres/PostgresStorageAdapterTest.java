package io.greyfoundry.identifold.storage.postgres;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.greyfoundry.identifold.storage.ReferenceReservation;
import io.greyfoundry.identifold.storage.SequenceAllocationRequest;
import java.nio.file.Files;
import java.nio.file.Path;
import java.net.URI;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.Test;
import org.postgresql.ds.PGSimpleDataSource;

final class PostgresStorageAdapterTest {
    @Test
    void reservesAllocatesAndResolves() throws Exception {
        var databaseUrl = System.getenv("IDENTIFOLD_TEST_DATABASE_URL");
        Assumptions.assumeTrue(databaseUrl != null);
        var uri = URI.create(databaseUrl);
        var credentials = uri.getUserInfo().split(":", 2);
        var dataSource = new PGSimpleDataSource();
        dataSource.setServerNames(new String[] {uri.getHost()});
        dataSource.setPortNumbers(new int[] {uri.getPort()});
        dataSource.setDatabaseName(uri.getPath().substring(1));
        dataSource.setUser(credentials[0]);
        dataSource.setPassword(credentials[1]);
        try (var connection = dataSource.getConnection()) {
            var root = Path.of("..", "..").toAbsolutePath().normalize();
            for (var migration : new String[] {
                "001_identifold.down.sql",
                "001_identifold.up.sql",
                "003_idempotent_replay.up.sql",
                "004_reference_lookup.up.sql"
            }) {
                var script = Files.readString(root.resolve("integrations/postgres/migrations/" + migration));
                try (var statement = connection.createStatement()) {
                    statement.execute(script);
                }
            }
        }

        var adapter = new PostgresStorageAdapter(dataSource, Runnable::run);
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
