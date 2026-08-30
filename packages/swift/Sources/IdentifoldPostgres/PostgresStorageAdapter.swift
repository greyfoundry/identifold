import Identifold
import PostgresNIO

@available(macOS 13.0, iOS 16.0, tvOS 16.0, watchOS 9.0, *)
public struct PostgresStorageAdapter: StorageAdapter, Sendable {
  private let client: PostgresClient

  public init(client: PostgresClient) {
    self.client = client
  }

  public func reserve(_ request: ReferenceReservation) async throws -> Bool {
    try await databaseOperation {
      let rows = try await client.query("""
        SELECT identifold_reserve_reference(
          \(request.machineID)::text::uuid,
          \(request.namespace)::text,
          \(request.reference)::text
        )
        """)
      var iterator = rows.decode(Bool.self).makeAsyncIterator()
      guard let reserved = try await iterator.next(), try await iterator.next() == nil else {
        throw IdentifoldError("allocation_conflict")
      }
      return reserved
    }
  }

  public func resolve(reference: String, namespace: String) async throws -> ReferenceMapping? {
    try await databaseOperation {
      let rows = try await client.query("""
        SELECT resolved_machine_id::text, resolved_namespace
        FROM identifold_resolve_reference(\(reference)::text, \(namespace)::text)
        """)
      var iterator = rows.decode((String, String).self).makeAsyncIterator()
      guard let value = try await iterator.next() else { return nil }
      guard try await iterator.next() == nil else {
        throw IdentifoldError("allocation_conflict")
      }
      return ReferenceMapping(machineID: value.0, namespace: value.1)
    }
  }

  public func allocate(_ request: SequenceAllocationRequest) async throws -> UInt64 {
    try await databaseOperation {
      let rows: PostgresRowSequence
      if let scope = request.scope {
        rows = try await client.query("""
          SELECT identifold_allocate_sequence(
            \(request.machineID)::text::uuid,
            \(request.namespace)::text,
            \(request.referencePrefix)::text,
            \(scope)::text,
            \(Int16(request.width))::smallint
          )
          """)
      } else {
        rows = try await client.query("""
          SELECT identifold_allocate_sequence(
            \(request.machineID)::text::uuid,
            \(request.namespace)::text,
            \(request.referencePrefix)::text,
            NULL::text,
            \(Int16(request.width))::smallint
          )
          """)
      }
      var iterator = rows.decode(Int64.self).makeAsyncIterator()
      guard let value = try await iterator.next(), value >= 0,
        try await iterator.next() == nil
      else {
        throw IdentifoldError("allocation_conflict")
      }
      return UInt64(value)
    }
  }

  private func databaseOperation<T: Sendable>(
    _ operation: () async throws -> T
  ) async throws -> T {
    do {
      return try await operation()
    } catch let error as IdentifoldError {
      throw error
    } catch let error as PSQLError {
      switch error.serverInfo?[.sqlState] {
      case "22003": throw IdentifoldError("sequence_overflow")
      case "22023": throw IdentifoldError("invalid_allocation_policy")
      default: throw IdentifoldError("allocation_conflict")
      }
    } catch {
      throw IdentifoldError("allocation_conflict")
    }
  }
}
