import io.greyfoundry.identifold.storage.ReferenceReservation
import io.greyfoundry.identifold.storage.sqlite.KotlinSqliteStorageAdapter
import java.nio.file.Files
import java.nio.file.Path
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking
import org.sqlite.SQLiteDataSource

fun main() = runBlocking {
    val dataSource = SQLiteDataSource().apply {
        url = "jdbc:sqlite:file:identifold-example?mode=memory&cache=shared"
    }
    dataSource.connection.use { keeper ->
        keeper.createStatement().use { statement ->
            Files.readString(Path.of("integrations/sqlite/migrations/001_identifold.up.sql"))
                .split(';')
                .filter { it.isNotBlank() }
                .forEach(statement::execute)
        }
        val adapter = KotlinSqliteStorageAdapter(dataSource, Dispatchers.Unconfined)
        val request = ReferenceReservation(
            "01890f8c-7b2a-7cc3-98b0-112233445566",
            "order",
            "ORD-0123-4567-89-P",
        )
        val reserved = adapter.reserve(request)
        val mapping = adapter.resolve(request.reference, request.namespace)
        println("reserved=$reserved mapping=$mapping")
    }
}
