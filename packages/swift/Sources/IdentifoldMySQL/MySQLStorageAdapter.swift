import Foundation
import Identifold
import MySQLNIO

@available(macOS 13.0, iOS 16.0, tvOS 16.0, watchOS 9.0, *)
public struct MySQLStorageAdapter: StorageAdapter, Sendable {
  private let connection: MySQLConnection
  private let transactionGate: MySQLTransactionGate

  public init(connection: MySQLConnection) {
    self.connection = connection
    self.transactionGate = MySQLTransactionGate()
  }

  public func reserve(_ request: ReferenceReservation) async throws -> Bool {
    try await databaseOperation {
      let machineID = try mysqlUUID(request.machineID)
      nonisolated(unsafe) var affectedRows: UInt64 = 0
      _ = try await connection.query(
        """
        INSERT IGNORE INTO identifold_references (machine_id, namespace, reference)
        VALUES (?, ?, ?)
        """,
        [machineID, .init(string: request.namespace), .init(string: request.reference)],
        onMetadata: { affectedRows = $0.affectedRows }
      ).get()
      return affectedRows == 1
    }
  }

  public func resolve(reference: String, namespace: String) async throws -> ReferenceMapping? {
    try await databaseOperation {
      let randomRows = try await connection.query(
        """
        SELECT machine_id, namespace
        FROM identifold_references
        WHERE reference = ? AND namespace = ?
        """,
        [.init(string: reference), .init(string: namespace)]
      ).get()
      if let row = try onlyRow(randomRows) {
        return try mapping(row)
      }

      guard let parts = sequentialReferenceParts(reference) else { return nil }
      let rows = try await connection.query(
        """
        SELECT machine_id, namespace
        FROM identifold_sequence_allocations
        WHERE namespace = ? AND reference_prefix = ? AND scope = ? AND sequence = ?
        """,
        [
          .init(string: namespace),
          .init(string: parts.prefix),
          .init(string: parts.scope),
          .init(string: parts.sequence),
        ]
      ).get()
      return try onlyRow(rows).map(mapping)
    }
  }

  public func allocate(_ request: SequenceAllocationRequest) async throws -> UInt64 {
    guard (4...18).contains(request.width) else {
      throw IdentifoldError("invalid_allocation_policy")
    }

    await transactionGate.acquire()
    do {
      let sequence = try await allocateSerially(request)
      await transactionGate.release()
      return sequence
    } catch {
      await transactionGate.release()
      throw error
    }
  }

  private func allocateSerially(_ request: SequenceAllocationRequest) async throws -> UInt64 {
    for attempt in 0..<5 {
      do {
        return try await allocateTransaction(request)
      } catch  where attempt < 4 && transient(error) {
        _ = try? await connection.simpleQuery("ROLLBACK").get()
        try await Task<Never, Never>.sleep(for: .milliseconds(1 << attempt))
      } catch {
        _ = try? await connection.simpleQuery("ROLLBACK").get()
        throw mapped(error)
      }
    }
    throw IdentifoldError("allocation_conflict")
  }

  private func allocateTransaction(_ request: SequenceAllocationRequest) async throws -> UInt64 {
    let machineID = try mysqlUUID(request.machineID)
    let scope = request.scope ?? ""
    _ = try await connection.simpleQuery("START TRANSACTION").get()

    let replayRows = try await connection.query(
      """
      SELECT sequence, reference_prefix, width
      FROM identifold_sequence_allocations
      WHERE namespace = ? AND scope = ? AND machine_id = ?
      FOR UPDATE
      """,
      [.init(string: request.namespace), .init(string: scope), machineID]
    ).get()
    if let replay = try onlyRow(replayRows) {
      guard let sequence = replay.column("sequence")?.uint64,
        replay.column("reference_prefix")?.string == request.referencePrefix,
        replay.column("width")?.uint8 == request.width
      else { throw IdentifoldError("invalid_allocation_policy") }
      _ = try await connection.simpleQuery("COMMIT").get()
      return sequence
    }

    _ = try await connection.query(
      """
      INSERT INTO identifold_sequences
        (namespace, scope, reference_prefix, width, counter_value)
      VALUES (?, ?, ?, ?, 0)
      ON DUPLICATE KEY UPDATE namespace = VALUES(namespace)
      """,
      [
        .init(string: request.namespace),
        .init(string: scope),
        .init(string: request.referencePrefix),
        .init(int: Int(request.width)),
      ]
    ).get()

    let policyRows = try await connection.query(
      """
      SELECT reference_prefix, width, counter_value
      FROM identifold_sequences
      WHERE namespace = ? AND scope = ?
      FOR UPDATE
      """,
      [.init(string: request.namespace), .init(string: scope)]
    ).get()
    guard let policy = try onlyRow(policyRows),
      policy.column("reference_prefix")?.string == request.referencePrefix,
      policy.column("width")?.uint8 == request.width,
      let current = policy.column("counter_value")?.uint64
    else { throw IdentifoldError("invalid_allocation_policy") }
    guard current < maximumValue(width: request.width) else {
      throw IdentifoldError("sequence_overflow")
    }

    let allocated = current + 1
    _ = try await connection.query(
      """
      UPDATE identifold_sequences SET counter_value = ?
      WHERE namespace = ? AND scope = ?
      """,
      [
        .init(int: Int(allocated)),
        .init(string: request.namespace),
        .init(string: scope),
      ]
    ).get()
    _ = try await connection.query(
      """
      INSERT INTO identifold_sequence_allocations
        (namespace, scope, sequence, machine_id, reference_prefix, width)
      VALUES (?, ?, ?, ?, ?, ?)
      """,
      [
        .init(string: request.namespace),
        .init(string: scope),
        .init(int: Int(allocated)),
        machineID,
        .init(string: request.referencePrefix),
        .init(int: Int(request.width)),
      ]
    ).get()
    _ = try await connection.simpleQuery("COMMIT").get()
    return allocated
  }

  private func databaseOperation<T: Sendable>(
    _ operation: () async throws -> T
  ) async throws -> T {
    do {
      return try await operation()
    } catch {
      throw mapped(error)
    }
  }
}

private actor MySQLTransactionGate {
  private var locked = false
  private var waiters: [CheckedContinuation<Void, Never>] = []

  func acquire() async {
    if !locked {
      locked = true
      return
    }
    await withCheckedContinuation { continuation in
      waiters.append(continuation)
    }
  }

  func release() {
    if waiters.isEmpty {
      locked = false
    } else {
      waiters.removeFirst().resume()
    }
  }
}

private func onlyRow(_ rows: [MySQLRow]) throws -> MySQLRow? {
  guard rows.count <= 1 else { throw IdentifoldError("allocation_conflict") }
  return rows.first
}

private func mapping(_ row: MySQLRow) throws -> ReferenceMapping {
  guard let machineID = row.column("machine_id")?.uuid?.uuidString.lowercased(),
    let namespace = row.column("namespace")?.string
  else {
    throw IdentifoldError("allocation_conflict")
  }
  return ReferenceMapping(machineID: machineID, namespace: namespace)
}

private func mysqlUUID(_ value: String) throws -> MySQLData {
  guard let uuid = UUID(uuidString: value) else {
    throw IdentifoldError("allocation_conflict")
  }
  return MySQLData(uuid: uuid)
}

private func sequentialReferenceParts(
  _ reference: String
) -> (prefix: String, scope: String, sequence: String)? {
  let parts = reference.split(separator: "-", omittingEmptySubsequences: false).map(String.init)
  let prefix: String
  let scope: String
  let sequence: String
  let check: String
  switch parts.count {
  case 3:
    (prefix, scope, sequence, check) = (parts[0], "", parts[1], parts[2])
  case 4:
    (prefix, scope, sequence, check) = (parts[0], parts[1], parts[2], parts[3])
  default:
    return nil
  }
  guard (2...8).contains(prefix.count), prefix.allSatisfy({ $0.isASCII && $0.isUppercase }),
    scope.isEmpty || scope.count == 4 && scope.allSatisfy({ $0.isASCII && $0.isNumber }),
    (4...18).contains(sequence.count), sequence.allSatisfy({ $0.isASCII && $0.isNumber }),
    check.count == 1
  else { return nil }
  return (prefix, scope, sequence)
}

private func mapped(_ error: any Error) -> IdentifoldError {
  if let error = error as? IdentifoldError { return error }
  guard case .server(let packet) = error as? MySQLError else {
    return IdentifoldError("allocation_conflict")
  }
  switch packet.sqlState {
  case "22003": return IdentifoldError("sequence_overflow")
  case "22023": return IdentifoldError("invalid_allocation_policy")
  default: return IdentifoldError("allocation_conflict")
  }
}

private func transient(_ error: any Error) -> Bool {
  guard case .server(let packet) = error as? MySQLError else { return false }
  return packet.errorCode.rawValue == 1205
    || packet.errorCode.rawValue == 1213
    || packet.sqlState == "40001"
}

private func maximumValue(width: UInt8) -> UInt64 {
  (0..<width).reduce(1) { value, _ in value * 10 } - 1
}
