import Foundation
import Identifold
import IdentifoldMySQL
import MySQLNIO
import NIOPosix
import XCTest

final class MySQLStorageTests: XCTestCase {
  func testReservesAllocatesAndResolves() async throws {
    guard let value = ProcessInfo.processInfo.environment["IDENTIFOLD_TEST_MYSQL_URL"],
      let url = URL(string: value),
      let host = url.host,
      let user = url.user,
      let password = url.password
    else { return }

    let group = MultiThreadedEventLoopGroup(numberOfThreads: 1)
    defer { try? group.syncShutdownGracefully() }
    let address = try SocketAddress.makeAddressResolvingHost(host, port: url.port ?? 3306)
    let connection = try await MySQLConnection.connect(
      to: address,
      username: user,
      database: String(url.path.dropFirst()),
      password: password,
      tlsConfiguration: nil,
      on: group.next()
    ).get()
    defer { try? connection.close().wait() }

    for table in [
      "identifold_sequence_allocations",
      "identifold_sequences",
      "identifold_references",
    ] {
      _ = try await connection.simpleQuery("DELETE FROM \(table)").get()
    }

    let adapter = MySQLStorageAdapter(connection: connection)
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
