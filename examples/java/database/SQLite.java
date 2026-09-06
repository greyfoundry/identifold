import io.greyfoundry.identifold.storage.ReferenceReservation;
import io.greyfoundry.identifold.storage.sqlite.SqliteStorageAdapter;
import java.nio.file.Files;
import java.nio.file.Path;
import org.sqlite.SQLiteDataSource;

public final class SQLite {
    public static void main(String[] args) throws Exception {
        var dataSource = new SQLiteDataSource();
        dataSource.setUrl("jdbc:sqlite:file:identifold-example?mode=memory&cache=shared");
        try (var keeper = dataSource.getConnection();
             var statement = keeper.createStatement()) {
            for (var sql : Files.readString(Path.of(
                    "integrations/sqlite/migrations/001_identifold.up.sql")).split(";")) {
                if (!sql.isBlank()) {
                    statement.execute(sql);
                }
            }
            var adapter = new SqliteStorageAdapter(dataSource, Runnable::run);
            var request = new ReferenceReservation(
                "01890f8c-7b2a-7cc3-98b0-112233445566",
                "order",
                "ORD-0123-4567-89-P");
            var reserved = adapter.reserve(request).toCompletableFuture().join();
            var mapping = adapter.resolve(request.reference(), request.namespace())
                .toCompletableFuture().join();
            System.out.printf("reserved=%s mapping=%s%n", reserved, mapping);
        }
    }
}
