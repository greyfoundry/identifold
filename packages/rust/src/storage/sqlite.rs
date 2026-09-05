use std::sync::Mutex;

use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};

use super::{
    ReferenceMapping, ReferenceReservation, SequenceAllocationRequest, StorageAdapter,
    StorageFuture,
};
use crate::Error;

pub struct SqliteStorageAdapter {
    connection: Mutex<Connection>,
}

impl SqliteStorageAdapter {
    pub fn new(connection: Connection) -> Self {
        Self {
            connection: Mutex::new(connection),
        }
    }
}

impl StorageAdapter for SqliteStorageAdapter {
    fn reserve<'a>(&'a self, request: &'a ReferenceReservation) -> StorageFuture<'a, bool> {
        Box::pin(async move {
            let connection = self.connection.lock().map_err(|_| conflict())?;
            let changed = connection
                .execute(
                    "INSERT INTO identifold_references \
                     (reference, namespace, machine_id) VALUES (?1, ?2, ?3) \
                     ON CONFLICT(reference) DO NOTHING",
                    params![
                        request.reference,
                        request.namespace,
                        machine_id_bytes(&request.machine_id)?
                    ],
                )
                .map_err(map_error)?;
            Ok(changed == 1)
        })
    }

    fn resolve<'a>(
        &'a self,
        reference: &'a str,
        namespace: &'a str,
    ) -> StorageFuture<'a, Option<ReferenceMapping>> {
        Box::pin(async move {
            let connection = self.connection.lock().map_err(|_| conflict())?;
            let random = connection
                .query_row(
                    "SELECT machine_id, namespace FROM identifold_references \
                     WHERE reference = ?1 AND namespace = ?2",
                    params![reference, namespace],
                    mapping,
                )
                .optional()
                .map_err(map_error)?;
            if random.is_some() {
                return Ok(random);
            }

            let Some((prefix, scope, sequence)) = parse_sequential_reference(reference) else {
                return Ok(None);
            };
            connection
                .query_row(
                    "SELECT machine_id, namespace FROM identifold_sequence_allocations \
                     WHERE namespace = ?1 AND reference_prefix = ?2 \
                     AND scope = ?3 AND sequence = ?4",
                    params![namespace, prefix, scope, sequence],
                    mapping,
                )
                .optional()
                .map_err(map_error)
        })
    }

    fn allocate<'a>(&'a self, request: &'a SequenceAllocationRequest) -> StorageFuture<'a, u64> {
        Box::pin(async move {
            if !(4..=18).contains(&request.width) {
                return Err(Error("invalid_allocation_policy"));
            }
            let mut connection = self.connection.lock().map_err(|_| conflict())?;
            let transaction = connection
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(map_error)?;
            let scope = request.scope.as_deref().unwrap_or("");
            let machine_id = machine_id_bytes(&request.machine_id)?;

            let replay = transaction
                .query_row(
                    "SELECT sequence, reference_prefix, width \
                     FROM identifold_sequence_allocations \
                     WHERE namespace = ?1 AND scope = ?2 AND machine_id = ?3",
                    params![request.namespace, scope, machine_id],
                    |row| {
                        Ok((
                            row.get::<_, i64>(0)?,
                            row.get::<_, String>(1)?,
                            row.get::<_, u8>(2)?,
                        ))
                    },
                )
                .optional()
                .map_err(map_error)?;
            if let Some((sequence, prefix, width)) = replay {
                if prefix != request.reference_prefix || width != request.width {
                    return Err(Error("invalid_allocation_policy"));
                }
                transaction.commit().map_err(map_error)?;
                return u64::try_from(sequence).map_err(|_| conflict());
            }

            transaction
                .execute(
                    "INSERT INTO identifold_sequences \
                     (namespace, scope, reference_prefix, width, last_value) \
                     VALUES (?1, ?2, ?3, ?4, 0) ON CONFLICT DO NOTHING",
                    params![
                        request.namespace,
                        scope,
                        request.reference_prefix,
                        request.width
                    ],
                )
                .map_err(map_error)?;
            let policy = transaction
                .query_row(
                    "SELECT reference_prefix, width, last_value FROM identifold_sequences \
                     WHERE namespace = ?1 AND scope = ?2",
                    params![request.namespace, scope],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, u8>(1)?,
                            row.get::<_, i64>(2)?,
                        ))
                    },
                )
                .optional()
                .map_err(map_error)?
                .ok_or_else(conflict)?;
            if policy.0 != request.reference_prefix || policy.1 != request.width {
                return Err(Error("invalid_allocation_policy"));
            }
            let maximum = 10_i64.pow(u32::from(request.width)) - 1;
            if policy.2 >= maximum {
                return Err(Error("sequence_overflow"));
            }
            let allocated = policy.2 + 1;
            transaction
                .execute(
                    "UPDATE identifold_sequences SET last_value = ?1 \
                     WHERE namespace = ?2 AND scope = ?3",
                    params![allocated, request.namespace, scope],
                )
                .map_err(map_error)?;
            transaction
                .execute(
                    "INSERT INTO identifold_sequence_allocations \
                     (namespace, scope, sequence, machine_id, reference_prefix, width) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        request.namespace,
                        scope,
                        allocated,
                        machine_id,
                        request.reference_prefix,
                        request.width
                    ],
                )
                .map_err(map_error)?;
            transaction.commit().map_err(map_error)?;
            u64::try_from(allocated).map_err(|_| conflict())
        })
    }
}

fn mapping(row: &rusqlite::Row<'_>) -> rusqlite::Result<ReferenceMapping> {
    let bytes: Vec<u8> = row.get(0)?;
    let machine_id = bytes_machine_id(&bytes).map_err(|_| rusqlite::Error::InvalidQuery)?;
    Ok(ReferenceMapping {
        machine_id,
        namespace: row.get(1)?,
    })
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

fn machine_id_bytes(value: &str) -> Result<Vec<u8>, Error> {
    let hex: String = value.chars().filter(|value| *value != '-').collect();
    if hex.len() != 32 || !hex.bytes().all(|value| value.is_ascii_hexdigit()) {
        return Err(conflict());
    }
    (0..32)
        .step_by(2)
        .map(|index| u8::from_str_radix(&hex[index..index + 2], 16).map_err(|_| conflict()))
        .collect()
}

fn bytes_machine_id(value: &[u8]) -> Result<String, Error> {
    if value.len() != 16 {
        return Err(conflict());
    }
    let hex: String = value.iter().map(|byte| format!("{byte:02x}")).collect();
    Ok(format!(
        "{}-{}-{}-{}-{}",
        &hex[0..8],
        &hex[8..12],
        &hex[12..16],
        &hex[16..20],
        &hex[20..32]
    ))
}

fn map_error(_: rusqlite::Error) -> Error {
    conflict()
}

fn conflict() -> Error {
    Error("allocation_conflict")
}
