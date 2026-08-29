import Foundation
import Identifold

struct Request: Decodable {
  let operation: String
  let input: String?
  let machineId: String?
  let namespace: String?
  let randomBytes: [Int]?
  let sequence: String?
  let scope: String?
  let registry: [NamespaceDefinition]?
}

do {
  let request = try JSONDecoder().decode(
    Request.self, from: FileHandle.standardInput.readDataToEndOfFile())
  let registry = request.registry ?? []
  let value: Any
  switch request.operation {
  case "parseMachineId":
    value = try Identifiers.parseMachineID(request.input!)
  case "publicIdFromMachineId":
    value = try Identifiers.publicID(from: request.machineId!, namespace: request.namespace!)
  case "parsePublicId":
    let parsed = try Identifiers.parsePublicID(request.input!)
    value = ["value": parsed.value, "namespace": parsed.namespace, "machineId": parsed.machineID]
  case "createReferenceCandidate":
    value = try Identifiers.createReferenceCandidate(
      registry: registry,
      namespace: request.namespace!,
      randomBytes: request.randomBytes!
    )
  case "formatSequentialReference":
    value = try Identifiers.formatSequentialReference(
      registry: registry,
      namespace: request.namespace!,
      sequence: request.sequence!,
      scope: request.scope ?? ""
    )
  case "normalize", "parseReference", "inspect":
    value = try Identifiers.normalize(request.input!, registry: registry)
  default:
    throw IdentifoldError("invalid_kind")
  }
  let data = try JSONSerialization.data(withJSONObject: ["ok": true, "value": value])
  FileHandle.standardOutput.write(data)
} catch let error as IdentifoldError {
  let data = try JSONSerialization.data(withJSONObject: ["ok": false, "errorCode": error.code])
  FileHandle.standardOutput.write(data)
}
