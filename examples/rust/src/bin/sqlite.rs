use identifold::storage::sqlite::SqliteStorageAdapter;
use identifold::storage::{ReferenceReservation, StorageAdapter};
use rusqlite::Connection;

#[tokio::main]
async fn main() {
    let connection = Connection::open_in_memory().expect("open SQLite");
    connection
        .execute_batch(include_str!(
            "../../../../integrations/sqlite/migrations/001_identifold.up.sql"
        ))
        .expect("apply migration");
    let adapter = SqliteStorageAdapter::new(connection);
    let request = ReferenceReservation {
        machine_id: "01890f8c-7b2a-7cc3-98b0-112233445566".into(),
        namespace: "order".into(),
        reference: "ORD-0123-4567-89-P".into(),
    };
    let reserved = adapter.reserve(&request).await.expect("reserve reference");
    let mapping = adapter
        .resolve(&request.reference, &request.namespace)
        .await
        .expect("resolve reference");
    println!("reserved={reserved} mapping={mapping:?}");
}
