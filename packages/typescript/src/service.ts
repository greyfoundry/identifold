import { IdentifoldError } from "./errors.js";
import { createMachineId, parseMachineId } from "./machine.js";
import type { MachineId } from "./machine.js";
import { parsePublicId, publicIdFromMachineId } from "./public.js";
import type { PublicId } from "./public.js";
import { createReferenceCandidate, parseReference } from "./reference.js";
import type { HumanReference, RandomByteSource } from "./reference.js";
import type { NamespaceRegistry } from "./registry.js";
import type { IdentifoldErrorCode } from "./errors.js";

export interface ReferenceReservation {
  readonly machineId: MachineId;
  readonly namespace: string;
  readonly reference: HumanReference;
}

export interface ReferenceStore {
  reserve(reservation: ReferenceReservation): Promise<boolean>;
}

export interface IdentifoldOptions {
  readonly maxReferenceAttempts?: number;
  readonly randomBytes?: RandomByteSource;
  readonly referenceStore?: ReferenceStore;
  readonly registry: NamespaceRegistry;
}

export interface Identity<Namespace extends string = string> {
  readonly mid: MachineId;
  readonly pid: PublicId<Namespace>;
  readonly ref?: HumanReference;
}

export type IdentifierKind = "mid" | "pid" | "ref";

export interface ParsedMachineIdentifier {
  readonly kind: "mid";
  readonly machineId: MachineId;
  readonly value: MachineId;
}

export interface ParsedPublicIdentifier {
  readonly kind: "pid";
  readonly machineId: MachineId;
  readonly namespace: string;
  readonly value: PublicId;
}

export interface ParsedHumanReference {
  readonly checkSymbol: string;
  readonly kind: "ref";
  readonly namespace: string;
  readonly payload: string;
  readonly strategy: "random" | "sequence";
  readonly value: HumanReference;
}

export type ParsedIdentifier =
  ParsedHumanReference | ParsedMachineIdentifier | ParsedPublicIdentifier;

export interface IdentityInspection {
  readonly checksumValid?: boolean;
  readonly errorCode?: IdentifoldErrorCode;
  readonly kind: IdentifierKind | "unknown";
  readonly machineId?: MachineId;
  readonly namespace?: string;
  readonly normalized?: string;
  readonly registryRecognized: boolean;
  readonly resolution?: "not-requested";
  readonly uuidVersion?: 7;
  readonly valid: boolean;
}

export interface Identifold {
  create<Namespace extends string>(
    namespace: Namespace,
  ): Promise<Identity<Namespace>>;
  inspect(value: string): IdentityInspection;
  normalize(value: string): string;
  parse(value: string): ParsedIdentifier;
  validate(value: string): boolean;
}

export function createIdentifold(options: IdentifoldOptions): Identifold {
  const maxReferenceAttempts = options.maxReferenceAttempts ?? 8;
  if (
    !Number.isSafeInteger(maxReferenceAttempts) ||
    maxReferenceAttempts < 1 ||
    maxReferenceAttempts > 100
  ) {
    throw new IdentifoldError(
      "invalid_allocation_policy",
      "Maximum reference attempts must be an integer between 1 and 100",
    );
  }

  return Object.freeze({
    async create<Namespace extends string>(
      namespace: Namespace,
    ): Promise<Identity<Namespace>> {
      const definition = options.registry.getByPublicPrefix(namespace);
      if (definition === undefined) {
        throw new IdentifoldError(
          "unknown_namespace",
          "Unknown public identifier namespace",
        );
      }

      const referenceDefinition = definition.reference;
      if (referenceDefinition === undefined) {
        const mid = createMachineId();
        const pid = publicIdFromMachineId(mid, namespace);
        return Object.freeze({ mid, pid });
      }
      if (referenceDefinition.strategy === "sequence") {
        throw new IdentifoldError(
          "allocation_required",
          "Sequential references require an external allocator",
        );
      }
      const referenceStore = options.referenceStore;
      if (referenceStore === undefined) {
        throw new IdentifoldError(
          "allocation_required",
          "Human references require an atomic reservation store",
        );
      }

      const mid = createMachineId();
      const pid = publicIdFromMachineId(mid, namespace);

      for (let attempt = 0; attempt < maxReferenceAttempts; attempt += 1) {
        const reference = createReferenceCandidate(
          options.registry,
          namespace,
          options.randomBytes === undefined
            ? undefined
            : { randomBytes: options.randomBytes },
        );
        const reserved = await referenceStore.reserve({
          machineId: mid,
          namespace,
          reference,
        });
        if (reserved) {
          return Object.freeze({ mid, pid, ref: reference });
        }
      }

      throw new IdentifoldError(
        "allocation_exhausted",
        "Could not reserve a unique human reference",
      );
    },
    inspect(value: string): IdentityInspection {
      const kind = detectIdentifierKind(value);
      if (kind === undefined) {
        return {
          kind: "unknown",
          valid: false,
          registryRecognized: false,
          errorCode: "invalid_kind",
        };
      }

      try {
        const parsed = parseIdentifier(value, kind, options.registry);
        if (parsed.kind === "mid") {
          return {
            kind,
            valid: true,
            normalized: parsed.value,
            machineId: parsed.machineId,
            registryRecognized: false,
            uuidVersion: 7,
          };
        }
        if (parsed.kind === "pid") {
          return {
            kind,
            valid: true,
            normalized: parsed.value,
            namespace: parsed.namespace,
            machineId: parsed.machineId,
            registryRecognized: true,
            uuidVersion: 7,
          };
        }
        return {
          kind,
          valid: true,
          normalized: parsed.value,
          namespace: parsed.namespace,
          registryRecognized: true,
          checksumValid: true,
          resolution: "not-requested",
        };
      } catch (error) {
        if (!(error instanceof IdentifoldError)) {
          throw error;
        }
        const common = {
          kind,
          valid: false as const,
          registryRecognized:
            kind === "ref" &&
            error.code !== "invalid_ref" &&
            error.code !== "unknown_namespace",
          errorCode: error.code,
        };
        if (kind === "ref") {
          return error.code === "invalid_checksum"
            ? {
                ...common,
                checksumValid: false,
                resolution: "not-requested",
              }
            : { ...common, resolution: "not-requested" };
        }
        return common;
      }
    },
    normalize(value: string): string {
      return parseIdentifier(value, classifyIdentifier(value), options.registry)
        .value;
    },
    parse(value: string): ParsedIdentifier {
      return parseIdentifier(
        value,
        classifyIdentifier(value),
        options.registry,
      );
    },
    validate(value: string): boolean {
      try {
        parseIdentifier(value, classifyIdentifier(value), options.registry);
        return true;
      } catch (error) {
        if (error instanceof IdentifoldError) {
          return false;
        }
        throw error;
      }
    },
  });
}

function classifyIdentifier(value: string): IdentifierKind {
  const kind = detectIdentifierKind(value);
  if (kind !== undefined) {
    return kind;
  }
  throw new IdentifoldError(
    "invalid_kind",
    "Identifier representation could not be determined",
  );
}

function detectIdentifierKind(value: string): IdentifierKind | undefined {
  if (value.includes("_")) {
    return "pid";
  }
  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    return "mid";
  }
  if (/^[a-z]{2,8}(?:-|[0-9])/i.test(value)) {
    return "ref";
  }
  return undefined;
}

function parseIdentifier(
  value: string,
  kind: IdentifierKind,
  registry: NamespaceRegistry,
): ParsedIdentifier {
  if (kind === "mid") {
    const machineId = parseMachineId(value);
    return { kind, value: machineId, machineId };
  }
  if (kind === "pid") {
    const parsed = parsePublicId(value);
    if (registry.getByPublicPrefix(parsed.namespace) === undefined) {
      throw new IdentifoldError(
        "unknown_namespace",
        "Unknown public identifier namespace",
      );
    }
    return { kind, ...parsed };
  }
  return { kind, ...parseReference(value, registry) };
}
