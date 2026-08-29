import Foundation

public struct ParsedPublicID: Codable, Equatable, Sendable {
  public let value: String
  public let namespace: String
  public let machineID: String

  enum CodingKeys: String, CodingKey {
    case value, namespace
    case machineID = "machineId"
  }
}

public struct ReferenceDefinition: Codable, Sendable {
  public let prefix: String
  public let profile: String?
  public let strategy: String
  public let scope: String?
  public let width: Int?
}

public struct NamespaceDefinition: Codable, Sendable {
  public let publicPrefix: String
  public let reference: ReferenceDefinition?
}

public struct IdentifoldError: Error, Sendable {
  public let code: String

  public init(_ code: String) {
    self.code = code
  }
}

public enum Identifiers {
  private static let data = Array("0123456789ABCDEFGHJKMNPQRSTVWXYZ")
  private static let check = Array("0123456789ABCDEFGHJKMNPQRSTVWXYZ*~$=U")
  private static let typeID = Array("0123456789abcdefghjkmnpqrstvwxyz")

  public static func parseMachineID(_ input: String) throws -> String {
    let value = input.lowercased()
    guard
      value.range(
        of: #"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"#,
        options: .regularExpression
      ) != nil
    else {
      throw IdentifoldError("invalid_mid")
    }
    let symbols = Array(value)
    guard symbols[14] == "7" else { throw IdentifoldError("invalid_uuid_version") }
    guard "89ab".contains(symbols[19]) else { throw IdentifoldError("invalid_mid") }
    return value
  }

  public static func publicID(from machineID: String, namespace: String) throws -> String {
    guard
      namespace.range(
        of: #"^[a-z](?:[a-z_]{0,61}[a-z])?$"#,
        options: .regularExpression
      ) != nil
    else {
      throw IdentifoldError("invalid_public_prefix")
    }
    let hex = try parseMachineID(machineID).replacingOccurrences(of: "-", with: "")
    var bits = [0, 0]
    for index in stride(from: 0, to: hex.count, by: 2) {
      let start = hex.index(hex.startIndex, offsetBy: index)
      let end = hex.index(start, offsetBy: 2)
      guard let byte = UInt8(hex[start..<end], radix: 16) else {
        throw IdentifoldError("invalid_mid")
      }
      for shift in stride(from: 7, through: 0, by: -1) {
        bits.append(Int((byte >> UInt8(shift)) & 1))
      }
    }
    var suffix = ""
    for index in stride(from: 0, to: bits.count, by: 5) {
      let value = bits[index..<(index + 5)].reduce(0) { ($0 << 1) | $1 }
      suffix.append(typeID[value])
    }
    return "\(namespace)_\(suffix)"
  }

  public static func parsePublicID(_ value: String) throws -> ParsedPublicID {
    guard value == value.lowercased() else { throw IdentifoldError("invalid_pid") }
    guard let separator = value.lastIndex(of: "_") else {
      throw IdentifoldError("invalid_public_prefix")
    }
    let namespace = String(value[..<separator])
    let suffix = String(value[value.index(after: separator)...])
    guard
      namespace.range(
        of: #"^[a-z](?:[a-z_]{0,61}[a-z])?$"#,
        options: .regularExpression
      ) != nil
    else {
      throw IdentifoldError("invalid_public_prefix")
    }
    let suffixSymbols = Array(suffix)
    guard suffixSymbols.count == 26, suffixSymbols[0] <= "7" else {
      throw IdentifoldError("invalid_pid")
    }
    var bits: [Int] = []
    for symbol in suffixSymbols {
      guard let position = typeID.firstIndex(of: symbol) else {
        throw IdentifoldError("invalid_pid")
      }
      for shift in stride(from: 4, through: 0, by: -1) {
        bits.append((position >> shift) & 1)
      }
    }
    guard bits[0] == 0, bits[1] == 0 else { throw IdentifoldError("invalid_pid") }
    bits.removeFirst(2)
    var hex = ""
    for index in stride(from: 0, to: bits.count, by: 8) {
      let byte = bits[index..<(index + 8)].reduce(0) { ($0 << 1) | $1 }
      hex += String(format: "%02x", byte)
    }
    let first = String(hex.prefix(8))
    let second = String(hex.dropFirst(8).prefix(4))
    let third = String(hex.dropFirst(12).prefix(4))
    let fourth = String(hex.dropFirst(16).prefix(4))
    let fifth = String(hex.dropFirst(20))
    let machineID = [first, second, third, fourth, fifth].joined(separator: "-")
    do {
      return ParsedPublicID(
        value: value,
        namespace: namespace,
        machineID: try parseMachineID(machineID)
      )
    } catch {
      throw IdentifoldError("invalid_pid")
    }
  }

  public static func checkSymbol(_ payload: String, sequential: Bool) throws -> Character {
    let alphabet = Array(sequential ? "0123456789" : String(data))
    let base = sequential ? 10 : 32
    var remainder = 0
    for symbol in payload {
      guard let position = alphabet.firstIndex(of: symbol) else {
        throw IdentifoldError("invalid_ref_symbol")
      }
      remainder = (remainder * base + position) % 37
    }
    return check[remainder]
  }

  public static func createReferenceCandidate(
    registry: [NamespaceDefinition],
    namespace: String,
    randomBytes: [Int]
  ) throws -> String {
    guard let reference = try findNamespace(registry, namespace).reference,
      reference.strategy == "random"
    else {
      throw IdentifoldError("unknown_namespace")
    }
    let length = profileLength(reference.profile)
    guard randomBytes.count >= length else { throw IdentifoldError("invalid_random_source") }
    var payload = ""
    for value in randomBytes.prefix(length) {
      guard (0...255).contains(value) else { throw IdentifoldError("invalid_random_source") }
      payload.append(data[value % 32])
    }
    return "\(reference.prefix)-\(group(payload))-\(try checkSymbol(payload, sequential: false))"
  }

  public static func formatSequentialReference(
    registry: [NamespaceDefinition],
    namespace: String,
    sequence: String,
    scope: String = ""
  ) throws -> String {
    guard let reference = try findNamespace(registry, namespace).reference,
      reference.strategy == "sequence"
    else {
      throw IdentifoldError("unknown_namespace")
    }
    let width = reference.width ?? 0
    guard !sequence.isEmpty,
      sequence.allSatisfy(\.isNumber),
      sequence.count <= width
    else {
      throw IdentifoldError("sequence_overflow")
    }
    let padded = String(repeating: "0", count: width - sequence.count) + sequence
    let payload = scope + padded
    let scoped = scope.isEmpty ? "" : "\(scope)-"
    return "\(reference.prefix)-\(scoped)\(padded)-\(try checkSymbol(payload, sequential: true))"
  }

  public static func normalize(_ value: String, registry: [NamespaceDefinition]) throws -> String {
    if value.contains("_") {
      let parsed = try parsePublicID(value)
      _ = try findNamespace(registry, parsed.namespace)
      return parsed.value
    }
    if value.count == 36 { return try parseMachineID(value) }

    let compact = value.uppercased().replacingOccurrences(of: "-", with: "")
    guard
      let definition = registry.first(where: {
        $0.reference.map { compact.hasPrefix($0.prefix) } ?? false
      }), let reference = definition.reference
    else {
      let letters = value.prefix { $0.isLetter }.count
      throw IdentifoldError(letters >= 2 ? "unknown_namespace" : "invalid_kind")
    }
    let body = String(compact.dropFirst(reference.prefix.count))
    guard !body.contains("?"), !body.contains("_") else {
      throw IdentifoldError("invalid_ref")
    }
    if reference.strategy == "sequence" {
      let scopeLength = reference.scope == "calendar-year" ? 4 : 0
      let width = reference.width ?? 0
      guard body.count == scopeLength + width + 1 else {
        throw IdentifoldError("invalid_ref_length")
      }
      let payload = String(body.dropLast())
      guard try checkSymbol(payload, sequential: true) == body.last else {
        throw IdentifoldError("invalid_checksum")
      }
      return try formatSequentialReference(
        registry: registry,
        namespace: definition.publicPrefix,
        sequence: String(payload.dropFirst(scopeLength)),
        scope: String(payload.prefix(scopeLength))
      )
    }
    let length = profileLength(reference.profile)
    guard body.count == length + 1 else { throw IdentifoldError("invalid_ref_length") }
    let raw = String(body.prefix(length))
    let payload = raw.map { $0 == "O" ? "0" : ($0 == "I" || $0 == "L" ? "1" : $0) }
    let normalized = String(payload)
    guard try checkSymbol(normalized, sequential: false) == body.last else {
      throw IdentifoldError("invalid_checksum")
    }
    return "\(reference.prefix)-\(group(normalized))-\(body.last!)"
  }

  private static func findNamespace(
    _ registry: [NamespaceDefinition],
    _ namespace: String
  ) throws -> NamespaceDefinition {
    guard let definition = registry.first(where: { $0.publicPrefix == namespace }) else {
      throw IdentifoldError("unknown_namespace")
    }
    return definition
  }

  private static func profileLength(_ profile: String?) -> Int {
    switch profile {
    case "compact": 8
    case "high": 12
    default: 10
    }
  }

  private static func group(_ value: String) -> String {
    let symbols = Array(value)
    return stride(from: 0, to: symbols.count, by: 4).map {
      String(symbols[$0..<min($0 + 4, symbols.count)])
    }.joined(separator: "-")
  }
}
