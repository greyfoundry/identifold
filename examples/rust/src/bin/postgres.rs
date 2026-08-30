use std::sync::Arc;

use identifold::storage::postgres::PostgresStorageAdapter;
use identifold::storage::{ReferenceReservation, StorageAdapter};

#[tokio::main]
async fn main() {
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL is required");
    let (client, connection) = tokio_postgres::connect(&database_url, tokio_postgres::NoTls)
        .await
        .expect("connect to PostgreSQL");
    tokio::spawn(async move { connection.await.expect("drive connection") });
    let adapter = PostgresStorageAdapter::new(Arc::new(client));
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
