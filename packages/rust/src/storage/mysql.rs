use std::time::Duration;

use mysql_async::{Error as MySqlError, Pool, params, prelude::Queryable};

use super::{
    ReferenceMapping, ReferenceReservation, SequenceAllocationRequest, StorageAdapter,
    StorageFuture,
};
use crate::Error;

pub struct MySqlStorageAdapter {
    pool: Pool,
}

impl MySqlStorageAdapter {
    pub fn new(pool: Pool) -> Self {
        Self { pool }
    }
}

impl StorageAdapter for MySqlStorageAdapter {
    fn reserve<'a>(&'a self, request: &'a ReferenceReservation) -> StorageFuture<'a, bool> {
        Box::pin(async move {
            let mut connection = self.pool.get_conn().await.map_err(map_error)?;
            let row: Option<(u8,)> = connection
                .exec_first(
                    "CALL identifold_reserve_reference(:machine_id, :namespace, :reference)",
                    params! {
                        "machine_id" => machine_id_bytes(&request.machine_id)?,
                        "namespace" => request.namespace.as_str(),
                        "reference" => request.reference.as_str(),
                    },
                )
                .await
                .map_err(map_error)?;
            match row {
                Some((0,)) => Ok(false),
                Some((1,)) => Ok(true),
                _ => Err(conflict()),
            }
        })
    }

    fn resolve<'a>(
        &'a self,
        reference: &'a str,
        namespace: &'a str,
    ) -> StorageFuture<'a, Option<ReferenceMapping>> {
        Box::pin(async move {
            let mut connection = self.pool.get_conn().await.map_err(map_error)?;
            let random: Option<(Vec<u8>, String)> = connection
                .exec_first(
                    "SELECT machine_id, namespace FROM identifold_references \
                     WHERE reference = :reference AND namespace = :namespace",
                    params! {
                        "reference" => reference,
                        "namespace" => namespace,
                    },
                )
                .await
                .map_err(map_error)?;
            if let Some((machine_id, namespace)) = random {
                return Ok(Some(mapping(machine_id, namespace)?));
            }

            let Some((prefix, scope, sequence)) = parse_sequential_reference(reference) else {
                return Ok(None);
            };
            let row: Option<(Vec<u8>, String)> = connection
                .exec_first(
                    "SELECT machine_id, namespace FROM identifold_sequence_allocations \
                     WHERE namespace = :namespace AND reference_prefix = :prefix \
                     AND scope = :scope AND sequence = :sequence",
                    params! {
                        "namespace" => namespace,
                        "prefix" => prefix,
                        "scope" => scope,
                        "sequence" => sequence,
                    },
                )
                .await
                .map_err(map_error)?;
            row.map(|(machine_id, namespace)| mapping(machine_id, namespace))
                .transpose()
        })
    }

    fn allocate<'a>(&'a self, request: &'a SequenceAllocationRequest) -> StorageFuture<'a, u64> {
        Box::pin(async move {
            let machine_id = machine_id_bytes(&request.machine_id)?;
            for attempt in 0..5 {
                let result = allocate_once(&self.pool, request, &machine_id).await;
                match result {
                    Ok(sequence) => return Ok(sequence),
                    Err(error) if attempt < 4 && is_transient(&error) => {
                        tokio::time::sleep(Duration::from_millis(1 << attempt)).await;
                    }
                    Err(error) => return Err(map_error(error)),
                }
            }
            Err(conflict())
        })
    }
}

async fn allocate_once(
    pool: &Pool,
    request: &SequenceAllocationRequest,
    machine_id: &[u8],
) -> Result<u64, MySqlError> {
    let mut connection = pool.get_conn().await?;
    let row: Option<(u64,)> = connection
        .exec_first(
            "CALL identifold_allocate_sequence(\
             :machine_id, :namespace, :reference_prefix, :scope, :width)",
            params! {
                "machine_id" => machine_id,
                "namespace" => request.namespace.as_str(),
                "reference_prefix" => request.reference_prefix.as_str(),
                "scope" => request.scope.as_deref(),
                "width" => request.width,
            },
        )
        .await?;
    row.map(|value| value.0)
        .ok_or_else(|| MySqlError::Other(Box::new(StorageResultError)))
}

#[derive(Debug)]
struct StorageResultError;

impl std::fmt::Display for StorageResultError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("invalid storage result")
    }
}

impl std::error::Error for StorageResultError {}

fn mapping(machine_id: Vec<u8>, namespace: String) -> Result<ReferenceMapping, Error> {
    Ok(ReferenceMapping {
        machine_id: machine_id_string(&machine_id)?,
        namespace,
    })
}

fn machine_id_bytes(value: &str) -> Result<Vec<u8>, Error> {
    let hexadecimal: String = value.chars().filter(|value| *value != '-').collect();
    if hexadecimal.len() != 32 || !hexadecimal.bytes().all(|value| value.is_ascii_hexdigit()) {
        return Err(conflict());
    }
    (0..32)
        .step_by(2)
        .map(|index| u8::from_str_radix(&hexadecimal[index..index + 2], 16).map_err(|_| conflict()))
        .collect()
}

fn machine_id_string(value: &[u8]) -> Result<String, Error> {
    if value.len() != 16 {
        return Err(conflict());
    }
    let hexadecimal: String = value.iter().map(|byte| format!("{byte:02x}")).collect();
    Ok(format!(
        "{}-{}-{}-{}-{}",
        &hexadecimal[0..8],
        &hexadecimal[8..12],
        &hexadecimal[12..16],
        &hexadecimal[16..20],
        &hexadecimal[20..32]
    ))
}

fn parse_sequential_reference(reference: &str) -> Option<(&str, &str, &str)> {
    let parts: Vec<_> = reference.split('-').collect();
    let (prefix, scope, sequence, check) = match parts.as_slice() {
        [prefix, sequence, check] => (*prefix, "", *sequence, *check),
        [prefix, scope, sequence, check] => (*prefix, *scope, *sequence, *check),
        _ => return None,
    };
    if !(2..=8).contains(&prefix.len())
        || !prefix.bytes().all(|value| value.is_ascii_uppercase())
        || (!scope.is_empty()
            && (scope.len() != 4 || !scope.bytes().all(|value| value.is_ascii_digit())))
        || !(4..=18).contains(&sequence.len())
        || !sequence.bytes().all(|value| value.is_ascii_digit())
        || check.len() != 1
    {
        return None;
    }
    Some((prefix, scope, sequence))
}

fn map_error(error: MySqlError) -> Error {
    match error {
        MySqlError::Server(error) if error.state == "22003" => Error("sequence_overflow"),
        MySqlError::Server(error) if error.state == "22023" => Error("invalid_allocation_policy"),
        _ => conflict(),
    }
}

fn is_transient(error: &MySqlError) -> bool {
    matches!(
        error,
        MySqlError::Server(error)
            if error.code == 1205 || error.code == 1213 || error.state == "40001"
    )
}

fn conflict() -> Error {
    Error("allocation_conflict")
}
