use futures::executor::block_on;
use identifold::storage::{
    ReferenceMapping, ReferenceReservation, SequenceAllocationRequest, StorageAdapter,
    StorageFuture,
};

struct FakeStorage;

impl StorageAdapter for FakeStorage {
    fn reserve<'a>(&'a self, _: &'a ReferenceReservation) -> StorageFuture<'a, bool> {
        Box::pin(async { Ok(true) })
    }

    fn resolve<'a>(
        &'a self,
        _: &'a str,
        namespace: &'a str,
    ) -> StorageFuture<'a, Option<ReferenceMapping>> {
        Box::pin(async move {
            Ok(Some(ReferenceMapping {
                machine_id: "01890f8c-7b2a-7cc3-98b0-112233445566".into(),
                namespace: namespace.into(),
            }))
        })
    }

    fn allocate<'a>(&'a self, _: &'a SequenceAllocationRequest) -> StorageFuture<'a, u64> {
        Box::pin(async { Ok(1) })
    }
}

#[test]
fn storage_contract_exposes_all_operations() {
    let adapter: &dyn StorageAdapter = &FakeStorage;
    let reservation = ReferenceReservation {
        machine_id: "01890f8c-7b2a-7cc3-98b0-112233445566".into(),
        namespace: "order".into(),
        reference: "ORD-0123-4567-89-P".into(),
    };
    assert!(block_on(adapter.reserve(&reservation)).unwrap());
    let mapping = block_on(adapter.resolve(&reservation.reference, &reservation.namespace))
        .unwrap()
        .unwrap();
    assert_eq!(mapping.machine_id, reservation.machine_id);
    let allocation = SequenceAllocationRequest {
        machine_id: reservation.machine_id.clone(),
        namespace: "receipt".into(),
        reference_prefix: "RCT".into(),
        scope: None,
        width: 4,
    };
    assert_eq!(block_on(adapter.allocate(&allocation)).unwrap(), 1);
}
