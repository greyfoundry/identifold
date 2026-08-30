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
        for statement in migrationStatements(script) {
          _ = try await client.query(PostgresQuery(unsafeSQL: statement)).collect()
        }
      }

      let adapter = PostgresStorageAdapter(client: client)
      let randomMID = "01890f8c-7b2a-7cc3-98b0-112233445566"
      let randomREF = "ORD-0123-4567-89-P"
      let reserved = try await adapter.reserve(
        .init(
          machineID: randomMID,
          namespace: "order",
          reference: randomREF
        )
      )
      XCTAssertTrue(reserved)
      let randomMapping = try await adapter.resolve(
        reference: randomREF,
        namespace: "order"
      )
      XCTAssertEqual(randomMapping?.machineID, randomMID)
      let request = SequenceAllocationRequest(
        machineID: "01890f8c-7b2a-7cc3-98b0-112233445567",
        namespace: "receipt",
        referencePrefix: "RCT",
        scope: nil,
        width: 4
      )
      let firstSequence = try await adapter.allocate(request)
      let replayedSequence = try await adapter.allocate(request)
      XCTAssertEqual(firstSequence, 1)
      XCTAssertEqual(replayedSequence, 1)
      let sequentialMapping = try await adapter.resolve(
        reference: "RCT-0001-1",
        namespace: "receipt"
      )
      XCTAssertEqual(sequentialMapping?.machineID, request.machineID)
    }
  }
}

private func migrationStatements(_ script: String) -> [String] {
  let characters = Array(script)
  var statements: [String] = []
  var current = ""
  var index = 0
  var quotedCharacter: Character?
  var dollarQuoted = false

  while index < characters.count {
    let character = characters[index]
    let next = index + 1 < characters.count ? characters[index + 1] : nil

    if quotedCharacter == nil, character == "$", next == "$" {
      current.append(contentsOf: "$$")
      dollarQuoted.toggle()
      index += 2
      continue
    }

    if !dollarQuoted, character == "'" || character == "\"" {
      if quotedCharacter == character, next == character {
        current.append(character)
        current.append(character)
        index += 2
        continue
      }
      if quotedCharacter == nil {
        quotedCharacter = character
      } else if quotedCharacter == character {
        quotedCharacter = nil
      }
    }

    if character == ";", quotedCharacter == nil, !dollarQuoted {
      let statement = current.trimmingCharacters(in: .whitespacesAndNewlines)
      if !statement.isEmpty,
        statement.caseInsensitiveCompare("BEGIN") != .orderedSame,
        statement.caseInsensitiveCompare("COMMIT") != .orderedSame
      {
        statements.append(statement)
      }
      current = ""
    } else {
      current.append(character)
    }
    index += 1
  }

  let remainder = current.trimmingCharacters(in: .whitespacesAndNewlines)
  if !remainder.isEmpty {
    statements.append(remainder)
  }
  return statements
}
