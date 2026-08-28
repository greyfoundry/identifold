import type { ParsedIdentifier } from "./service.js";

export function identifierLogFields(
  parsed: ParsedIdentifier,
): Readonly<Record<string, string | number>> {
  if (parsed.kind === "mid") {
    return Object.freeze({
      "identifier.kind": "mid",
      "identifier.uuid_version": 7,
    });
  }
  if (parsed.kind === "pid") {
    return Object.freeze({
      "identifier.kind": "pid",
      "identifier.namespace": parsed.namespace,
      "identifier.uuid_version": 7,
    });
  }
  return Object.freeze({
    "identifier.kind": "ref",
    "identifier.namespace": parsed.namespace,
    "identifier.reference_strategy": parsed.strategy,
  });
}
