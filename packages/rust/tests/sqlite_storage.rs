#![cfg(feature = "sqlite")]

use std::path::Path;

use identifold::storage::sqlite::SqliteStorageAdapter;
use identifold::storage::{ReferenceReservation, SequenceAllocationRequest, StorageAdapter};

#[tokio::test]
async fn sqlite_adapter_reserves_allocates_replays_and_resolves() {
    let connection = rusqlite::Connection::open_in_memory().expect("open SQLite");
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let migration =
        std::fs::read_to_string(root.join("integrations/sqlite/migrations/001_identifold.up.sql"))
            .expect("read migration");
    connection
        .execute_batch(&migration)
        .expect("apply migration");

    let adapter = SqliteStorageAdapter::new(connection);
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
    assert_eq!(
        adapter
            .resolve(random_ref, "order")
            .await
            .expect("resolve reference")
            .expect("mapping")
            .machine_id,
        random_mid
    );

    let request = SequenceAllocationRequest {
        machine_id: "01890f8c-7b2a-7cc3-98b0-112233445567".into(),
        namespace: "receipt".into(),
        reference_prefix: "RCT".into(),
        scope: None,
        width: 4,
    };
    assert_eq!(adapter.allocate(&request).await.expect("allocate"), 1);
    assert_eq!(adapter.allocate(&request).await.expect("replay"), 1);
    assert_eq!(
        adapter
            .resolve("RCT-0001-1", "receipt")
            .await
            .expect("resolve sequence")
            .expect("sequence mapping")
            .machine_id,
        request.machine_id
    );
}
