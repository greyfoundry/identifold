package io.greyfoundry.identifold.storage.sqlite

import io.greyfoundry.identifold.Identifold
import io.greyfoundry.identifold.storage.ReferenceMapping
import io.greyfoundry.identifold.storage.ReferenceReservation
import io.greyfoundry.identifold.storage.SequenceAllocationRequest
import io.greyfoundry.identifold.storage.StorageAdapter
import java.nio.ByteBuffer
import java.sql.Connection
import java.sql.SQLException
import java.util.UUID
import javax.sql.DataSource
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class KotlinSqliteStorageAdapter(
    private val dataSource: DataSource,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) : StorageAdapter {
    override suspend fun reserve(request: ReferenceReservation): Boolean = withContext(dispatcher) {
        databaseOperation {
            dataSource.connection.use { connection ->
                connection.prepareStatement(
                    "INSERT INTO identifold_references " +
                        "(reference, namespace, machine_id) VALUES (?, ?, ?) " +
                        "ON CONFLICT(reference) DO NOTHING",
                ).use { statement ->
                    statement.setString(1, request.reference)
                    statement.setString(2, request.namespace)
                    statement.setBytes(3, machineIdBytes(request.machineId))
                    statement.executeUpdate() == 1
                }
            }
        }
    }

    override suspend fun resolve(reference: String, namespace: String): ReferenceMapping? =
        withContext(dispatcher) {
            databaseOperation {
                dataSource.connection.use { connection ->
                    resolveRandom(connection, reference, namespace)
                        ?: resolveSequential(connection, reference, namespace)
                }
            }
        }

    override suspend fun allocate(request: SequenceAllocationRequest): Long = withContext(dispatcher) {
        if (request.width !in 4..18) throw failure("invalid_allocation_policy")
        databaseOperation {
            dataSource.connection.use { connection -> allocate(connection, request) }
        }
    }

    private fun allocate(connection: Connection, request: SequenceAllocationRequest): Long {
        connection.createStatement().use { it.execute("BEGIN IMMEDIATE") }
        try {
            val scope = request.scope ?: ""
            val machineId = machineIdBytes(request.machineId)
            connection.prepareStatement(
                "SELECT sequence, reference_prefix, width " +
                    "FROM identifold_sequence_allocations " +
                    "WHERE namespace = ? AND scope = ? AND machine_id = ?",
            ).use { statement ->
                statement.setString(1, request.namespace)
                statement.setString(2, scope)
                statement.setBytes(3, machineId)
                statement.executeQuery().use { result ->
                    if (result.next()) {
                        if (request.referencePrefix != result.getString(2) ||
                            request.width != result.getInt(3)
                        ) {
                            throw failure("invalid_allocation_policy")
                        }
                        return result.getLong(1).also { commit(connection) }
                    }
                }
            }
            connection.prepareStatement(
                "INSERT INTO identifold_sequences " +
                    "(namespace, scope, reference_prefix, width, last_value) " +
                    "VALUES (?, ?, ?, ?, 0) ON CONFLICT DO NOTHING",
            ).use { statement ->
                statement.setString(1, request.namespace)
                statement.setString(2, scope)
                statement.setString(3, request.referencePrefix)
                statement.setInt(4, request.width)
                statement.executeUpdate()
            }
            val current = connection.prepareStatement(
                "SELECT reference_prefix, width, last_value FROM identifold_sequences " +
                    "WHERE namespace = ? AND scope = ?",
            ).use { statement ->
                statement.setString(1, request.namespace)
                statement.setString(2, scope)
                statement.executeQuery().use { result ->
                    if (!result.next() || request.referencePrefix != result.getString(1) ||
                        request.width != result.getInt(2)
                    ) {
                        throw failure("invalid_allocation_policy")
                    }
                    result.getLong(3)
                }
            }
            val maximum = "9".repeat(request.width).toLong()
            if (current >= maximum) throw failure("sequence_overflow")
            val allocated = current + 1
            connection.prepareStatement(
                "UPDATE identifold_sequences SET last_value = ? " +
                    "WHERE namespace = ? AND scope = ?",
            ).use { statement ->
                statement.setLong(1, allocated)
                statement.setString(2, request.namespace)
                statement.setString(3, scope)
                statement.executeUpdate()
            }
            connection.prepareStatement(
                "INSERT INTO identifold_sequence_allocations " +
                    "(namespace, scope, sequence, machine_id, reference_prefix, width) " +
                    "VALUES (?, ?, ?, ?, ?, ?)",
            ).use { statement ->
                statement.setString(1, request.namespace)
                statement.setString(2, scope)
                statement.setLong(3, allocated)
                statement.setBytes(4, machineId)
                statement.setString(5, request.referencePrefix)
                statement.setInt(6, request.width)
                statement.executeUpdate()
            }
            commit(connection)
            return allocated
        } catch (exception: Throwable) {
            rollback(connection)
            throw exception
        }
    }

    private fun resolveRandom(
        connection: Connection,
        reference: String,
        namespace: String,
    ): ReferenceMapping? = connection.prepareStatement(
        "SELECT machine_id, namespace FROM identifold_references " +
            "WHERE reference = ? AND namespace = ?",
    ).use { statement ->
        statement.setString(1, reference)
        statement.setString(2, namespace)
        statement.executeQuery().use { result ->
            if (!result.next()) null
            else ReferenceMapping(bytesMachineId(result.getBytes(1)), result.getString(2))
        }
    }

    private fun resolveSequential(
        connection: Connection,
        reference: String,
        namespace: String,
    ): ReferenceMapping? {
        val match = SEQUENTIAL_REFERENCE.matchEntire(reference) ?: return null
        return connection.prepareStatement(
            "SELECT machine_id, namespace FROM identifold_sequence_allocations " +
                "WHERE namespace = ? AND reference_prefix = ? AND scope = ? AND sequence = ?",
        ).use { statement ->
            statement.setString(1, namespace)
            statement.setString(2, match.groupValues[1])
            statement.setString(3, match.groupValues[2])
            statement.setString(4, match.groupValues[3])
            statement.executeQuery().use { result ->
                if (!result.next()) null
                else ReferenceMapping(bytesMachineId(result.getBytes(1)), result.getString(2))
            }
        }
    }

    private fun <T> databaseOperation(operation: () -> T): T = try {
        operation()
    } catch (exception: Identifold.IdentifoldException) {
        throw exception
    } catch (exception: SQLException) {
        throw failure("allocation_conflict")
    } catch (exception: IllegalArgumentException) {
        throw failure("allocation_conflict")
    }

    private fun commit(connection: Connection) =
        connection.createStatement().use { it.execute("COMMIT") }

    private fun rollback(connection: Connection) {
        try {
            connection.createStatement().use { it.execute("ROLLBACK") }
        } catch (_: SQLException) {
            // The transaction may already have completed.
        }
    }

    private fun machineIdBytes(value: String): ByteArray {
        val uuid = UUID.fromString(value)
        return ByteBuffer.allocate(16)
            .putLong(uuid.mostSignificantBits)
            .putLong(uuid.leastSignificantBits)
            .array()
    }

    private fun bytesMachineId(value: ByteArray): String {
        require(value.size == 16)
        val buffer = ByteBuffer.wrap(value)
        return UUID(buffer.long, buffer.long).toString()
    }

    private fun failure(code: String) = Identifold.IdentifoldException(code)

    private companion object {
        val SEQUENTIAL_REFERENCE =
            Regex("^([A-Z]{2,8})-(?:([0-9]{4})-)?([0-9]{4,18})-[0-9A-Z*~\\$=U]$")
    }
}
