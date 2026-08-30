import io.greyfoundry.identifold.storage.ReferenceReservation;
import io.greyfoundry.identifold.storage.postgres.PostgresStorageAdapter;
import java.net.URI;
import org.postgresql.ds.PGSimpleDataSource;

public final class Postgres {
    public static void main(String[] args) {
        var uri = URI.create(System.getenv("DATABASE_URL"));
        var credentials = uri.getUserInfo().split(":", 2);
        var dataSource = new PGSimpleDataSource();
        dataSource.setServerNames(new String[] {uri.getHost()});
        dataSource.setPortNumbers(new int[] {uri.getPort()});
        dataSource.setDatabaseName(uri.getPath().substring(1));
        dataSource.setUser(credentials[0]);
        dataSource.setPassword(credentials[1]);
        var adapter = new PostgresStorageAdapter(dataSource, Runnable::run);
        var request = new ReferenceReservation(
            "01890f8c-7b2a-7cc3-98b0-112233445566", "order", "ORD-0123-4567-89-P");
        var reserved = adapter.reserve(request).toCompletableFuture().join();
        var mapping = adapter.resolve(request.reference(), request.namespace())
            .toCompletableFuture().join();
        System.out.printf("reserved=%s mapping=%s%n", reserved, mapping);
    }
}
