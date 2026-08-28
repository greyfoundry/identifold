import { IdentifoldError } from "./errors.js";
import type {
  Identifold,
  IdentifierKind,
  ParsedIdentifier,
} from "./service.js";

export type IdentifierBoundaryErrorCode =
  "invalid_identifier" | "unexpected_identifier_kind";

export class IdentifierBoundaryError extends Error {
  readonly code: IdentifierBoundaryErrorCode;
  readonly status = 400;

  constructor(code: IdentifierBoundaryErrorCode) {
    super(
      code === "invalid_identifier"
        ? "Invalid identifier input"
        : "Unexpected identifier kind",
    );
    this.name = "IdentifierBoundaryError";
    this.code = code;
  }
}

export function createIdentifierParser(
  ids: Identifold,
  expectedKind?: IdentifierKind,
) {
  return (value: unknown): ParsedIdentifier => {
    if (typeof value !== "string")
      throw new IdentifierBoundaryError("invalid_identifier");
    try {
      const parsed = ids.parse(value);
      if (expectedKind !== undefined && parsed.kind !== expectedKind) {
        throw new IdentifierBoundaryError("unexpected_identifier_kind");
      }
      return parsed;
    } catch (error) {
      if (error instanceof IdentifierBoundaryError) throw error;
      if (error instanceof IdentifoldError)
        throw new IdentifierBoundaryError("invalid_identifier");
      throw error;
    }
  };
}
