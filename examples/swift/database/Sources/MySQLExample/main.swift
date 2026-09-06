import Foundation
import Identifold
import IdentifoldMySQL
import MySQLNIO
import NIOPosix

@main
struct MySQLExample {
  static func main() async throws {
    guard let value = ProcessInfo.processInfo.environment["IDENTIFOLD_TEST_MYSQL_URL"],
      let url = URL(string: value), let host = url.host,
      let user = url.user, let password = url.password
    else { throw IdentifoldError("allocation_conflict") }
    let group = MultiThreadedEventLoopGroup(numberOfThreads: 1)
    let address = try SocketAddress.makeAddressResolvingHost(host, port: url.port ?? 3306)
    let connection = try await MySQLConnection.connect(
      to: address,
      username: user,
      database: String(url.path.dropFirst()),
      password: password,
      tlsConfiguration: nil,
      on: group.next()
    ).get()
    do {
      let adapter = MySQLStorageAdapter(connection: connection)
      let request = ReferenceReservation(
        machineID: "01890f8c-7b2a-7cc3-98b0-112233445568",
        namespace: "order",
        reference: "ORD-9876-5432-10-X"
      )
      let reserved = try await adapter.reserve(request)
      let mapping = try await adapter.resolve(
        reference: request.reference,
        namespace: request.namespace
      )
      print("reserved=\(reserved) mapping=\(String(describing: mapping))")
    } catch {
      try? await connection.close().get()
      try? await group.shutdownGracefully()
      throw error
    }
    try await connection.close().get()
    try await group.shutdownGracefully()
  }
}
