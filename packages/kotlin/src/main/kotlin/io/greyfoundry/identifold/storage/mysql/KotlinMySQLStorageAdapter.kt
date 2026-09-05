package io.greyfoundry.identifold.storage.mysql

import io.greyfoundry.identifold.Identifold
import io.greyfoundry.identifold.storage.ReferenceMapping
import io.greyfoundry.identifold.storage.ReferenceReservation
import io.greyfoundry.identifold.storage.SequenceAllocationRequest
import io.greyfoundry.identifold.storage.StorageAdapter
import java.nio.ByteBuffer
import java.sql.Connection
import java.sql.SQLException
import java.sql.Types
import java.util.UUID
import javax.sql.DataSource
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class KotlinMySQLStorageAdapter(
    private val dataSource: DataSource,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) : StorageAdapter {
    override suspend fun reserve(request: ReferenceReservation): Boolean = withContext(dispatcher) {
        databaseOperation {
            dataSource.connection.use { connection ->
                connection.prepareCall(
                    "CALL identifold_reserve_reference(?, ?, ?)",
                ).use { statement ->
                    statement.setBytes(1, machineIdBytes(request.machineId))
                    statement.setString(2, request.namespace)
                    statement.setString(3, request.reference)
                    statement.executeQuery().use { result ->
                        if (!result.next()) throw failure("allocation_conflict")
                        result.getBoolean(1)
                    }
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
        for (attempt in 0..<5) {
            try {
                return@withContext allocateOnce(request)
            } catch (exception: SQLException) {
                if (attempt < 4 && exception.isTransient()) {
                    Thread.sleep(1L shl attempt)
                    continue
                }
                throw failure(exception.errorCode())
            } catch (exception: IllegalArgumentException) {
                throw failure("allocation_conflict")
            }
        }
        throw failure("allocation_conflict")
    }

    private fun allocateOnce(request: SequenceAllocationRequest): Long =
        dataSource.connection.use { connection ->
            connection.prepareCall(
                "CALL identifold_allocate_sequence(?, ?, ?, ?, ?)",
            ).use { statement ->
                statement.setBytes(1, machineIdBytes(request.machineId))
                statement.setString(2, request.namespace)
                statement.setString(3, request.referencePrefix)
                if (request.scope == null) statement.setNull(4, Types.VARCHAR)
                else statement.setString(4, request.scope)
                statement.setInt(5, request.width)
                statement.executeQuery().use { result ->
                    if (!result.next()) throw failure("allocation_conflict")
                    val sequence = result.getLong(1)
                    if (result.wasNull() || sequence < 0) throw failure("allocation_conflict")
                    sequence
                }
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
        throw failure(exception.errorCode())
    } catch (exception: IllegalArgumentException) {
        throw failure("allocation_conflict")
    }

    private fun SQLException.errorCode() = when (sqlState) {
        "22003" -> "sequence_overflow"
        "22023" -> "invalid_allocation_policy"
        else -> "allocation_conflict"
    }

    private fun SQLException.isTransient() =
        errorCode == 1205 || errorCode == 1213 || sqlState == "40001"

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
