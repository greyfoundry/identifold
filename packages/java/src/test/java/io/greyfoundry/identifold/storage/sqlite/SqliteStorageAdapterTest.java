package io.greyfoundry.identifold.storage.sqlite;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.greyfoundry.identifold.storage.ReferenceReservation;
import io.greyfoundry.identifold.storage.SequenceAllocationRequest;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.sqlite.SQLiteDataSource;

final class SqliteStorageAdapterTest {
    @Test
    void reservesAllocatesReplaysAndResolves() throws Exception {
        var dataSource = new SQLiteDataSource();
        dataSource.setUrl("jdbc:sqlite:file:identifold-java?mode=memory&cache=shared");
        var keeper = dataSource.getConnection();
        var root = Path.of("..", "..").toAbsolutePath().normalize();
        var migration = Files.readString(
            root.resolve("integrations/sqlite/migrations/001_identifold.up.sql"));
        try (var statement = keeper.createStatement()) {
            for (var sql : migration.split(";")) {
                if (!sql.isBlank()) statement.execute(sql);
            }
        }

        try {
            var adapter = new SqliteStorageAdapter(dataSource, Runnable::run);
            var randomMid = "01890f8c-7b2a-7cc3-98b0-112233445566";
            var randomRef = "ORD-0123-4567-89-P";
            assertTrue(adapter.reserve(new ReferenceReservation(randomMid, "order", randomRef))
                .toCompletableFuture().join());
            assertFalse(adapter.reserve(new ReferenceReservation(
                "01890f8c-7b2a-7cc3-98b0-112233445569", "order", randomRef))
                .toCompletableFuture().join());
            var mapping = adapter.resolve(randomRef, "order").toCompletableFuture().join();
            assertNotNull(mapping);
            assertEquals(randomMid, mapping.machineId());
            try (var statement = keeper.createStatement();
                 var result = statement.executeQuery(
                     "SELECT hex(machine_id) FROM identifold_references")) {
                assertTrue(result.next());
                assertEquals(randomMid.replace("-", "").toUpperCase(), result.getString(1));
            }

            var request = new SequenceAllocationRequest(
                "01890f8c-7b2a-7cc3-98b0-112233445567", "receipt", "RCT", null, 4);
            assertEquals(1L, adapter.allocate(request).toCompletableFuture().join());
            assertEquals(1L, adapter.allocate(request).toCompletableFuture().join());
            assertEquals(request.machineId(), adapter.resolve("RCT-0001-1", "receipt")
                .toCompletableFuture().join().machineId());
        } finally {
            keeper.close();
        }
    }
}
