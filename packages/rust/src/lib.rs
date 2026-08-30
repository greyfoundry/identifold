use serde::{Deserialize, Serialize};

pub mod storage;

const DATA: &str = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CHECK: &str = "0123456789ABCDEFGHJKMNPQRSTVWXYZ*~$=U";
const TYPEID: &str = "0123456789abcdefghjkmnpqrstvwxyz";

#[derive(Debug)]
pub struct Error(pub &'static str);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedPublicId {
    pub value: String,
    pub namespace: String,
    pub machine_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NamespaceDefinition {
    pub public_prefix: String,
    pub reference: Option<ReferenceDefinition>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceDefinition {
    pub prefix: String,
    #[serde(default)]
    pub profile: String,
    pub strategy: String,
    #[serde(default)]
    pub scope: String,
    #[serde(default)]
    pub width: usize,
}

pub fn parse_machine_id(value: &str) -> Result<String, Error> {
    let value = value.to_ascii_lowercase();
    let valid = value.len() == 36
        && [8, 13, 18, 23]
            .iter()
            .all(|index| value.as_bytes()[*index] == b'-')
        && value
            .chars()
            .enumerate()
            .all(|(index, symbol)| [8, 13, 18, 23].contains(&index) || symbol.is_ascii_hexdigit());
    if !valid {
        return Err(Error("invalid_mid"));
    }
    if value.as_bytes()[14] != b'7' {
        return Err(Error("invalid_uuid_version"));
    }
    if !matches!(value.as_bytes()[19], b'8' | b'9' | b'a' | b'b') {
        return Err(Error("invalid_mid"));
    }
    Ok(value)
}

fn prefix_valid(value: &str) -> bool {
    (1..=63).contains(&value.len())
        && value.starts_with(|c: char| c.is_ascii_lowercase())
        && value.ends_with(|c: char| c.is_ascii_lowercase())
        && value.chars().all(|c| c.is_ascii_lowercase() || c == '_')
}

fn machine_number(value: &str) -> Result<u128, Error> {
    let canonical = parse_machine_id(value)?;
    u128::from_str_radix(&canonical.replace('-', ""), 16).map_err(|_| Error("invalid_mid"))
}

fn format_machine(value: u128) -> String {
    let text = format!("{value:032x}");
    format!(
        "{}-{}-{}-{}-{}",
        &text[..8],
        &text[8..12],
        &text[12..16],
        &text[16..20],
        &text[20..]
    )
}

fn encode_suffix(mut value: u128) -> String {
    let alphabet = TYPEID.as_bytes();
    let mut result = [b'0'; 26];
    for index in (0..26).rev() {
        result[index] = alphabet[(value & 31) as usize];
        value >>= 5;
    }
    String::from_utf8(result.to_vec()).expect("ASCII alphabet")
}

fn decode_suffix(value: &str) -> Result<u128, Error> {
    if value.len() != 26 || value.as_bytes()[0] > b'7' {
        return Err(Error("invalid_pid"));
    }
    let mut result = 0_u128;
    for symbol in value.bytes() {
        let position = TYPEID
            .bytes()
            .position(|candidate| candidate == symbol)
            .ok_or(Error("invalid_pid"))? as u128;
        result = result.checked_shl(5).ok_or(Error("invalid_pid"))? | position;
    }
    Ok(result)
}

pub fn public_id_from_machine_id(machine_id: &str, namespace: &str) -> Result<String, Error> {
    if !prefix_valid(namespace) {
        return Err(Error("invalid_public_prefix"));
    }
    Ok(format!(
        "{namespace}_{}",
        encode_suffix(machine_number(machine_id)?)
    ))
}

pub fn parse_public_id(value: &str) -> Result<ParsedPublicId, Error> {
    if value != value.to_ascii_lowercase() {
        return Err(Error("invalid_pid"));
    }
    let (namespace, suffix) = value
        .rsplit_once('_')
        .ok_or(Error("invalid_public_prefix"))?;
    if !prefix_valid(namespace) {
        return Err(Error("invalid_public_prefix"));
    }
    let machine_id = format_machine(decode_suffix(suffix)?);
    if parse_machine_id(&machine_id).is_err() {
        return Err(Error("invalid_pid"));
    }
    Ok(ParsedPublicId {
        value: value.to_owned(),
        namespace: namespace.to_owned(),
        machine_id,
    })
}

pub fn check_symbol(payload: &str, sequential: bool) -> Option<char> {
    let alphabet = if sequential { "0123456789" } else { DATA };
    let base = if sequential { 10 } else { 32 };
    let mut remainder = 0;
    for symbol in payload.chars() {
        let position = alphabet.find(symbol)?;
        remainder = (remainder * base + position) % 37;
    }
    CHECK.chars().nth(remainder)
}

fn namespace<'a>(
    registry: &'a [NamespaceDefinition],
    name: &str,
) -> Result<&'a NamespaceDefinition, Error> {
    registry
        .iter()
        .find(|item| item.public_prefix == name)
        .ok_or(Error("unknown_namespace"))
}

fn profile_length(profile: &str) -> usize {
    match profile {
        "compact" => 8,
        "high" => 12,
        _ => 10,
    }
}

fn grouped(value: &str) -> String {
    value
        .as_bytes()
        .chunks(4)
        .map(|chunk| std::str::from_utf8(chunk).expect("ASCII"))
        .collect::<Vec<_>>()
        .join("-")
}

pub fn create_reference_candidate(
    registry: &[NamespaceDefinition],
    name: &str,
    bytes: &[u8],
) -> Result<String, Error> {
    let reference = namespace(registry, name)?
        .reference
        .as_ref()
        .filter(|item| item.strategy == "random")
        .ok_or(Error("unknown_namespace"))?;
    let length = profile_length(&reference.profile);
    if bytes.len() < length {
        return Err(Error("invalid_random_source"));
    }
    let payload: String = bytes[..length]
        .iter()
        .map(|value| DATA.as_bytes()[(value % 32) as usize] as char)
        .collect();
    Ok(format!(
        "{}-{}-{}",
        reference.prefix,
        grouped(&payload),
        check_symbol(&payload, false).expect("valid payload")
    ))
}

pub fn format_sequential_reference(
    registry: &[NamespaceDefinition],
    name: &str,
    sequence: &str,
    scope: &str,
) -> Result<String, Error> {
    let reference = namespace(registry, name)?
        .reference
        .as_ref()
        .filter(|item| item.strategy == "sequence")
        .ok_or(Error("unknown_namespace"))?;
    if sequence.len() > reference.width || !sequence.chars().all(|c| c.is_ascii_digit()) {
        return Err(Error("sequence_overflow"));
    }
    let sequence = format!("{:0>width$}", sequence, width = reference.width);
    let payload = format!("{scope}{sequence}");
    let check = check_symbol(&payload, true).ok_or(Error("invalid_ref_symbol"))?;
    if scope.is_empty() {
        Ok(format!("{}-{sequence}-{check}", reference.prefix))
    } else {
        Ok(format!("{}-{scope}-{sequence}-{check}", reference.prefix))
    }
}

pub fn normalize(value: &str, registry: &[NamespaceDefinition]) -> Result<String, Error> {
    if value.contains('_') {
        let parsed = parse_public_id(value)?;
        namespace(registry, &parsed.namespace)?;
        return Ok(parsed.value);
    }
    if value.len() == 36 {
        return parse_machine_id(value);
    }
    let compact = value.to_ascii_uppercase().replace('-', "");
    let definition = registry
        .iter()
        .find(|item| {
            item.reference
                .as_ref()
                .is_some_and(|r| compact.starts_with(&r.prefix))
        })
        .ok_or_else(|| {
            if value
                .chars()
                .take_while(|c| c.is_ascii_alphabetic())
                .count()
                >= 2
            {
                Error("unknown_namespace")
            } else {
                Error("invalid_kind")
            }
        })?;
    let reference = definition.reference.as_ref().expect("matched reference");
    let body = &compact[reference.prefix.len()..];
    if body.contains('?') || body.contains('_') {
        return Err(Error("invalid_ref"));
    }
    if reference.strategy == "sequence" {
        let scope_len = usize::from(reference.scope == "calendar-year") * 4;
        if body.len() != scope_len + reference.width + 1 {
            return Err(Error("invalid_ref_length"));
        }
        let (payload, supplied) = body.split_at(body.len() - 1);
        let expected = check_symbol(payload, true).ok_or(Error("invalid_ref_symbol"))?;
        if supplied != expected.to_string() {
            return Err(Error("invalid_checksum"));
        }
        return format_sequential_reference(
            registry,
            &definition.public_prefix,
            &payload[scope_len..],
            &payload[..scope_len],
        );
    }
    let length = profile_length(&reference.profile);
    if body.len() != length + 1 {
        return Err(Error("invalid_ref_length"));
    }
    let (payload, supplied) = body.split_at(length);
    let normalized = payload.replace('O', "0").replace(['I', 'L'], "1");
    let expected = check_symbol(&normalized, false).ok_or(Error("invalid_ref_symbol"))?;
    if supplied != expected.to_string() {
        return Err(Error("invalid_checksum"));
    }
    Ok(format!(
        "{}-{}-{supplied}",
        reference.prefix,
        grouped(&normalized)
    ))
}
