import com.mysql.cj.jdbc.MysqlDataSource;
import io.greyfoundry.identifold.storage.ReferenceReservation;
import io.greyfoundry.identifold.storage.mysql.MySQLStorageAdapter;
import java.net.URI;

public final class MySQL {
    public static void main(String[] args) throws Exception {
        var uri = URI.create(System.getenv("IDENTIFOLD_TEST_MYSQL_URL"));
        var credentials = uri.getUserInfo().split(":", 2);
        var dataSource = new MysqlDataSource();
        dataSource.setUrl("jdbc:mysql://" + uri.getHost() + ":" + uri.getPort() + uri.getPath());
        dataSource.setUser(credentials[0]);
        dataSource.setPassword(credentials[1]);
        var adapter = new MySQLStorageAdapter(dataSource, Runnable::run);
        var request = new ReferenceReservation(
            "01890f8c-7b2a-7cc3-98b0-112233445568",
            "order",
            "ORD-9876-5432-10-X");
        var reserved = adapter.reserve(request).toCompletableFuture().join();
        var mapping = adapter.resolve(request.reference(), request.namespace())
            .toCompletableFuture().join();
        System.out.printf("reserved=%s mapping=%s%n", reserved, mapping);
    }
}
