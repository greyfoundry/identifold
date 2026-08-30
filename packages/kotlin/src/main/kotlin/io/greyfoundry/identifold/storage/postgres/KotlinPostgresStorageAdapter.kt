package io.greyfoundry.identifold.storage.postgres

import io.greyfoundry.identifold.Identifold
import io.greyfoundry.identifold.storage.ReferenceMapping
import io.greyfoundry.identifold.storage.ReferenceReservation
import io.greyfoundry.identifold.storage.SequenceAllocationRequest
import io.greyfoundry.identifold.storage.StorageAdapter
import java.sql.SQLException
import java.sql.Types
import javax.sql.DataSource
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class KotlinPostgresStorageAdapter(
    private val dataSource: DataSource,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,
) : StorageAdapter {
    override suspend fun reserve(request: ReferenceReservation): Boolean = withContext(dispatcher) {
        databaseOperation {
            dataSource.connection.use { connection ->
                connection.prepareStatement(
                    "SELECT identifold_reserve_reference(?::text::uuid, ?::text, ?::text)",
                ).use { statement ->
                    statement.setString(1, request.machineId)
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
                    connection.prepareStatement(
                        "SELECT resolved_machine_id::text, resolved_namespace " +
                            "FROM identifold_resolve_reference(?::text, ?::text)",
                    ).use { statement ->
                        statement.setString(1, reference)
                        statement.setString(2, namespace)
                        statement.executeQuery().use { result ->
                            if (!result.next()) null
                            else ReferenceMapping(result.getString(1), result.getString(2))
                        }
                    }
                }
            }
        }

    override suspend fun allocate(request: SequenceAllocationRequest): Long = withContext(dispatcher) {
        databaseOperation {
            dataSource.connection.use { connection ->
                connection.prepareStatement(
                    "SELECT identifold_allocate_sequence(" +
                        "?::text::uuid, ?::text, ?::text, ?::text, ?::smallint)",
                ).use { statement ->
                    statement.setString(1, request.machineId)
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
        }
    }

    private fun <T> databaseOperation(operation: () -> T): T = try {
        operation()
    } catch (exception: Identifold.IdentifoldException) {
        throw exception
    } catch (exception: SQLException) {
        throw failure(
            when (exception.sqlState) {
                "22003" -> "sequence_overflow"
                "22023" -> "invalid_allocation_policy"
                else -> "allocation_conflict"
            },
        )
    }

    private fun failure(code: String) = Identifold.IdentifoldException(code)
}
