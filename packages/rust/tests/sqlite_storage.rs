#![cfg(feature = "sqlite")]

use std::path::Path;
use std::sync::Arc;

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

    let adapter = Arc::new(SqliteStorageAdapter::new(connection));
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

    let reservations = (0..20)
        .map(|index| {
            let adapter = Arc::clone(&adapter);
            tokio::spawn(async move {
                adapter
                    .reserve(&ReferenceReservation {
                        machine_id: format!("01890f8c-7b2a-7cc3-98b1-{index:012x}"),
                        namespace: "order".into(),
                        reference: "ORD-CONCURRENT-X".into(),
                    })
                    .await
                    .expect("concurrent reserve")
            })
        })
        .collect::<Vec<_>>();
    let mut winners = 0;
    for reservation in reservations {
        if reservation.await.expect("reservation task") {
            winners += 1;
        }
    }
    assert_eq!(winners, 1);

    let allocations = (0..32)
        .map(|index| {
            let adapter = Arc::clone(&adapter);
            tokio::spawn(async move {
                adapter
                    .allocate(&SequenceAllocationRequest {
                        machine_id: format!("01890f8c-7b2a-7cc3-98b2-{index:012x}"),
                        namespace: "invoice".into(),
                        reference_prefix: "INV".into(),
                        scope: None,
                        width: 4,
                    })
                    .await
                    .expect("concurrent allocation")
            })
        })
        .collect::<Vec<_>>();
    let mut sequences = Vec::with_capacity(32);
    for allocation in allocations {
        sequences.push(allocation.await.expect("allocation task"));
    }
    sequences.sort_unstable();
    assert_eq!(sequences, (1..=32).collect::<Vec<_>>());
}

#[tokio::test]
async fn sqlite_adapter_rolls_back_overflow() {
    let path = std::env::temp_dir().join(format!(
        "identifold-sqlite-overflow-{}.db",
        std::process::id()
    ));
    let _ = std::fs::remove_file(&path);
    let connection = rusqlite::Connection::open(&path).expect("open SQLite");
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../..");
    let migration =
        std::fs::read_to_string(root.join("integrations/sqlite/migrations/001_identifold.up.sql"))
            .expect("read migration");
    connection
        .execute_batch(&migration)
        .expect("apply migration");
    connection
        .execute(
            "INSERT INTO identifold_sequences VALUES ('overflow', '', 'OVR', 4, 9999)",
            [],
        )
        .expect("seed counter");
    let adapter = SqliteStorageAdapter::new(connection);
    let error = adapter
        .allocate(&SequenceAllocationRequest {
            machine_id: "01890f8c-7b2a-7cc3-98b3-112233445568".into(),
            namespace: "overflow".into(),
            reference_prefix: "OVR".into(),
            scope: None,
            width: 4,
        })
        .await
        .expect_err("overflow must fail");
    assert_eq!(error.0, "sequence_overflow");
    drop(adapter);
    let verification = rusqlite::Connection::open(&path).expect("reopen SQLite");
    let counter: i64 = verification
        .query_row(
            "SELECT last_value FROM identifold_sequences WHERE namespace = 'overflow'",
            [],
            |row| row.get(0),
        )
        .expect("read counter");
    assert_eq!(counter, 9999);
    drop(verification);
    std::fs::remove_file(path).expect("remove test database");
}
