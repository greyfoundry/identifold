import assert from "node:assert/strict";

import { buildIdentity } from "./basic.js";

const identity = await buildIdentity();

assert.equal(identity.namespace, "order");
assert.match(identity.pid, /^order_/);
assert.equal(identity.roundTrip, true);
