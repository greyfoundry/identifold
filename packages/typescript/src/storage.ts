import type { ReferenceLookup } from "./resolver.js";
import type { ReferenceStore, SequenceAllocator } from "./service.js";

export type { ReferenceLookup, ReferenceLookupResult } from "./resolver.js";
export type {
  ReferenceReservation,
  ReferenceStore,
  SequenceAllocationRequest,
  SequenceAllocator,
} from "./service.js";

export interface IdentifoldStorageAdapter {
  readonly referenceStore: ReferenceStore;
  readonly sequenceAllocator: SequenceAllocator;
  readonly lookup: ReferenceLookup;
}

export function createStorageAdapter(
  adapter: IdentifoldStorageAdapter,
): IdentifoldStorageAdapter {
  return Object.freeze({
    referenceStore: adapter.referenceStore,
    sequenceAllocator: adapter.sequenceAllocator,
    lookup: adapter.lookup,
  });
}
