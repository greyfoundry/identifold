import io.greyfoundry.identifold.storage.ReferenceReservation
import io.greyfoundry.identifold.storage.postgres.KotlinPostgresStorageAdapter
import java.net.URI
import kotlinx.coroutines.runBlocking
import org.postgresql.ds.PGSimpleDataSource

fun main() = runBlocking {
    val uri = URI.create(System.getenv("DATABASE_URL"))
    val credentials = uri.userInfo.split(":", limit = 2)
    val dataSource = PGSimpleDataSource().apply {
        serverNames = arrayOf(uri.host)
        portNumbers = intArrayOf(uri.port)
        databaseName = uri.path.removePrefix("/")
        user = credentials[0]
        password = credentials[1]
    }
    val adapter = KotlinPostgresStorageAdapter(dataSource)
    val request = ReferenceReservation(
        "01890f8c-7b2a-7cc3-98b0-112233445566",
        "order",
        "ORD-0123-4567-89-P",
    )
    val reserved = adapter.reserve(request)
    val mapping = adapter.resolve(request.reference, request.namespace)
    println("reserved=$reserved mapping=$mapping")
}
