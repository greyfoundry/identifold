use std::io;

use identifold::{
    Error, NamespaceDefinition, create_reference_candidate, format_sequential_reference, normalize,
    parse_machine_id, parse_public_id, public_id_from_machine_id,
};
use serde::Deserialize;
use serde_json::{Value, json};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Request {
    operation: String,
    #[serde(default)]
    input: String,
    #[serde(default)]
    machine_id: String,
    #[serde(default)]
    namespace: String,
    #[serde(default)]
    random_bytes: Vec<u8>,
    #[serde(default)]
    sequence: String,
    #[serde(default)]
    scope: String,
    #[serde(default)]
    registry: Vec<NamespaceDefinition>,
}

fn run(request: &Request) -> Result<Value, Error> {
    match request.operation.as_str() {
        "parseMachineId" => Ok(json!(parse_machine_id(&request.input)?)),
        "publicIdFromMachineId" => Ok(json!(public_id_from_machine_id(
            &request.machine_id,
            &request.namespace
        )?)),
        "parsePublicId" => Ok(json!(parse_public_id(&request.input)?)),
        "createReferenceCandidate" => Ok(json!(create_reference_candidate(
            &request.registry,
            &request.namespace,
            &request.random_bytes
        )?)),
        "formatSequentialReference" => Ok(json!(format_sequential_reference(
            &request.registry,
            &request.namespace,
            &request.sequence,
            &request.scope
        )?)),
        "normalize" | "parseReference" | "inspect" => {
            Ok(json!(normalize(&request.input, &request.registry)?))
        }
        _ => Err(Error("invalid_kind")),
    }
}

fn main() {
    let request: Request = serde_json::from_reader(io::stdin()).expect("valid request");
    let response = match run(&request) {
        Ok(value) => json!({"ok": true, "value": value}),
        Err(error) => json!({"ok": false, "errorCode": error.0}),
    };
    serde_json::to_writer(io::stdout(), &response).expect("write response");
}
