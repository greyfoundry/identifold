#![cfg(feature = "postgres")]

use std::path::Path;
use std::sync::Arc;

use identifold::storage::postgres::PostgresStorageAdapter;
use identifold::storage::{ReferenceReservation, SequenceAllocationRequest, StorageAdapter};

#[tokio::test]
async fn postgres_adapter_reserves_allocates_and_resolves() {
    let Some(database_url) = std::env::var("IDENTIFOLD_TEST_DATABASE_URL").ok() else {
        return;
    };
    let (client, connection) = tokio_postgres::connect(&database_url, tokio_postgres::NoTls)
        .await
        .expect("connect to PostgreSQL");
    tokio::spawn(async move {
        connection.await.expect("drive PostgreSQL connection");
    });
    let client = Arc::new(client);

    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    for migration in [
        "001_identifold.down.sql",
        "001_identifold.up.sql",
        "003_idempotent_replay.up.sql",
        "004_reference_lookup.up.sql",
    ] {
        let script = std::fs::read_to_string(
            root.join("integrations/postgres/migrations")
                .join(migration),
        )
        .expect("read migration");
        client
            .batch_execute(&script)
            .await
            .expect("apply migration");
    }

    let adapter = PostgresStorageAdapter::new(Arc::clone(&client));
    let random_mid = "01890f8c-7b2a-7cc3-98b0-112233445566";
    let random_ref = "ORD-0123-4567-89-P";
    assert!(
        adapter
            .reserve(&ReferenceReservation {
                machine_id: random_mid.into(),
                namespace: "order".into(),
                reference: random_ref.into(),
            })
            .await
            .expect("reserve reference")
    );
    let mapping = adapter
        .resolve(random_ref, "order")
        .await
        .expect("resolve reference")
        .expect("mapping");
    assert_eq!(mapping.machine_id, random_mid);

    let request = SequenceAllocationRequest {
        machine_id: "01890f8c-7b2a-7cc3-98b0-112233445567".into(),
        namespace: "receipt".into(),
        reference_prefix: "RCT".into(),
        scope: None,
        width: 4,
    };
    assert_eq!(adapter.allocate(&request).await.expect("allocate"), 1);
    assert_eq!(adapter.allocate(&request).await.expect("replay"), 1);
    let mapping = adapter
        .resolve("RCT-0001-1", "receipt")
        .await
        .expect("resolve sequence")
        .expect("sequence mapping");
    assert_eq!(mapping.machine_id, request.machine_id);
}
