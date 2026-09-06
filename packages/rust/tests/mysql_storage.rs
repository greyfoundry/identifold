#![cfg(feature = "mysql")]

use identifold::storage::mysql::MySqlStorageAdapter;
use identifold::storage::{ReferenceReservation, SequenceAllocationRequest, StorageAdapter};
use mysql_async::Pool;
use mysql_async::prelude::Queryable;
use std::sync::Arc;

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

    let adapter = Arc::new(MySqlStorageAdapter::new(pool.clone()));
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

    let mut connection = pool.get_conn().await.expect("inspect MySQL");
    let stored: Option<(String,)> = connection
        .exec_first(
            "SELECT HEX(machine_id) FROM identifold_references WHERE reference = ?",
            (random_ref,),
        )
        .await
        .expect("read UUID bytes");
    assert_eq!(stored, Some((random_mid.replace('-', "").to_uppercase(),)));
    drop(connection);

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

    let invalid = adapter
        .allocate(&SequenceAllocationRequest {
            width: 5,
            ..request.clone()
        })
        .await
        .expect_err("policy change must fail");
    assert_eq!(invalid.0, "invalid_allocation_policy");

    let mut connection = pool.get_conn().await.expect("seed MySQL");
    connection
        .query_drop("INSERT INTO identifold_sequences VALUES ('overflow', '', 'OVR', 4, 9999)")
        .await
        .expect("seed overflow");
    drop(connection);
    let overflow = adapter
        .allocate(&SequenceAllocationRequest {
            machine_id: "01890f8c-7b2a-7cc3-98b3-112233445568".into(),
            namespace: "overflow".into(),
            reference_prefix: "OVR".into(),
            scope: None,
            width: 4,
        })
        .await
        .expect_err("overflow must fail");
    assert_eq!(overflow.0, "sequence_overflow");
    let mut connection = pool.get_conn().await.expect("verify MySQL");
    let counter: Option<(u64,)> = connection
        .exec_first(
            "SELECT counter_value FROM identifold_sequences WHERE namespace = 'overflow'",
            (),
        )
        .await
        .expect("read counter");
    assert_eq!(counter, Some((9999,)));
    drop(connection);

    pool.disconnect().await.expect("disconnect pool");
}
