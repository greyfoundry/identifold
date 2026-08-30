use std::future::Future;
use std::pin::Pin;

use crate::Error;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReferenceReservation {
    pub machine_id: String,
    pub namespace: String,
    pub reference: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReferenceMapping {
    pub machine_id: String,
    pub namespace: String,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SequenceAllocationRequest {
    pub machine_id: String,
    pub namespace: String,
    pub reference_prefix: String,
    pub scope: Option<String>,
    pub width: u8,
}

pub type StorageFuture<'a, T> = Pin<Box<dyn Future<Output = Result<T, Error>> + Send + 'a>>;

pub trait StorageAdapter: Send + Sync {
    fn reserve<'a>(&'a self, request: &'a ReferenceReservation) -> StorageFuture<'a, bool>;

    fn resolve<'a>(
        &'a self,
        reference: &'a str,
        namespace: &'a str,
    ) -> StorageFuture<'a, Option<ReferenceMapping>>;

    fn allocate<'a>(&'a self, request: &'a SequenceAllocationRequest) -> StorageFuture<'a, u64>;
}
