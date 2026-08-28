import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createIdentifold,
  createNamespaceRegistry,
  createReferenceCandidate,
  formatSequentialReference,
  parseMachineId,
  parsePublicId,
  publicIdFromMachineId,
} from "../src/index.js";
import type { IdentifoldErrorCode, NamespaceDefinition } from "../src/index.js";

interface VectorEnvelope<Vector> {
  readonly kind: string;
  readonly specVersion: string;
  readonly vectors: readonly Vector[];
}

interface MachineVector {
  readonly accepted: readonly string[];
  readonly canonical: string;
}

interface PublicVector {
  readonly machineId: string;
  readonly namespace: string;
  readonly publicId: string;
}

interface ReferenceVector {
  readonly checkSymbol: string;
  readonly namespace: string;
  readonly payload: string;
  readonly randomBytes: readonly number[];
  readonly reference: string;
}

interface SequentialVector {
  readonly checkSymbol: string;
  readonly namespace: string;
  readonly payload: string;
  readonly reference: string;
  readonly scope?: string;
  readonly sequence: string;
}

interface RegistryEnvelope<Vector> extends VectorEnvelope<Vector> {
  readonly registry: readonly NamespaceDefinition[];
}

interface NormalizationVector {
  readonly input: string;
  readonly normalized: string;
}

interface InvalidVector {
  readonly errorCode: IdentifoldErrorCode;
  readonly input: string;
}

function loadVectors<Vector>(name: string): VectorEnvelope<Vector> {
  return JSON.parse(
    readFileSync(
      new URL(`../../../vectors/${name}.json`, import.meta.url),
      "utf8",
    ),
  ) as VectorEnvelope<Vector>;
}

function loadRegistryVectors<Vector>(name: string): RegistryEnvelope<Vector> {
  return loadVectors<Vector>(name) as RegistryEnvelope<Vector>;
}

describe("public conformance vectors", () => {
  it("normalizes every accepted MID form", () => {
    const data = loadVectors<MachineVector>("machine");
    expect(data.specVersion).toBe("0.1-draft");
    for (const vector of data.vectors) {
      expect(parseMachineId(vector.canonical)).toBe(vector.canonical);
      for (const accepted of vector.accepted) {
        expect(parseMachineId(accepted)).toBe(vector.canonical);
      }
    }
  });

  it("round-trips every PID through the same MID bits", () => {
    const data = loadVectors<PublicVector>("public");
    for (const vector of data.vectors) {
      const machineId = parseMachineId(vector.machineId);
      expect(publicIdFromMachineId(machineId, vector.namespace)).toBe(
        vector.publicId,
      );
      expect(parsePublicId(vector.publicId)).toEqual({
        value: vector.publicId,
        namespace: vector.namespace,
        machineId,
      });
    }
  });

  it("reproduces deterministic random REF values", () => {
    const data = loadRegistryVectors<ReferenceVector>("references");
    const registry = createNamespaceRegistry(data.registry);
    for (const vector of data.vectors) {
      expect(
        createReferenceCandidate(registry, vector.namespace, {
          randomBytes: () => Uint8Array.from(vector.randomBytes),
        }),
      ).toBe(vector.reference);
      expect(createIdentifold({ registry }).parse(vector.reference)).toEqual({
        kind: "ref",
        value: vector.reference,
        namespace: vector.namespace,
        payload: vector.payload,
        checkSymbol: vector.checkSymbol,
        strategy: "random",
      });
    }
  });

  it("reproduces deterministic sequential REF values", () => {
    const data = loadRegistryVectors<SequentialVector>("sequential");
    const registry = createNamespaceRegistry(data.registry);
    for (const vector of data.vectors) {
      const reference = formatSequentialReference(
        registry,
        vector.namespace,
        BigInt(vector.sequence),
        vector.scope,
      );
      expect(reference).toBe(vector.reference);
      expect(createIdentifold({ registry }).parse(reference)).toEqual(
        expect.objectContaining({
          value: reference,
          namespace: vector.namespace,
          payload: vector.payload,
          checkSymbol: vector.checkSymbol,
          sequence: BigInt(vector.sequence)
            .toString()
            .padStart(vector.payload.length - (vector.scope?.length ?? 0), "0"),
          strategy: "sequence",
        }),
      );
    }
  });

  it("normalizes every accepted non-canonical form", () => {
    const data = loadRegistryVectors<NormalizationVector>("normalization");
    const ids = createIdentifold({
      registry: createNamespaceRegistry(data.registry),
    });
    for (const vector of data.vectors) {
      expect(ids.normalize(vector.input)).toBe(vector.normalized);
    }
  });

  it("returns the specified stable error code for invalid input", () => {
    const data = loadRegistryVectors<InvalidVector>("invalid");
    const ids = createIdentifold({
      registry: createNamespaceRegistry(data.registry),
    });
    for (const vector of data.vectors) {
      expect(ids.inspect(vector.input)).toEqual(
        expect.objectContaining({
          valid: false,
          errorCode: vector.errorCode,
        }),
      );
    }
  });
});
