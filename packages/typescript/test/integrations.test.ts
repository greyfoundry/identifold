import { describe, expect, expectTypeOf, it } from "vitest";

import {
  createIdentifold,
  createNamespaceRegistry,
  createReferenceCandidate,
  parseMachineId,
  publicIdFromMachineId,
} from "../src/index.js";
import { deserializeIdentity, serializeIdentity } from "../src/json.js";
import { createIdentifierParser } from "../src/middleware.js";
import { createOpenApiComponents } from "../src/openapi.js";
import { identifierLogFields } from "../src/observability.js";
import {
  machineIdSchema,
  publicIdSchema,
  referenceSchema,
} from "../src/zod.js";

const registry = createNamespaceRegistry([
  { publicPrefix: "user" },
  { publicPrefix: "order", reference: { prefix: "ORD", strategy: "random" } },
  { publicPrefix: "ticket", reference: { prefix: "TKT", strategy: "random" } },
]);
const mid = parseMachineId("01890a5d-ac96-774b-bf20-69de2b531a31");
const pid = publicIdFromMachineId(mid, "user");

describe("developer integrations", () => {
  it("preserves branded values and namespace literals through Zod", () => {
    const parsedMid = machineIdSchema.parse(mid);
    const parsedPid = publicIdSchema("user").parse(pid);
    expectTypeOf(parsedMid).toEqualTypeOf<typeof mid>();
    expectTypeOf(parsedPid).toEqualTypeOf<typeof pid>();
    expect(
      referenceSchema(registry).safeParse("ORD-0000-0000-00").success,
    ).toBe(false);
    expect(publicIdSchema("order").safeParse(pid).success).toBe(false);
    expect(machineIdSchema.safeParse("bad").success).toBe(false);
  });

  it("publishes stable OpenAPI schemas without security semantics", () => {
    const components = createOpenApiComponents(registry);
    expect(components.schemas.MachineId.format).toBe("uuid");
    expect(components.schemas.PublicId["x-identifold-namespaces"]).toEqual([
      "order",
      "ticket",
      "user",
    ]);
    expect(JSON.stringify(components)).not.toMatch(/auth|permission/i);
  });

  it("round-trips JSON identities and rejects inconsistent values", () => {
    const encoded = serializeIdentity({ mid, pid });
    expect(deserializeIdentity(encoded, registry)).toEqual({ mid, pid });
    expect(() =>
      deserializeIdentity(
        {
          mid,
          pid: publicIdFromMachineId(
            parseMachineId("01890a5d-ac96-774b-bf20-69de2b531a32"),
            "user",
          ),
        },
        registry,
      ),
    ).toThrow(expect.objectContaining({ code: "invalid_pid" }));

    const orderPid = publicIdFromMachineId(mid, "order");
    const orderReference = createReferenceCandidate(registry, "order", {
      randomBytes: (size) => new Uint8Array(size),
    });
    expect(
      deserializeIdentity(
        serializeIdentity({ mid, pid: orderPid, ref: orderReference }),
        registry,
      ),
    ).toEqual({ mid, pid: orderPid, ref: orderReference });
    expect(() => deserializeIdentity(null, registry)).toThrow(
      expect.objectContaining({ code: "invalid_kind" }),
    );
    expect(() =>
      deserializeIdentity({ mid, pid: orderPid, ref: 42 }, registry),
    ).toThrow(expect.objectContaining({ code: "invalid_ref" }));
    const ticketReference = createReferenceCandidate(registry, "ticket", {
      randomBytes: (size) => new Uint8Array(size),
    });
    expect(() =>
      deserializeIdentity(
        { mid, pid: orderPid, ref: ticketReference },
        registry,
      ),
    ).toThrow(expect.objectContaining({ code: "invalid_ref" }));
  });

  it("maps malformed boundary input to a stable, non-sensitive error", () => {
    const ids = createIdentifold({ registry });
    const parsePid = createIdentifierParser(ids, "pid");
    expect(() => parsePid("not-an-id")).toThrow(
      expect.objectContaining({
        code: "invalid_identifier",
        message: "Invalid identifier input",
      }),
    );
    expect(() => parsePid(mid)).toThrow(
      expect.objectContaining({ code: "unexpected_identifier_kind" }),
    );
    expect(() => parsePid(42)).toThrow(
      expect.objectContaining({ code: "invalid_identifier" }),
    );
  });

  it("emits bounded structured fields", () => {
    const parsed = createIdentifold({ registry }).parse(pid);
    expect(identifierLogFields(parsed)).toEqual({
      "identifier.kind": "pid",
      "identifier.namespace": "user",
      "identifier.uuid_version": 7,
    });
    expect(
      identifierLogFields(createIdentifold({ registry }).parse(mid)),
    ).toEqual({
      "identifier.kind": "mid",
      "identifier.uuid_version": 7,
    });
    const reference = createReferenceCandidate(registry, "order", {
      randomBytes: (size) => new Uint8Array(size),
    });
    expect(
      identifierLogFields(createIdentifold({ registry }).parse(reference)),
    ).toEqual({
      "identifier.kind": "ref",
      "identifier.namespace": "order",
      "identifier.reference_strategy": "random",
    });
  });
});
