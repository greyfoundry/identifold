use std::sync::Arc;

use tokio_postgres::Client;

use super::{
    ReferenceMapping, ReferenceReservation, SequenceAllocationRequest, StorageAdapter,
    StorageFuture,
};
use crate::Error;

pub struct PostgresStorageAdapter {
    client: Arc<Client>,
}

impl PostgresStorageAdapter {
    pub fn new(client: Arc<Client>) -> Self {
        Self { client }
    }
}

impl StorageAdapter for PostgresStorageAdapter {
    fn reserve<'a>(&'a self, request: &'a ReferenceReservation) -> StorageFuture<'a, bool> {
        Box::pin(async move {
            let row = self
                .client
                .query_one(
                    "SELECT identifold_reserve_reference($1::text::uuid, $2::text, $3::text)",
                    &[&request.machine_id, &request.namespace, &request.reference],
                )
                .await
                .map_err(map_error)?;
            Ok(row.get(0))
        })
    }

    fn resolve<'a>(
        &'a self,
        reference: &'a str,
        namespace: &'a str,
    ) -> StorageFuture<'a, Option<ReferenceMapping>> {
        Box::pin(async move {
            let row = self
                .client
                .query_opt(
                    "SELECT resolved_machine_id::text, resolved_namespace FROM identifold_resolve_reference($1::text, $2::text)",
                    &[&reference, &namespace],
                )
                .await
                .map_err(map_error)?;
            Ok(row.map(|value| ReferenceMapping {
                machine_id: value.get(0),
                namespace: value.get(1),
            }))
        })
    }

    fn allocate<'a>(&'a self, request: &'a SequenceAllocationRequest) -> StorageFuture<'a, u64> {
        Box::pin(async move {
            let width = i16::from(request.width);
            let row = self
                .client
                .query_one(
                    "SELECT identifold_allocate_sequence($1::text::uuid, $2::text, $3::text, $4::text, $5::smallint)",
                    &[
                        &request.machine_id,
                        &request.namespace,
                        &request.reference_prefix,
                        &request.scope,
                        &width,
                    ],
                )
                .await
                .map_err(map_error)?;
            let sequence: i64 = row.get(0);
            u64::try_from(sequence).map_err(|_| Error("allocation_conflict"))
        })
    }
}

fn map_error(error: tokio_postgres::Error) -> Error {
    match error.as_db_error().map(|value| value.code().code()) {
        Some("22003") => Error("sequence_overflow"),
        Some("22023") => Error("invalid_allocation_policy"),
        _ => Error("allocation_conflict"),
    }
}
