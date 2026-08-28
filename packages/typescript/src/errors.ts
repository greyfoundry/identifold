export type IdentifoldErrorCode =
  | "allocation_conflict"
  | "allocation_exhausted"
  | "allocation_required"
  | "ambiguous_ref_prefix"
  | "duplicate_public_prefix"
  | "duplicate_ref_prefix"
  | "invalid_checksum"
  | "invalid_allocation_policy"
  | "invalid_kind"
  | "invalid_mid"
  | "invalid_namespace_definition"
  | "invalid_pid"
  | "invalid_public_prefix"
  | "invalid_random_source"
  | "invalid_ref"
  | "invalid_ref_length"
  | "invalid_ref_prefix"
  | "invalid_ref_symbol"
  | "sequence_overflow"
  | "unknown_namespace"
  | "invalid_uuid_version";

export class IdentifoldError extends Error {
  readonly code: IdentifoldErrorCode;

  constructor(code: IdentifoldErrorCode, message: string) {
    super(message);
    this.name = "IdentifoldError";
    this.code = code;
  }
}
