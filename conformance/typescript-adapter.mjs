import {
  IdentifoldError,
  createIdentifold,
  createNamespaceRegistry,
  createReferenceCandidate,
  formatSequentialReference,
  parseMachineId,
  parsePublicId,
  publicIdFromMachineId,
} from "../packages/typescript/dist/index.js";

const input = await new Promise((resolve, reject) => {
  let body = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    body += chunk;
  });
  process.stdin.on("end", () => resolve(body));
  process.stdin.on("error", reject);
});

try {
  const request = JSON.parse(input);
  const registry = createNamespaceRegistry(request.registry ?? []);
  const ids = createIdentifold({ registry });
  let value;

  switch (request.operation) {
    case "parseMachineId":
      value = parseMachineId(request.input);
      break;
    case "publicIdFromMachineId":
      value = publicIdFromMachineId(
        parseMachineId(request.machineId),
        request.namespace,
      );
      break;
    case "parsePublicId":
      value = parsePublicId(request.input);
      break;
    case "createReferenceCandidate":
      value = createReferenceCandidate(registry, request.namespace, {
        randomBytes: () => Uint8Array.from(request.randomBytes),
      });
      break;
    case "formatSequentialReference":
      value = formatSequentialReference(
        registry,
        request.namespace,
        BigInt(request.sequence),
        request.scope,
      );
      break;
    case "normalize":
      value = ids.normalize(request.input);
      break;
    case "parseReference":
      value = ids.parse(request.input);
      break;
    case "inspect": {
      const inspected = ids.inspect(request.input);
      if (!inspected.valid) {
        process.stdout.write(
          JSON.stringify({ ok: false, errorCode: inspected.errorCode }),
        );
        process.exit(0);
      }
      value = inspected;
      break;
    }
    default:
      throw new Error("Unsupported conformance operation");
  }

  process.stdout.write(JSON.stringify({ ok: true, value }));
} catch (error) {
  if (error instanceof IdentifoldError) {
    process.stdout.write(JSON.stringify({ ok: false, errorCode: error.code }));
  } else {
    process.exitCode = 1;
  }
}
