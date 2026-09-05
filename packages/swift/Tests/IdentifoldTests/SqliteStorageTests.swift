import CSQLite
import Foundation
import Identifold
import IdentifoldSQLite
import XCTest

final class SqliteStorageTests: XCTestCase {
  func testReservesAllocatesReplaysAndResolves() async throws {
    var connection: OpaquePointer?
    XCTAssertEqual(sqlite3_open(":memory:", &connection), SQLITE_OK)
    let handle = try XCTUnwrap(connection)
    defer { sqlite3_close(handle) }

    let testDirectory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    let root = testDirectory.appendingPathComponent("../../../..").standardizedFileURL
    let migrationURL = root.appendingPathComponent(
      "integrations/sqlite/migrations/001_identifold.up.sql"
    )
    let migration = try String(contentsOf: migrationURL, encoding: .utf8)
    var errorMessage: UnsafeMutablePointer<CChar>?
    XCTAssertEqual(sqlite3_exec(handle, migration, nil, nil, &errorMessage), SQLITE_OK)
    if let errorMessage {
      let message = String(cString: errorMessage)
      sqlite3_free(errorMessage)
      XCTFail(message)
    }

    let adapter = SqliteStorageAdapter(connection: handle)
    let randomMID = "01890f8c-7b2a-7cc3-98b0-112233445566"
    let randomREF = "ORD-0123-4567-89-P"
    let reserved = try await adapter.reserve(
      .init(machineID: randomMID, namespace: "order", reference: randomREF)
    )
    XCTAssertTrue(reserved)
    let randomMapping = try await adapter.resolve(reference: randomREF, namespace: "order")
    XCTAssertEqual(randomMapping?.machineID, randomMID)

    let request = SequenceAllocationRequest(
      machineID: "01890f8c-7b2a-7cc3-98b0-112233445567",
      namespace: "receipt",
      referencePrefix: "RCT",
      scope: nil,
      width: 4
    )
    let sequence = try await adapter.allocate(request)
    let replay = try await adapter.allocate(request)
    XCTAssertEqual(sequence, 1)
    XCTAssertEqual(replay, 1)
    let sequenceMapping = try await adapter.resolve(
      reference: "RCT-0001-1",
      namespace: "receipt"
    )
    XCTAssertEqual(sequenceMapping?.machineID, request.machineID)
  }
}
