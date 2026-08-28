import { IdentifoldError } from "./errors.js";

export type RandomReferenceProfile = "compact" | "high" | "standard";

export interface RandomReferenceDefinition {
  readonly prefix: string;
  readonly strategy: "random";
  readonly profile?: RandomReferenceProfile;
}

export interface SequentialReferenceDefinition {
  readonly prefix: string;
  readonly strategy: "sequence";
  readonly scope?: "calendar-year" | "none";
  readonly width: number;
}

export type ReferenceDefinition =
  RandomReferenceDefinition | SequentialReferenceDefinition;

export interface NamespaceDefinition<PublicPrefix extends string = string> {
  readonly publicPrefix: PublicPrefix;
  readonly reference?: ReferenceDefinition;
}

export interface RegisteredRandomReferenceDefinition {
  readonly payloadLength: 8 | 10 | 12;
  readonly prefix: string;
  readonly profile: RandomReferenceProfile;
  readonly strategy: "random";
}

export interface RegisteredSequentialReferenceDefinition {
  readonly prefix: string;
  readonly scope: "calendar-year" | "none";
  readonly strategy: "sequence";
  readonly width: number;
}

export type RegisteredReferenceDefinition =
  RegisteredRandomReferenceDefinition | RegisteredSequentialReferenceDefinition;

export interface RegisteredNamespaceDefinition<
  PublicPrefix extends string = string,
> {
  readonly publicPrefix: PublicPrefix;
  readonly reference?: RegisteredReferenceDefinition;
}

export interface NamespaceRegistry {
  readonly definitions: readonly RegisteredNamespaceDefinition[];
  getByPublicPrefix(
    publicPrefix: string,
  ): RegisteredNamespaceDefinition | undefined;
  getByReferencePrefix(
    referencePrefix: string,
  ): RegisteredNamespaceDefinition | undefined;
}

export function createNamespaceRegistry(
  definitions: readonly NamespaceDefinition[],
): NamespaceRegistry {
  const byPublicPrefix = new Map<string, RegisteredNamespaceDefinition>();
  const byReferencePrefix = new Map<string, RegisteredNamespaceDefinition>();
  const registered: RegisteredNamespaceDefinition[] = [];

  for (const definition of definitions) {
    validatePublicPrefix(definition.publicPrefix);

    if (byPublicPrefix.has(definition.publicPrefix)) {
      throw new IdentifoldError(
        "duplicate_public_prefix",
        "Public identifier prefixes must be unique",
      );
    }

    const reference = registerReference(definition.reference);
    if (reference !== undefined) {
      const referencePrefix = reference.prefix.toUpperCase();
      if (byReferencePrefix.has(referencePrefix)) {
        throw new IdentifoldError(
          "duplicate_ref_prefix",
          "Human reference prefixes must be unique",
        );
      }

      for (const registeredPrefix of byReferencePrefix.keys()) {
        if (
          registeredPrefix.startsWith(referencePrefix) ||
          referencePrefix.startsWith(registeredPrefix)
        ) {
          throw new IdentifoldError(
            "ambiguous_ref_prefix",
            "Human reference prefixes must be prefix-free",
          );
        }
      }
    }

    const namespace = Object.freeze(
      reference === undefined
        ? { publicPrefix: definition.publicPrefix }
        : { publicPrefix: definition.publicPrefix, reference },
    );

    registered.push(namespace);
    byPublicPrefix.set(namespace.publicPrefix, namespace);
    if (namespace.reference !== undefined) {
      byReferencePrefix.set(
        namespace.reference.prefix.toUpperCase(),
        namespace,
      );
    }
  }

  const frozenDefinitions = Object.freeze(registered);

  return Object.freeze({
    definitions: frozenDefinitions,
    getByPublicPrefix(publicPrefix: string) {
      return byPublicPrefix.get(publicPrefix);
    },
    getByReferencePrefix(referencePrefix: string) {
      return byReferencePrefix.get(referencePrefix.toUpperCase());
    },
  });
}

const TYPE_ID_PREFIX = /^([a-z]([a-z_]{0,61}[a-z])?)?$/;
const REFERENCE_PREFIX = /^[A-Z]{2,8}$/;
const PROFILE_LENGTHS = {
  compact: 8,
  high: 12,
  standard: 10,
} as const satisfies Record<RandomReferenceProfile, 8 | 10 | 12>;

function validatePublicPrefix(publicPrefix: string): void {
  if (publicPrefix.length === 0 || !TYPE_ID_PREFIX.test(publicPrefix)) {
    throw new IdentifoldError(
      "invalid_public_prefix",
      "Invalid public identifier prefix",
    );
  }
}

function registerReference(
  reference: ReferenceDefinition | undefined,
): RegisteredReferenceDefinition | undefined {
  if (reference === undefined) {
    return undefined;
  }

  if (!REFERENCE_PREFIX.test(reference.prefix)) {
    throw new IdentifoldError(
      "invalid_ref_prefix",
      "Human reference prefixes must contain 2 to 8 uppercase ASCII letters",
    );
  }

  const strategy: string = reference.strategy;

  if (strategy === "random") {
    const randomReference = reference as RandomReferenceDefinition;
    const profile = randomReference.profile ?? "standard";
    if (!(profile in PROFILE_LENGTHS)) {
      throw new IdentifoldError(
        "invalid_namespace_definition",
        "Unknown random reference profile",
      );
    }

    return Object.freeze({
      payloadLength: PROFILE_LENGTHS[profile],
      prefix: randomReference.prefix,
      profile,
      strategy: "random",
    });
  }

  if (strategy === "sequence") {
    const sequentialReference = reference as SequentialReferenceDefinition;
    if (
      !Number.isSafeInteger(sequentialReference.width) ||
      sequentialReference.width < 4 ||
      sequentialReference.width > 18
    ) {
      throw new IdentifoldError(
        "invalid_ref_length",
        "Sequential reference width must be between 4 and 18 digits",
      );
    }

    return Object.freeze({
      prefix: sequentialReference.prefix,
      scope: sequentialReference.scope ?? "none",
      strategy: "sequence",
      width: sequentialReference.width,
    });
  }

  throw new IdentifoldError(
    "invalid_namespace_definition",
    "Unknown human reference strategy",
  );
}
