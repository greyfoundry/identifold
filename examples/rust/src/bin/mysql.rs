use identifold::storage::mysql::MySqlStorageAdapter;
use identifold::storage::{ReferenceReservation, StorageAdapter};
use mysql_async::Pool;

#[tokio::main]
async fn main() {
    let database_url =
        std::env::var("IDENTIFOLD_TEST_MYSQL_URL").expect("IDENTIFOLD_TEST_MYSQL_URL is required");
    let pool = Pool::new(database_url.as_str());
    let adapter = MySqlStorageAdapter::new(pool.clone());
    let request = ReferenceReservation {
        machine_id: "01890f8c-7b2a-7cc3-98b0-112233445568".into(),
        namespace: "order".into(),
        reference: "ORD-9876-5432-10-X".into(),
    };
    let reserved = adapter.reserve(&request).await.expect("reserve reference");
    let mapping = adapter
        .resolve(&request.reference, &request.namespace)
        .await
        .expect("resolve reference");
    println!("reserved={reserved} mapping={mapping:?}");
    pool.disconnect().await.expect("disconnect pool");
}
