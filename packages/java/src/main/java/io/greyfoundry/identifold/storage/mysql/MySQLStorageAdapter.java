package io.greyfoundry.identifold.storage.mysql;

import io.greyfoundry.identifold.Identifold;
import io.greyfoundry.identifold.storage.ReferenceMapping;
import io.greyfoundry.identifold.storage.ReferenceReservation;
import io.greyfoundry.identifold.storage.SequenceAllocationRequest;
import io.greyfoundry.identifold.storage.StorageAdapter;
import java.nio.ByteBuffer;
import java.sql.SQLException;
import java.sql.Types;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionException;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Executor;
import java.util.regex.Pattern;
import javax.sql.DataSource;

public final class MySQLStorageAdapter implements StorageAdapter {
    private static final Pattern SEQUENTIAL_REFERENCE = Pattern.compile(
        "^([A-Z]{2,8})-(?:([0-9]{4})-)?([0-9]{4,18})-[0-9A-Z*~$=U]$");

    private final DataSource dataSource;
    private final Executor executor;

    public MySQLStorageAdapter(DataSource dataSource, Executor executor) {
        this.dataSource = Objects.requireNonNull(dataSource, "dataSource");
        this.executor = Objects.requireNonNull(executor, "executor");
    }

    @Override
    public CompletionStage<Boolean> reserve(ReferenceReservation request) {
        return CompletableFuture.supplyAsync(() -> {
            try (var connection = dataSource.getConnection();
                 var statement = connection.prepareCall(
                     "CALL identifold_reserve_reference(?, ?, ?)")) {
                statement.setBytes(1, machineIdBytes(request.machineId()));
                statement.setString(2, request.namespace());
                statement.setString(3, request.reference());
                try (var result = statement.executeQuery()) {
                    if (!result.next()) throw failure("allocation_conflict");
                    return result.getBoolean(1);
                }
            } catch (SQLException | IllegalArgumentException exception) {
                throw failure(mapCode(exception));
            }
        }, executor);
    }

    @Override
    public CompletionStage<ReferenceMapping> resolve(String reference, String namespace) {
        return CompletableFuture.supplyAsync(() -> {
            try (var connection = dataSource.getConnection()) {
                var mapping = lookup(
                    connection,
                    "SELECT machine_id, namespace FROM identifold_references "
                        + "WHERE reference = ? AND namespace = ?",
                    namespace,
                    reference,
                    null,
                    null);
                if (mapping != null) return mapping;
                var matcher = SEQUENTIAL_REFERENCE.matcher(reference);
                if (!matcher.matches()) return null;
                return lookup(
                    connection,
                    "SELECT machine_id, namespace FROM identifold_sequence_allocations "
                        + "WHERE namespace = ? AND reference_prefix = ? "
                        + "AND scope = ? AND sequence = ?",
                    namespace,
                    matcher.group(1),
                    matcher.group(2) == null ? "" : matcher.group(2),
                    matcher.group(3));
            } catch (SQLException | IllegalArgumentException exception) {
                throw failure(mapCode(exception));
            }
        }, executor);
    }

    @Override
    public CompletionStage<Long> allocate(SequenceAllocationRequest request) {
        return CompletableFuture.supplyAsync(() -> allocateSynchronously(request), executor);
    }

    private long allocateSynchronously(SequenceAllocationRequest request) {
        for (var attempt = 0; attempt < 5; attempt++) {
            try (var connection = dataSource.getConnection();
                 var statement = connection.prepareCall(
                     "CALL identifold_allocate_sequence(?, ?, ?, ?, ?)")) {
                statement.setBytes(1, machineIdBytes(request.machineId()));
                statement.setString(2, request.namespace());
                statement.setString(3, request.referencePrefix());
                if (request.scope() == null) statement.setNull(4, Types.VARCHAR);
                else statement.setString(4, request.scope());
                statement.setInt(5, request.width());
                try (var result = statement.executeQuery()) {
                    if (!result.next()) throw failure("allocation_conflict");
                    var sequence = result.getLong(1);
                    if (result.wasNull() || sequence < 0) throw failure("allocation_conflict");
                    return sequence;
                }
            } catch (SQLException exception) {
                if (attempt < 4 && isTransient(exception)) {
                    pause(attempt);
                    continue;
                }
                throw failure(mapCode(exception));
            } catch (IllegalArgumentException exception) {
                throw failure("allocation_conflict");
            }
        }
        throw failure("allocation_conflict");
    }

    private static ReferenceMapping lookup(
        java.sql.Connection connection,
        String query,
        String namespace,
        String first,
        String second,
        String third) throws SQLException {
        try (var statement = connection.prepareStatement(query)) {
            if (third == null) {
                statement.setString(1, first);
                statement.setString(2, namespace);
            } else {
                statement.setString(1, namespace);
                statement.setString(2, first);
                statement.setString(3, second);
                statement.setString(4, third);
            }
            try (var result = statement.executeQuery()) {
                if (!result.next()) return null;
                return new ReferenceMapping(
                    bytesMachineId(result.getBytes(1)), result.getString(2));
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

    private static void pause(int attempt) {
        try {
            Thread.sleep(1L << attempt);
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            throw failure("allocation_conflict");
        }
    }

    private static boolean isTransient(SQLException exception) {
        return exception.getErrorCode() == 1205
            || exception.getErrorCode() == 1213
            || "40001".equals(exception.getSQLState());
    }

    private static String mapCode(Exception exception) {
        if (exception instanceof SQLException sqlException) {
            if ("22003".equals(sqlException.getSQLState())) return "sequence_overflow";
            if ("22023".equals(sqlException.getSQLState())) return "invalid_allocation_policy";
        }
        return "allocation_conflict";
    }

    private static CompletionException failure(String code) {
        return new CompletionException(new Identifold.IdentifoldException(code));
    }
}
