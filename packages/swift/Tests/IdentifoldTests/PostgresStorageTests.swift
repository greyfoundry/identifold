import Foundation
import Identifold
import IdentifoldPostgres
import PostgresNIO
import XCTest

final class PostgresStorageTests: XCTestCase {
  func testReservesAllocatesAndResolves() async throws {
    guard let value = ProcessInfo.processInfo.environment["IDENTIFOLD_TEST_DATABASE_URL"],
      let url = URL(string: value),
      let host = url.host,
      let user = url.user,
      let password = url.password
    else { return }

    let client = PostgresClient(
      configuration: .init(
        host: host,
        port: url.port ?? 5432,
        username: user,
        password: password,
        database: String(url.path.dropFirst()),
        tls: .disable
      )
    )

    try await withThrowingTaskGroup(of: Void.self) { group in
      group.addTask { await client.run() }
      defer { group.cancelAll() }

      let testDirectory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
      let root = testDirectory.appendingPathComponent("../../../..").standardizedFileURL
      for migration in [
        "001_identifold.down.sql",
        "001_identifold.up.sql",
        "003_idempotent_replay.up.sql",
        "004_reference_lookup.up.sql",
      ] {
        let migrationURL = root.appendingPathComponent(
          "integrations/postgres/migrations/\(migration)"
        )
        let script = try String(contentsOf: migrationURL, encoding: .utf8)
        _ = try await client.query(PostgresQuery(unsafeSQL: script)).collect()
      }

      let adapter = PostgresStorageAdapter(client: client)
      let randomMID = "01890f8c-7b2a-7cc3-98b0-112233445566"
      let randomREF = "ORD-0123-4567-89-P"
      XCTAssertTrue(try await adapter.reserve(.init(
        machineID: randomMID,
        namespace: "order",
        reference: randomREF
      )))
      XCTAssertEqual(
        try await adapter.resolve(reference: randomREF, namespace: "order")?.machineID,
        randomMID
      )
      let request = SequenceAllocationRequest(
        machineID: "01890f8c-7b2a-7cc3-98b0-112233445567",
        namespace: "receipt",
        referencePrefix: "RCT",
        scope: nil,
        width: 4
      )
      XCTAssertEqual(try await adapter.allocate(request), 1)
      XCTAssertEqual(try await adapter.allocate(request), 1)
      XCTAssertEqual(
        try await adapter.resolve(reference: "RCT-0001-1", namespace: "receipt")?.machineID,
        request.machineID
      )
    }
  }
}
