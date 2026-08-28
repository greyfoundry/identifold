import { IdentifoldError } from "./errors.js";
import type { NamespaceRegistry } from "./registry.js";
import type {
  RegisteredNamespaceDefinition,
  RegisteredRandomReferenceDefinition,
} from "./registry.js";

declare const humanReferenceBrand: unique symbol;

export type HumanReference = string & {
  readonly [humanReferenceBrand]: true;
};

export type RandomByteSource = (size: number) => Uint8Array;

export interface CreateReferenceCandidateOptions {
  readonly randomBytes?: RandomByteSource;
}

export interface ParsedReference {
  readonly value: HumanReference;
  readonly namespace: string;
  readonly payload: string;
  readonly checkSymbol: string;
  readonly strategy: "random" | "sequence";
}

const DATA_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CHECK_ALPHABET = `${DATA_ALPHABET}*~$=U`;

export function calculateReferenceCheckSymbol(payload: string): string {
  if (payload.length === 0) {
    throw new IdentifoldError(
      "invalid_ref_length",
      "Human reference payloads cannot be empty",
    );
  }

  let remainder = 0;
  for (const symbol of payload) {
    const value = DATA_ALPHABET.indexOf(symbol);
    if (value < 0) {
      throw new IdentifoldError(
        "invalid_ref_symbol",
        "Human reference payload contains an invalid symbol",
      );
    }
    remainder = (remainder * 32 + value) % 37;
  }

  return CHECK_ALPHABET.charAt(remainder);
}

export function createReferenceCandidate(
  registry: NamespaceRegistry,
  namespace: string,
  options: CreateReferenceCandidateOptions = {},
): HumanReference {
  const definition = requireRandomNamespace(registry, namespace);
  const randomBytes = options.randomBytes ?? secureRandomBytes;
  const bytes = randomBytes(definition.reference.payloadLength);

  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length !== definition.reference.payloadLength
  ) {
    throw new IdentifoldError(
      "invalid_random_source",
      "Random byte source returned an invalid byte array",
    );
  }

  let payload = "";
  for (const byte of bytes) {
    payload += DATA_ALPHABET.charAt(byte & 31);
  }

  return formatReference(
    definition.reference.prefix,
    payload,
    calculateReferenceCheckSymbol(payload),
  );
}

export function parseReference(
  value: string,
  registry: NamespaceRegistry,
): ParsedReference {
  if (
    value.length === 0 ||
    value.length > 100 ||
    !/^[A-Za-z0-9*~$=_-]+$/.test(value)
  ) {
    throw new IdentifoldError("invalid_ref", "Invalid human reference");
  }

  const upper = value.toUpperCase();
  const located = locateNamespace(upper, registry);
  const definition = located.definition;

  if (definition.reference?.strategy !== "random") {
    throw new IdentifoldError(
      "invalid_namespace_definition",
      "Human reference strategy is not implemented by this codec",
    );
  }

  const body = located.body.replaceAll("-", "");
  if (body.length !== definition.reference.payloadLength + 1) {
    throw new IdentifoldError(
      "invalid_ref_length",
      "Human reference payload has the wrong length",
    );
  }
  validateHyphenation(located.body, definition.reference.payloadLength);

  const rawPayload = body.slice(0, -1);
  const checkSymbol = body.slice(-1);
  const payload = normalizePayload(rawPayload);

  if (!CHECK_ALPHABET.includes(checkSymbol)) {
    throw new IdentifoldError(
      "invalid_ref_symbol",
      "Human reference check symbol is invalid",
    );
  }

  if (calculateReferenceCheckSymbol(payload) !== checkSymbol) {
    throw new IdentifoldError(
      "invalid_checksum",
      "Human reference check symbol does not match its payload",
    );
  }

  return {
    value: formatReference(definition.reference.prefix, payload, checkSymbol),
    namespace: definition.publicPrefix,
    payload,
    checkSymbol,
    strategy: definition.reference.strategy,
  };
}

export function normalizeReference(
  value: string,
  registry: NamespaceRegistry,
): HumanReference {
  return parseReference(value, registry).value;
}

function validateHyphenation(body: string, payloadLength: number): void {
  if (!body.includes("-")) {
    return;
  }

  const expectedGroupLengths: number[] = [];
  for (let remaining = payloadLength; remaining > 0; remaining -= 4) {
    expectedGroupLengths.push(Math.min(4, remaining));
  }
  expectedGroupLengths.push(1);

  const actualGroupLengths = body.split("-").map((group) => group.length);
  if (
    actualGroupLengths.length !== expectedGroupLengths.length ||
    actualGroupLengths.some(
      (length, index) => length !== expectedGroupLengths[index],
    )
  ) {
    throw new IdentifoldError(
      "invalid_ref",
      "Human reference hyphenation is not canonical",
    );
  }
}

function secureRandomBytes(size: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(size));
}

function requireRandomNamespace(
  registry: NamespaceRegistry,
  namespace: string,
): RegisteredNamespaceDefinition & {
  readonly reference: RegisteredRandomReferenceDefinition;
} {
  const definition = registry.getByPublicPrefix(namespace);
  if (definition === undefined) {
    throw new IdentifoldError(
      "unknown_namespace",
      "Unknown public identifier namespace",
    );
  }
  if (definition.reference?.strategy !== "random") {
    throw new IdentifoldError(
      "invalid_namespace_definition",
      "Namespace does not use random human references",
    );
  }
  return definition as RegisteredNamespaceDefinition & {
    readonly reference: RegisteredRandomReferenceDefinition;
  };
}

function formatReference(
  prefix: string,
  payload: string,
  checkSymbol: string,
): HumanReference {
  const groups: string[] = [];
  for (let index = 0; index < payload.length; index += 4) {
    groups.push(payload.slice(index, index + 4));
  }
  return `${prefix}-${groups.join("-")}-${checkSymbol}` as HumanReference;
}

function normalizePayload(payload: string): string {
  let normalized = "";
  for (const rawSymbol of payload) {
    const symbol =
      rawSymbol === "O"
        ? "0"
        : rawSymbol === "I" || rawSymbol === "L"
          ? "1"
          : rawSymbol;
    if (!DATA_ALPHABET.includes(symbol)) {
      throw new IdentifoldError(
        "invalid_ref_symbol",
        "Human reference payload contains an invalid symbol",
      );
    }
    normalized += symbol;
  }
  return normalized;
}

function locateNamespace(
  value: string,
  registry: NamespaceRegistry,
): {
  readonly body: string;
  readonly definition: RegisteredNamespaceDefinition;
} {
  const firstHyphen = value.indexOf("-");
  if (firstHyphen >= 0) {
    const prefix = value.slice(0, firstHyphen);
    const definition = registry.getByReferencePrefix(prefix);
    if (definition !== undefined) {
      return { body: value.slice(firstHyphen + 1), definition };
    }
  } else {
    for (const definition of registry.definitions) {
      const prefix = definition.reference?.prefix;
      if (prefix !== undefined && value.startsWith(prefix)) {
        return { body: value.slice(prefix.length), definition };
      }
    }
  }

  throw new IdentifoldError(
    "unknown_namespace",
    "Unknown human reference namespace",
  );
}
