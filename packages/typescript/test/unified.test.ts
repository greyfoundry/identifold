import { describe, expect, it } from "vitest";

import { createIdentifold, createNamespaceRegistry } from "../src/index.js";

describe("unified identifier operations", () => {
  const registry = createNamespaceRegistry([
    {
      publicPrefix: "prefix",
      reference: { prefix: "ORD", strategy: "random" },
    },
  ]);
  const ids = createIdentifold({ registry });

  it("parses and normalizes a MID", () => {
    expect(ids.parse("0188BAC7-4AFA-78AA-BB3B-BD1EEF28D881")).toEqual({
      kind: "mid",
      value: "0188bac7-4afa-78aa-bb3b-bd1eef28d881",
      machineId: "0188bac7-4afa-78aa-bb3b-bd1eef28d881",
    });
    expect(ids.inspect("0188BAC7-4AFA-78AA-BB3B-BD1EEF28D881")).toEqual({
      kind: "mid",
      valid: true,
      normalized: "0188bac7-4afa-78aa-bb3b-bd1eef28d881",
      machineId: "0188bac7-4afa-78aa-bb3b-bd1eef28d881",
      registryRecognized: false,
      uuidVersion: 7,
    });
  });

  it("parses a registered PID", () => {
    expect(ids.parse("prefix_01h2xcejqtf2nbrexx3vqjhp41")).toEqual({
      kind: "pid",
      value: "prefix_01h2xcejqtf2nbrexx3vqjhp41",
      namespace: "prefix",
      machineId: "0188bac7-4afa-78aa-bc3b-bd1eef28d881",
    });
    expect(ids.inspect("prefix_01h2xcejqtf2nbrexx3vqjhp41")).toEqual({
      kind: "pid",
      valid: true,
      normalized: "prefix_01h2xcejqtf2nbrexx3vqjhp41",
      namespace: "prefix",
      machineId: "0188bac7-4afa-78aa-bc3b-bd1eef28d881",
      registryRecognized: true,
      uuidVersion: 7,
    });
  });

  it("parses and normalizes a REF without resolving storage", () => {
    expect(ids.parse("ordol00000000g")).toEqual({
      kind: "ref",
      value: "ORD-0100-0000-00-G",
      namespace: "prefix",
      payload: "0100000000",
      checkSymbol: "G",
      strategy: "random",
    });
    expect(ids.inspect("ordol00000000g")).toEqual({
      kind: "ref",
      valid: true,
      normalized: "ORD-0100-0000-00-G",
      namespace: "prefix",
      registryRecognized: true,
      checksumValid: true,
      resolution: "not-requested",
    });
  });

  it("normalizes any recognized representation", () => {
    expect(ids.normalize("0188BAC7-4AFA-78AA-BB3B-BD1EEF28D881")).toBe(
      "0188bac7-4afa-78aa-bb3b-bd1eef28d881",
    );
    expect(ids.normalize("ordol00000000g")).toBe("ORD-0100-0000-00-G");
  });

  it("validates without throwing", () => {
    expect(ids.validate("prefix_01h2xcejqtf2nbrexx3vqjhp41")).toBe(true);
    expect(ids.validate("ORD-7K4M-2P8Q-3D-K")).toBe(false);
  });

  it("reports checksum failure without implying a storage lookup", () => {
    expect(ids.inspect("ORD-7K4M-2P8Q-3D-K")).toEqual({
      kind: "ref",
      valid: false,
      registryRecognized: true,
      checksumValid: false,
      resolution: "not-requested",
      errorCode: "invalid_checksum",
    });
  });

  it("reports other REF failures without implying a storage lookup", () => {
    expect(ids.inspect("INV-7K4M-2P8Q-3D-9")).toEqual({
      kind: "ref",
      valid: false,
      registryRecognized: false,
      resolution: "not-requested",
      errorCode: "unknown_namespace",
    });
  });

  it("rejects PIDs whose namespace is not registered", () => {
    expect(() => ids.parse("other_01h2xcejqtf2nbrexx3vqjhp41")).toThrow(
      expect.objectContaining({ code: "unknown_namespace" }),
    );
  });

  it("reports inputs with no recognizable representation", () => {
    expect(ids.inspect("?not-an-identifier?")).toEqual({
      kind: "unknown",
      valid: false,
      registryRecognized: false,
      errorCode: "invalid_kind",
    });
    expect(() => ids.parse("?not-an-identifier?")).toThrow(
      expect.objectContaining({ code: "invalid_kind" }),
    );
    expect(() => ids.normalize("?not-an-identifier?")).toThrow(
      expect.objectContaining({ code: "invalid_kind" }),
    );
  });

  it("does not hide unexpected registry failures", () => {
    const failure = new Error("registry unavailable");
    const brokenRegistry = {
      definitions: registry.definitions,
      getByPublicPrefix() {
        throw failure;
      },
      getByReferencePrefix(prefix: string) {
        return registry.getByReferencePrefix(prefix);
      },
    };
    const broken = createIdentifold({ registry: brokenRegistry });

    expect(() => broken.inspect("prefix_01h2xcejqtf2nbrexx3vqjhp41")).toThrow(
      failure,
    );
    expect(() => broken.validate("prefix_01h2xcejqtf2nbrexx3vqjhp41")).toThrow(
      failure,
    );
  });
});
