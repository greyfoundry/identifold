export type IdentifoldErrorCode =
  | "invalid_mid"
  | "invalid_pid"
  | "invalid_public_prefix"
  | "invalid_uuid_version";

export class IdentifoldError extends Error {
  readonly code: IdentifoldErrorCode;

  constructor(code: IdentifoldErrorCode, message: string) {
    super(message);
    this.name = "IdentifoldError";
    this.code = code;
  }
}
