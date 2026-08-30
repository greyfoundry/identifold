package io.greyfoundry.identifold.storage.postgres;

import io.greyfoundry.identifold.Identifold;
import io.greyfoundry.identifold.storage.ReferenceMapping;
import io.greyfoundry.identifold.storage.ReferenceReservation;
import io.greyfoundry.identifold.storage.SequenceAllocationRequest;
import io.greyfoundry.identifold.storage.StorageAdapter;
import java.sql.SQLException;
import java.sql.Types;
import java.util.Objects;
import java.util.concurrent.CompletionException;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Executor;
import java.util.concurrent.CompletableFuture;
import javax.sql.DataSource;

public final class PostgresStorageAdapter implements StorageAdapter {
    private final DataSource dataSource;
    private final Executor executor;

    public PostgresStorageAdapter(DataSource dataSource, Executor executor) {
        this.dataSource = Objects.requireNonNull(dataSource, "dataSource");
        this.executor = Objects.requireNonNull(executor, "executor");
    }

    @Override
    public CompletionStage<Boolean> reserve(ReferenceReservation request) {
        return CompletableFuture.supplyAsync(() -> {
            try (var connection = dataSource.getConnection();
                 var statement = connection.prepareStatement(
                     "SELECT identifold_reserve_reference(?::text::uuid, ?::text, ?::text)")) {
                statement.setString(1, request.machineId());
                statement.setString(2, request.namespace());
                statement.setString(3, request.reference());
                try (var result = statement.executeQuery()) {
                    if (!result.next()) throw failure("allocation_conflict");
                    return result.getBoolean(1);
                }
            } catch (SQLException exception) {
                throw failure(mapCode(exception));
            }
        }, executor);
    }

    @Override
    public CompletionStage<ReferenceMapping> resolve(String reference, String namespace) {
        return CompletableFuture.supplyAsync(() -> {
            try (var connection = dataSource.getConnection();
                 var statement = connection.prepareStatement(
                     "SELECT resolved_machine_id::text, resolved_namespace "
                         + "FROM identifold_resolve_reference(?::text, ?::text)")) {
                statement.setString(1, reference);
                statement.setString(2, namespace);
                try (var result = statement.executeQuery()) {
                    if (!result.next()) return null;
                    return new ReferenceMapping(result.getString(1), result.getString(2));
                }
            } catch (SQLException exception) {
                throw failure(mapCode(exception));
            }
        }, executor);
    }

    @Override
    public CompletionStage<Long> allocate(SequenceAllocationRequest request) {
        return CompletableFuture.supplyAsync(() -> {
            try (var connection = dataSource.getConnection();
                 var statement = connection.prepareStatement(
                     "SELECT identifold_allocate_sequence(?::text::uuid, ?::text, ?::text, ?::text, ?::smallint)")) {
                statement.setString(1, request.machineId());
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
                throw failure(mapCode(exception));
            }
        }, executor);
    }

    private static String mapCode(SQLException exception) {
        if ("22003".equals(exception.getSQLState())) return "sequence_overflow";
        if ("22023".equals(exception.getSQLState())) return "invalid_allocation_policy";
        return "allocation_conflict";
    }

    private static CompletionException failure(String code) {
        return new CompletionException(new Identifold.IdentifoldException(code));
    }
}
