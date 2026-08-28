import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import * as identifold from "../src/index.js";

interface SpecificationExample {
  readonly expected: string;
  readonly input: string;
  readonly operation: "normalize";
  readonly registry: readonly identifold.NamespaceDefinition[];
}

interface SpecificationManifest {
  readonly errorCodes: readonly string[];
  readonly examples: readonly SpecificationExample[];
  readonly exclusions: readonly string[];
  readonly rules: readonly {
    readonly evidence: string;
    readonly id: string;
  }[];
  readonly release: {
    readonly packageVersion: string;
    readonly productionExamples: readonly string[];
    readonly requiredImplementations: readonly string[];
  };
  readonly specVersion: string;
}

describe("specification contract", () => {
  it("publishes the complete stable error-code taxonomy", () => {
    expect(identifold).toHaveProperty("IDENTIFOLD_ERROR_CODES", [
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
    ]);
  });

  it("executes every canonical example in the normative manifest", () => {
    const manifestUrl = new URL("../../../spec/manifest.json", import.meta.url);
    expect(existsSync(manifestUrl)).toBe(true);
    if (!existsSync(manifestUrl)) {
      return;
    }

    const manifest = JSON.parse(
      readFileSync(manifestUrl, "utf8"),
    ) as SpecificationManifest;
    expect(manifest.specVersion).toBe("1.0");
    expect(manifest.release).toEqual({
      packageVersion: "1.0.0",
      productionExamples: [
        "examples/typescript/basic.ts",
        "examples/python/basic.py",
      ],
      requiredImplementations: [
        "typescript",
        "python",
        "java",
        "csharp",
        "go",
        "php",
        "kotlin",
        "rust",
        "ruby",
        "swift",
      ],
    });
    for (const example of manifest.release.productionExamples) {
      expect(existsSync(new URL(`../../../${example}`, import.meta.url))).toBe(
        true,
      );
    }
    expect(manifest.errorCodes).toEqual(identifold.IDENTIFOLD_ERROR_CODES);
    expect(manifest.exclusions).toEqual([
      "authentication",
      "authorization",
      "automatic-legacy-conversion",
      "custom-wire-formats",
      "distributed-reference-resolution",
    ]);
    expect(new Set(manifest.rules.map((rule) => rule.id)).size).toBe(
      manifest.rules.length,
    );
    expect(manifest.rules).toHaveLength(10);
    for (const rule of manifest.rules) {
      expect(
        existsSync(new URL(`../../../${rule.evidence}`, import.meta.url)),
      ).toBe(true);
    }

    for (const example of manifest.examples) {
      const ids = identifold.createIdentifold({
        registry: identifold.createNamespaceRegistry(example.registry),
      });
      expect(ids.normalize(example.input)).toBe(example.expected);
    }
  });
});
