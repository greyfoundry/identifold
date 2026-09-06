import Foundation
import Identifold
import IdentifoldSQLite

@main
struct SQLiteExample {
  static func main() async throws {
    var connection: OpaquePointer?
    guard sqlite3_open(":memory:", &connection) == SQLITE_OK, let handle = connection else {
      throw IdentifoldError("allocation_conflict")
    }
    defer { sqlite3_close(handle) }
    let migration = try String(
      contentsOfFile: "integrations/sqlite/migrations/001_identifold.up.sql",
      encoding: .utf8
    )
    guard sqlite3_exec(handle, migration, nil, nil, nil) == SQLITE_OK else {
      throw IdentifoldError("allocation_conflict")
    }
    let adapter = SqliteStorageAdapter(connection: handle)
    let request = ReferenceReservation(
      machineID: "01890f8c-7b2a-7cc3-98b0-112233445566",
      namespace: "order",
      reference: "ORD-0123-4567-89-P"
    )
    let reserved = try await adapter.reserve(request)
    let mapping = try await adapter.resolve(
      reference: request.reference,
      namespace: request.namespace
    )
    print("reserved=\(reserved) mapping=\(String(describing: mapping))")
  }
}
