import CSQLite
import Foundation
import Identifold

public final class SqliteStorageAdapter: StorageAdapter, @unchecked Sendable {
  private let connection: OpaquePointer
  private let lock = NSLock()

  public init(connection: OpaquePointer) {
    self.connection = connection
  }

  public func reserve(_ request: ReferenceReservation) async throws -> Bool {
    try lock.withLock {
      try databaseOperation {
        let statement = try prepare(
          """
          INSERT INTO identifold_references (reference, namespace, machine_id)
          VALUES (?1, ?2, ?3)
          ON CONFLICT(reference) DO NOTHING
          """
        )
        defer { sqlite3_finalize(statement) }
        try bind(request.reference, to: statement, at: 1)
        try bind(request.namespace, to: statement, at: 2)
        try bind(try machineIDBytes(request.machineID), to: statement, at: 3)
        try expectDone(statement)
        return sqlite3_changes(connection) == 1
      }
    }
  }

  public func resolve(reference: String, namespace: String) async throws -> ReferenceMapping? {
    try lock.withLock {
      try databaseOperation {
        if let mapping = try lookupRandom(reference: reference, namespace: namespace) {
          return mapping
        }
        guard let parsed = parseSequentialReference(reference) else { return nil }

        let statement = try prepare(
          """
          SELECT machine_id, namespace
          FROM identifold_sequence_allocations
          WHERE namespace = ?1 AND reference_prefix = ?2 AND scope = ?3 AND sequence = ?4
          """
        )
        defer { sqlite3_finalize(statement) }
        try bind(namespace, to: statement, at: 1)
        try bind(parsed.prefix, to: statement, at: 2)
        try bind(parsed.scope, to: statement, at: 3)
        guard let sequence = Int64(parsed.sequence) else { return nil }
        try check(sqlite3_bind_int64(statement, 4, sequence))
        return try readOptionalMapping(statement)
      }
    }
  }

  public func allocate(_ request: SequenceAllocationRequest) async throws -> UInt64 {
    guard (4...18).contains(request.width) else {
      throw IdentifoldError("invalid_allocation_policy")
    }

    return try lock.withLock {
      try databaseOperation {
        let machineID = try machineIDBytes(request.machineID)
        let scope = request.scope ?? ""
        try execute("BEGIN IMMEDIATE")
        var committed = false
        defer {
          if !committed { try? execute("ROLLBACK") }
        }

        if let replay = try lookupReplay(
          namespace: request.namespace,
          scope: scope,
          machineID: machineID
        ) {
          guard replay.prefix == request.referencePrefix, replay.width == request.width else {
            throw IdentifoldError("invalid_allocation_policy")
          }
          try execute("COMMIT")
          committed = true
          return replay.sequence
        }

        try createSequenceIfNeeded(request: request, scope: scope)
        let policy = try lookupPolicy(namespace: request.namespace, scope: scope)
        guard policy.prefix == request.referencePrefix, policy.width == request.width else {
          throw IdentifoldError("invalid_allocation_policy")
        }
        guard policy.lastValue < maximumValue(width: request.width) else {
          throw IdentifoldError("sequence_overflow")
        }

        let allocated = policy.lastValue + 1
        try updateSequence(namespace: request.namespace, scope: scope, value: allocated)
        try insertAllocation(
          request: request,
          scope: scope,
          sequence: allocated,
          machineID: machineID
        )
        try execute("COMMIT")
        committed = true
        return UInt64(allocated)
      }
    }
  }

  private func lookupRandom(reference: String, namespace: String) throws -> ReferenceMapping? {
    let statement = try prepare(
      """
      SELECT machine_id, namespace
      FROM identifold_references
      WHERE reference = ?1 AND namespace = ?2
      """
    )
    defer { sqlite3_finalize(statement) }
    try bind(reference, to: statement, at: 1)
    try bind(namespace, to: statement, at: 2)
    return try readOptionalMapping(statement)
  }

  private func lookupReplay(
    namespace: String,
    scope: String,
    machineID: [UInt8]
  ) throws -> (sequence: UInt64, prefix: String, width: UInt8)? {
    let statement = try prepare(
      """
      SELECT sequence, reference_prefix, width
      FROM identifold_sequence_allocations
      WHERE namespace = ?1 AND scope = ?2 AND machine_id = ?3
      """
    )
    defer { sqlite3_finalize(statement) }
    try bind(namespace, to: statement, at: 1)
    try bind(scope, to: statement, at: 2)
    try bind(machineID, to: statement, at: 3)
    let result = sqlite3_step(statement)
    if result == SQLITE_DONE { return nil }
    try checkRow(result)
    let sequence = sqlite3_column_int64(statement, 0)
    guard sequence >= 0 else { throw SQLiteFailure() }
    return (
      UInt64(sequence),
      try columnText(statement, at: 1),
      UInt8(sqlite3_column_int(statement, 2))
    )
  }

  private func createSequenceIfNeeded(
    request: SequenceAllocationRequest,
    scope: String
  ) throws {
    let statement = try prepare(
      """
      INSERT INTO identifold_sequences
        (namespace, scope, reference_prefix, width, last_value)
      VALUES (?1, ?2, ?3, ?4, 0)
      ON CONFLICT DO NOTHING
      """
    )
    defer { sqlite3_finalize(statement) }
    try bind(request.namespace, to: statement, at: 1)
    try bind(scope, to: statement, at: 2)
    try bind(request.referencePrefix, to: statement, at: 3)
    try check(sqlite3_bind_int(statement, 4, Int32(request.width)))
    try expectDone(statement)
  }

  private func lookupPolicy(
    namespace: String,
    scope: String
  ) throws -> (prefix: String, width: UInt8, lastValue: Int64) {
    let statement = try prepare(
      """
      SELECT reference_prefix, width, last_value
      FROM identifold_sequences
      WHERE namespace = ?1 AND scope = ?2
      """
    )
    defer { sqlite3_finalize(statement) }
    try bind(namespace, to: statement, at: 1)
    try bind(scope, to: statement, at: 2)
    try checkRow(sqlite3_step(statement))
    return (
      try columnText(statement, at: 0),
      UInt8(sqlite3_column_int(statement, 1)),
      sqlite3_column_int64(statement, 2)
    )
  }

  private func updateSequence(namespace: String, scope: String, value: Int64) throws {
    let statement = try prepare(
      """
      UPDATE identifold_sequences SET last_value = ?1
      WHERE namespace = ?2 AND scope = ?3
      """
    )
    defer { sqlite3_finalize(statement) }
    try check(sqlite3_bind_int64(statement, 1, value))
    try bind(namespace, to: statement, at: 2)
    try bind(scope, to: statement, at: 3)
    try expectDone(statement)
    guard sqlite3_changes(connection) == 1 else { throw SQLiteFailure() }
  }

  private func insertAllocation(
    request: SequenceAllocationRequest,
    scope: String,
    sequence: Int64,
    machineID: [UInt8]
  ) throws {
    let statement = try prepare(
      """
      INSERT INTO identifold_sequence_allocations
        (namespace, scope, sequence, machine_id, reference_prefix, width)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      """
    )
    defer { sqlite3_finalize(statement) }
    try bind(request.namespace, to: statement, at: 1)
    try bind(scope, to: statement, at: 2)
    try check(sqlite3_bind_int64(statement, 3, sequence))
    try bind(machineID, to: statement, at: 4)
    try bind(request.referencePrefix, to: statement, at: 5)
    try check(sqlite3_bind_int(statement, 6, Int32(request.width)))
    try expectDone(statement)
  }

  private func readOptionalMapping(_ statement: OpaquePointer) throws -> ReferenceMapping? {
    let result = sqlite3_step(statement)
    if result == SQLITE_DONE { return nil }
    try checkRow(result)
    return ReferenceMapping(
      machineID: try machineIDString(columnBlob(statement, at: 0)),
      namespace: try columnText(statement, at: 1)
    )
  }

  private func prepare(_ sql: String) throws -> OpaquePointer {
    var statement: OpaquePointer?
    try check(sqlite3_prepare_v2(connection, sql, -1, &statement, nil))
    guard let statement else { throw SQLiteFailure() }
    return statement
  }

  private func execute(_ sql: String) throws {
    try check(sqlite3_exec(connection, sql, nil, nil, nil))
  }

  private func databaseOperation<T>(_ operation: () throws -> T) throws -> T {
    do {
      return try operation()
    } catch let error as IdentifoldError {
      throw error
    } catch {
      throw IdentifoldError("allocation_conflict")
    }
  }
}

private struct SQLiteFailure: Error {}

private let sqliteTransient = unsafeBitCast(-1, to: sqlite3_destructor_type.self)

private func check(_ result: Int32) throws {
  guard result == SQLITE_OK else { throw SQLiteFailure() }
}

private func checkRow(_ result: Int32) throws {
  guard result == SQLITE_ROW else { throw SQLiteFailure() }
}

private func expectDone(_ statement: OpaquePointer) throws {
  guard sqlite3_step(statement) == SQLITE_DONE else { throw SQLiteFailure() }
}

private func bind(_ value: String, to statement: OpaquePointer, at index: Int32) throws {
  let result = value.withCString {
    sqlite3_bind_text(statement, index, $0, -1, sqliteTransient)
  }
  try check(result)
}

private func bind(_ value: [UInt8], to statement: OpaquePointer, at index: Int32) throws {
  let result = value.withUnsafeBytes {
    sqlite3_bind_blob(statement, index, $0.baseAddress, Int32($0.count), sqliteTransient)
  }
  try check(result)
}

private func columnText(_ statement: OpaquePointer, at index: Int32) throws -> String {
  guard let value = sqlite3_column_text(statement, index) else { throw SQLiteFailure() }
  return String(cString: UnsafeRawPointer(value).assumingMemoryBound(to: CChar.self))
}

private func columnBlob(_ statement: OpaquePointer, at index: Int32) throws -> [UInt8] {
  let count = Int(sqlite3_column_bytes(statement, index))
  guard count == 16, let value = sqlite3_column_blob(statement, index) else {
    throw SQLiteFailure()
  }
  return Array(UnsafeRawBufferPointer(start: value, count: count))
}

private func machineIDBytes(_ value: String) throws -> [UInt8] {
  let canonical = try Identifiers.parseMachineID(value)
  let hexadecimal = canonical.filter { $0 != "-" }
  return try stride(from: 0, to: hexadecimal.count, by: 2).map { offset in
    let start = hexadecimal.index(hexadecimal.startIndex, offsetBy: offset)
    let end = hexadecimal.index(start, offsetBy: 2)
    guard let byte = UInt8(hexadecimal[start..<end], radix: 16) else { throw SQLiteFailure() }
    return byte
  }
}

private func machineIDString(_ value: [UInt8]) throws -> String {
  guard value.count == 16 else { throw SQLiteFailure() }
  let hexadecimal = value.map { String(format: "%02x", $0) }.joined()
  return [8, 12, 16, 20].reversed().reduce(hexadecimal) { result, offset in
    var result = result
    result.insert("-", at: result.index(result.startIndex, offsetBy: offset))
    return result
  }
}

private func parseSequentialReference(
  _ reference: String
) -> (prefix: String, scope: String, sequence: String)? {
  let parts = reference.split(separator: "-", omittingEmptySubsequences: false).map(String.init)
  let prefix: String
  let scope: String
  let sequence: String
  let check: String
  switch parts.count {
  case 3:
    (prefix, sequence, check) = (parts[0], parts[1], parts[2])
    scope = ""
  case 4:
    (prefix, scope, sequence, check) = (parts[0], parts[1], parts[2], parts[3])
  default:
    return nil
  }
  guard
    (2...8).contains(prefix.count), prefix.allSatisfy({ $0.isASCII && $0.isUppercase }),
    scope.isEmpty || (scope.count == 4 && scope.allSatisfy({ $0.isASCII && $0.isNumber })),
    (4...18).contains(sequence.count),
    sequence.allSatisfy({ $0.isASCII && $0.isNumber }),
    check.count == 1
  else { return nil }
  return (prefix, scope, sequence)
}

private func maximumValue(width: UInt8) -> Int64 {
  (0..<width).reduce(1) { value, _ in value * 10 } - 1
}
