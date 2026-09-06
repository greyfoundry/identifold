import com.mysql.cj.jdbc.MysqlDataSource
import io.greyfoundry.identifold.storage.ReferenceReservation
import io.greyfoundry.identifold.storage.mysql.KotlinMySQLStorageAdapter
import java.net.URI
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.runBlocking

fun main() = runBlocking {
    val uri = URI.create(System.getenv("IDENTIFOLD_TEST_MYSQL_URL"))
    val credentials = uri.userInfo.split(":", limit = 2)
    val dataSource = MysqlDataSource().apply {
        setUrl("jdbc:mysql://${uri.host}:${uri.port}${uri.path}")
        user = credentials[0]
        password = credentials[1]
    }
    val adapter = KotlinMySQLStorageAdapter(dataSource, Dispatchers.Unconfined)
    val request = ReferenceReservation(
        "01890f8c-7b2a-7cc3-98b0-112233445568",
        "order",
        "ORD-9876-5432-10-X",
    )
    val reserved = adapter.reserve(request)
    val mapping = adapter.resolve(request.reference, request.namespace)
    println("reserved=$reserved mapping=$mapping")
}
