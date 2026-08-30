package io.greyfoundry.identifold.storage.sqlite;

import io.greyfoundry.identifold.Identifold;
import io.greyfoundry.identifold.storage.ReferenceMapping;
import io.greyfoundry.identifold.storage.ReferenceReservation;
import io.greyfoundry.identifold.storage.SequenceAllocationRequest;
import io.greyfoundry.identifold.storage.StorageAdapter;
import java.nio.ByteBuffer;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Executor;
import java.util.regex.Pattern;
import javax.sql.DataSource;

public final class SqliteStorageAdapter implements StorageAdapter {
    private static final Pattern SEQUENTIAL_REFERENCE = Pattern.compile(
        "^([A-Z]{2,8})-(?:([0-9]{4})-)?([0-9]{4,18})-[0-9A-Z*~$=U]$");

    private final DataSource dataSource;
    private final Executor executor;

    public SqliteStorageAdapter(DataSource dataSource, Executor executor) {
        this.dataSource = Objects.requireNonNull(dataSource, "dataSource");
        this.executor = Objects.requireNonNull(executor, "executor");
    }

    @Override
    public CompletionStage<Boolean> reserve(ReferenceReservation request) {
        return CompletableFuture.supplyAsync(() -> {
            try (var connection = dataSource.getConnection();
                 var statement = connection.prepareStatement(
                     "INSERT INTO identifold_references "
                         + "(reference, namespace, machine_id) VALUES (?, ?, ?) "
                         + "ON CONFLICT(reference) DO NOTHING")) {
                statement.setString(1, request.reference());
                statement.setString(2, request.namespace());
                statement.setBytes(3, machineIdBytes(request.machineId()));
                return statement.executeUpdate() == 1;
            } catch (SQLException | IllegalArgumentException exception) {
                throw failure("allocation_conflict");
            }
        }, executor);
    }

    @Override
    public CompletionStage<ReferenceMapping> resolve(String reference, String namespace) {
        return CompletableFuture.supplyAsync(() -> {
            try (var connection = dataSource.getConnection()) {
                var mapping = resolveRandom(connection, reference, namespace);
                if (mapping != null) return mapping;
                var matcher = SEQUENTIAL_REFERENCE.matcher(reference);
                if (!matcher.matches()) return null;
                try (var statement = connection.prepareStatement(
                    "SELECT machine_id, namespace FROM identifold_sequence_allocations "
                        + "WHERE namespace = ? AND reference_prefix = ? "
                        + "AND scope = ? AND sequence = ?")) {
                    statement.setString(1, namespace);
                    statement.setString(2, matcher.group(1));
                    statement.setString(3, matcher.group(2) == null ? "" : matcher.group(2));
                    statement.setString(4, matcher.group(3));
                    try (var result = statement.executeQuery()) {
                        if (!result.next()) return null;
                        return new ReferenceMapping(
                            bytesMachineId(result.getBytes(1)), result.getString(2));
                    }
                }
            } catch (SQLException | IllegalArgumentException exception) {
                throw failure("allocation_conflict");
            }
        }, executor);
    }

    @Override
    public CompletionStage<Long> allocate(SequenceAllocationRequest request) {
        return CompletableFuture.supplyAsync(() -> allocateSynchronously(request), executor);
    }

    private long allocateSynchronously(SequenceAllocationRequest request) {
        if (request.width() < 4 || request.width() > 18) {
            throw failure("invalid_allocation_policy");
        }
        try (var connection = dataSource.getConnection()) {
            beginImmediate(connection);
            try {
                var scope = request.scope() == null ? "" : request.scope();
                var machineId = machineIdBytes(request.machineId());
                try (var statement = connection.prepareStatement(
                    "SELECT sequence, reference_prefix, width "
                        + "FROM identifold_sequence_allocations "
                        + "WHERE namespace = ? AND scope = ? AND machine_id = ?")) {
                    statement.setString(1, request.namespace());
                    statement.setString(2, scope);
                    statement.setBytes(3, machineId);
                    try (var result = statement.executeQuery()) {
                        if (result.next()) {
                            if (!request.referencePrefix().equals(result.getString(2))
                                || request.width() != result.getInt(3)) {
                                throw failure("invalid_allocation_policy");
                            }
                            var sequence = result.getLong(1);
                            commit(connection);
                            return sequence;
                        }
                    }
                }
                try (var statement = connection.prepareStatement(
                    "INSERT INTO identifold_sequences "
                        + "(namespace, scope, reference_prefix, width, last_value) "
                        + "VALUES (?, ?, ?, ?, 0) ON CONFLICT DO NOTHING")) {
                    statement.setString(1, request.namespace());
                    statement.setString(2, scope);
                    statement.setString(3, request.referencePrefix());
                    statement.setInt(4, request.width());
                    statement.executeUpdate();
                }
                long current;
                try (var statement = connection.prepareStatement(
                    "SELECT reference_prefix, width, last_value FROM identifold_sequences "
                        + "WHERE namespace = ? AND scope = ?")) {
                    statement.setString(1, request.namespace());
                    statement.setString(2, scope);
                    try (var result = statement.executeQuery()) {
                        if (!result.next()
                            || !request.referencePrefix().equals(result.getString(1))
                            || request.width() != result.getInt(2)) {
                            throw failure("invalid_allocation_policy");
                        }
                        current = result.getLong(3);
                    }
                }
                long maximum = 1;
                for (var index = 0; index < request.width(); index++) maximum *= 10;
                maximum--;
                if (current >= maximum) throw failure("sequence_overflow");
                var allocated = current + 1;
                try (var update = connection.prepareStatement(
                         "UPDATE identifold_sequences SET last_value = ? "
                             + "WHERE namespace = ? AND scope = ?");
                     var insert = connection.prepareStatement(
                         "INSERT INTO identifold_sequence_allocations "
                             + "(namespace, scope, sequence, machine_id, reference_prefix, width) "
                             + "VALUES (?, ?, ?, ?, ?, ?)")) {
                    update.setLong(1, allocated);
                    update.setString(2, request.namespace());
                    update.setString(3, scope);
                    update.executeUpdate();
                    insert.setString(1, request.namespace());
                    insert.setString(2, scope);
                    insert.setLong(3, allocated);
                    insert.setBytes(4, machineId);
                    insert.setString(5, request.referencePrefix());
                    insert.setInt(6, request.width());
                    insert.executeUpdate();
                }
                commit(connection);
                return allocated;
            } catch (SQLException exception) {
                rollback(connection);
                throw failure("allocation_conflict");
            } catch (CompletionException exception) {
                rollback(connection);
                throw exception;
            }
        } catch (SQLException | IllegalArgumentException exception) {
            throw failure("allocation_conflict");
        }
    }

    private static ReferenceMapping resolveRandom(
        Connection connection, String reference, String namespace) throws SQLException {
        try (var statement = connection.prepareStatement(
            "SELECT machine_id, namespace FROM identifold_references "
                + "WHERE reference = ? AND namespace = ?")) {
            statement.setString(1, reference);
            statement.setString(2, namespace);
            try (var result = statement.executeQuery()) {
                if (!result.next()) return null;
                return new ReferenceMapping(bytesMachineId(result.getBytes(1)), result.getString(2));
            }
        }
    }

    private static byte[] machineIdBytes(String value) {
        var uuid = UUID.fromString(value);
        return ByteBuffer.allocate(16)
            .putLong(uuid.getMostSignificantBits())
            .putLong(uuid.getLeastSignificantBits())
            .array();
    }

    private static String bytesMachineId(byte[] value) {
        if (value == null || value.length != 16) throw new IllegalArgumentException();
        var buffer = ByteBuffer.wrap(value);
        return new UUID(buffer.getLong(), buffer.getLong()).toString();
    }

    private static void beginImmediate(Connection connection) throws SQLException {
        try (var statement = connection.createStatement()) {
            statement.execute("BEGIN IMMEDIATE");
        }
    }

    private static void commit(Connection connection) throws SQLException {
        try (var statement = connection.createStatement()) {
            statement.execute("COMMIT");
        }
    }

    private static void rollback(Connection connection) {
        try (var statement = connection.createStatement()) {
            statement.execute("ROLLBACK");
        } catch (SQLException ignored) {
            // The transaction may already have completed.
        }
    }

    private static CompletionException failure(String code) {
        return new CompletionException(new Identifold.IdentifoldException(code));
    }
}
