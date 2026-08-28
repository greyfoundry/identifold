export const IDENTIFOLD_ERROR_CODES = Object.freeze([
  "allocation_conflict",
  "allocation_exhausted",
  "allocation_required",
  "ambiguous_ref_prefix",
  "duplicate_public_prefix",
  "duplicate_ref_prefix",
  "invalid_allocation_policy",
  "invalid_checksum",
  "invalid_kind",
  "invalid_mid",
  "invalid_namespace_definition",
  "invalid_pid",
  "invalid_public_prefix",
  "invalid_random_source",
  "invalid_ref",
  "invalid_ref_length",
  "invalid_ref_prefix",
  "invalid_ref_symbol",
  "invalid_uuid_version",
  "sequence_overflow",
  "unknown_namespace",
] as const);

export type IdentifoldErrorCode = (typeof IDENTIFOLD_ERROR_CODES)[number];

export class IdentifoldError extends Error {
  readonly code: IdentifoldErrorCode;

  constructor(code: IdentifoldErrorCode, message: string) {
    super(message);
    this.name = "IdentifoldError";
    this.code = code;
  }
}
