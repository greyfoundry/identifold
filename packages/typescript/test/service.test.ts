import { describe, expect, it } from "vitest";

import {
  createIdentifold,
  createNamespaceRegistry,
  parseMachineId,
  parsePublicId,
} from "../src/index.js";
import type {
  HumanReference,
  MachineId,
  MachineIdSource,
  ReferenceReservation,
  ReferenceStore,
  SequenceAllocationRequest,
  SequenceAllocator,
} from "../src/index.js";

class InMemoryReferenceStore implements ReferenceStore {
  readonly #references = new Map<HumanReference, MachineId>();

  constructor(initial: readonly ReferenceReservation[] = []) {
    for (const reservation of initial) {
      this.#references.set(reservation.reference, reservation.machineId);
    }
  }

  reserve(reservation: ReferenceReservation): Promise<boolean> {
    if (this.#references.has(reservation.reference)) {
      return Promise.resolve(false);
    }
    this.#references.set(reservation.reference, reservation.machineId);
    return Promise.resolve(true);
  }

  resolve(reference: HumanReference): MachineId | undefined {
    return this.#references.get(reference);
  }
}

function requireReference(
  reference: HumanReference | undefined,
): HumanReference {
  if (reference === undefined) {
    throw new Error("Expected identity to contain a human reference");
  }
  return reference;
}

class RecordingSequenceAllocator implements SequenceAllocator {
  readonly requests: SequenceAllocationRequest[] = [];

  constructor(readonly sequence: bigint) {}

  allocate(request: SequenceAllocationRequest): Promise<bigint> {
    this.requests.push(request);
    return Promise.resolve(this.sequence);
  }
}

describe("identity service", () => {
  const registry = createNamespaceRegistry([
    {
      publicPrefix: "order",
      reference: { prefix: "ORD", strategy: "random" },
    },
    { publicPrefix: "user" },
  ]);
  const zeroBytes = (size: number) => new Uint8Array(size);

  it("creates and atomically reserves all configured representations", async () => {
    const referenceStore = new InMemoryReferenceStore();
    const ids = createIdentifold({
      randomBytes: zeroBytes,
      referenceStore,
      registry,
    });

    const identity = await ids.create("order");

    expect(identity.ref).toBe("ORD-0000-0000-00-0");
    expect(parsePublicId(identity.pid)).toEqual({
      value: identity.pid,
      namespace: "order",
      machineId: identity.mid,
    });
    expect(referenceStore.resolve(requireReference(identity.ref))).toBe(
      identity.mid,
    );
  });

  it("creates MID and PID without requiring a store when REF is disabled", async () => {
    const ids = createIdentifold({ registry });

    const identity = await ids.create("user");

    expect(identity).not.toHaveProperty("ref");
    expect(parsePublicId(identity.pid, "user").machineId).toBe(identity.mid);
  });

  it("uses an injected MID source for every representation", async () => {
    const machineId = parseMachineId("0188bac7-4afa-78aa-bc3b-bd1eef28d881");
    const machineIdSource: MachineIdSource = () => machineId;
    const referenceStore = new InMemoryReferenceStore();
    const ids = createIdentifold({
      machineIdSource,
      randomBytes: zeroBytes,
      referenceStore,
      registry,
    });

    const identity = await ids.create("order");

    expect(identity).toEqual({
      mid: machineId,
      pid: "order_01h2xcejqtf2nbrexx3vqjhp41",
      ref: "ORD-0000-0000-00-0",
    });
    expect(referenceStore.resolve(requireReference(identity.ref))).toBe(
      machineId,
    );
  });

  it("rejects an invalid injected MID before reserving a reference", async () => {
    let reservationAttempted = false;
    const ids = createIdentifold({
      machineIdSource: () => "not-a-uuid" as MachineId,
      randomBytes: zeroBytes,
      referenceStore: {
        reserve() {
          reservationAttempted = true;
          return Promise.resolve(true);
        },
      },
      registry,
    });

    await expect(ids.create("order")).rejects.toEqual(
      expect.objectContaining({ code: "invalid_mid" }),
    );
    expect(reservationAttempted).toBe(false);
  });

  it("requires an allocation boundary before returning a REF", async () => {
    const ids = createIdentifold({ registry });

    await expect(ids.create("order")).rejects.toEqual(
      expect.objectContaining({ code: "allocation_required" }),
    );
  });

  it("requires a dedicated allocator for sequential references", async () => {
    const sequentialRegistry = createNamespaceRegistry([
      {
        publicPrefix: "invoice",
        reference: { prefix: "INV", strategy: "sequence", width: 6 },
      },
    ]);
    const ids = createIdentifold({ registry: sequentialRegistry });

    await expect(ids.create("invoice")).rejects.toEqual(
      expect.objectContaining({ code: "allocation_required" }),
    );
  });

  it("allocates and binds a calendar-year sequential reference", async () => {
    const sequentialRegistry = createNamespaceRegistry([
      {
        publicPrefix: "invoice",
        reference: {
          prefix: "INV",
          scope: "calendar-year",
          strategy: "sequence",
          width: 6,
        },
      },
    ]);
    const sequenceAllocator = new RecordingSequenceAllocator(1842n);
    const ids = createIdentifold({
      now: () => new Date("2026-08-28T12:00:00Z"),
      registry: sequentialRegistry,
      sequenceAllocator,
    });

    const identity = await ids.create("invoice");

    expect(identity.ref).toBe("INV-2026-001842-M");
    expect(sequenceAllocator.requests).toEqual([
      {
        machineId: identity.mid,
        namespace: "invoice",
        referencePrefix: "INV",
        scope: "2026",
        width: 6,
      },
    ]);
  });

  it("allocates an unscoped sequential reference without reading the clock", async () => {
    const sequentialRegistry = createNamespaceRegistry([
      {
        publicPrefix: "receipt",
        reference: { prefix: "RCT", strategy: "sequence", width: 4 },
      },
    ]);
    const sequenceAllocator = new RecordingSequenceAllocator(1n);
    const ids = createIdentifold({
      now: () => {
        throw new Error("Clock must not be read for an unscoped sequence");
      },
      registry: sequentialRegistry,
      sequenceAllocator,
    });

    const identity = await ids.create("receipt");

    expect(identity.ref).toBe("RCT-0001-1");
    expect(sequenceAllocator.requests[0]).toEqual(
      expect.objectContaining({ scope: null }),
    );
  });

  it("rejects an allocated sequence that exceeds its fixed width", async () => {
    const sequentialRegistry = createNamespaceRegistry([
      {
        publicPrefix: "invoice",
        reference: { prefix: "INV", strategy: "sequence", width: 4 },
      },
    ]);
    const ids = createIdentifold({
      registry: sequentialRegistry,
      sequenceAllocator: new RecordingSequenceAllocator(10_000n),
    });

    await expect(ids.create("invoice")).rejects.toEqual(
      expect.objectContaining({ code: "sequence_overflow" }),
    );
  });

  it("uses platform randomness when no source is injected", async () => {
    const referenceStore = new InMemoryReferenceStore();
    const ids = createIdentifold({ referenceStore, registry });

    const identity = await ids.create("order");

    expect(identity.ref).toMatch(
      /^ORD-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{2}-[0-9A-HJKMNP-TV-Z*~$=U]$/,
    );
  });

  it("retries a colliding candidate against the same MID", async () => {
    const existingMid = parseMachineId("0188bac7-4afa-78aa-bc3b-bd1eef28d881");
    const referenceStore = new InMemoryReferenceStore([
      {
        machineId: existingMid,
        namespace: "order",
        reference: "ORD-0000-0000-00-0" as HumanReference,
      },
    ]);
    let byte = 0;
    const randomBytes = (size: number) => {
      const bytes = new Uint8Array(size).fill(byte);
      byte += 1;
      return bytes;
    };
    const ids = createIdentifold({ randomBytes, referenceStore, registry });

    const identity = await ids.create("order");

    expect(identity.ref).toBe("ORD-1111-1111-11-T");
    expect(referenceStore.resolve(requireReference(identity.ref))).toBe(
      identity.mid,
    );
  });

  it("fails after the configured number of allocation conflicts", async () => {
    const existingMid = parseMachineId("0188bac7-4afa-78aa-bc3b-bd1eef28d881");
    const referenceStore = new InMemoryReferenceStore([
      {
        machineId: existingMid,
        namespace: "order",
        reference: "ORD-0000-0000-00-0" as HumanReference,
      },
    ]);
    const ids = createIdentifold({
      maxReferenceAttempts: 2,
      randomBytes: zeroBytes,
      referenceStore,
      registry,
    });

    await expect(ids.create("order")).rejects.toEqual(
      expect.objectContaining({ code: "allocation_exhausted" }),
    );
  });

  it("rejects an unknown namespace before creating an identity", async () => {
    const ids = createIdentifold({ registry });

    await expect(ids.create("missing")).rejects.toEqual(
      expect.objectContaining({ code: "unknown_namespace" }),
    );
  });

  it.each([0, 1.5, 101])(
    "rejects invalid maximum allocation attempts %s",
    (maxReferenceAttempts) => {
      expect(() =>
        createIdentifold({ maxReferenceAttempts, registry }),
      ).toThrow(expect.objectContaining({ code: "invalid_allocation_policy" }));
    },
  );
});
