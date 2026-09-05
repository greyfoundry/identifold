#![cfg(feature = "mysql")]

use identifold::storage::mysql::MySqlStorageAdapter;
use identifold::storage::{ReferenceReservation, SequenceAllocationRequest, StorageAdapter};
use mysql_async::Pool;
use mysql_async::prelude::Queryable;

#[tokio::test]
async fn mysql_adapter_reserves_allocates_and_resolves() {
    let Some(database_url) = std::env::var("IDENTIFOLD_TEST_MYSQL_URL").ok() else {
        return;
    };
    let pool = Pool::new(database_url.as_str());
    let mut connection = pool.get_conn().await.expect("connect to MySQL");
    for table in [
        "identifold_sequence_allocations",
        "identifold_sequences",
        "identifold_references",
    ] {
        connection
            .query_drop(format!("DELETE FROM {table}"))
            .await
            .expect("clear table");
    }
    drop(connection);

    let adapter = MySqlStorageAdapter::new(pool.clone());
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

    pool.disconnect().await.expect("disconnect pool");
}
