import { pathToFileURL } from "node:url";

import {
  createIdentifold,
  createNamespaceRegistry,
  parsePublicId,
} from "@greyfoundry/identifold";

export async function buildIdentity() {
  const registry = createNamespaceRegistry([{ publicPrefix: "order" }]);
  const identifiers = createIdentifold({ registry });
  const identity = await identifiers.create("order");
  const parsed = parsePublicId(identity.pid, "order");

  return {
    mid: identity.mid,
    namespace: parsed.namespace,
    pid: identity.pid,
    roundTrip: parsed.machineId === identity.mid,
  };
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  console.log(JSON.stringify(await buildIdentity(), null, 2));
}
