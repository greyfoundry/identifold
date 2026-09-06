import Foundation
import Identifold
import IdentifoldPostgres
import PostgresNIO

@main
struct PostgresExample {
  static func main() async throws {
    guard let value = ProcessInfo.processInfo.environment["DATABASE_URL"],
      let url = URL(string: value), let host = url.host,
      let user = url.user, let password = url.password
    else { throw IdentifoldError("allocation_conflict") }
    let client = PostgresClient(
      configuration: .init(
        host: host, port: url.port ?? 5432, username: user, password: password,
        database: String(url.path.dropFirst()), tls: .disable
      ))
    try await withThrowingTaskGroup(of: Void.self) { group in
      group.addTask { await client.run() }
      defer { group.cancelAll() }
      let adapter = PostgresStorageAdapter(client: client)
      let request = ReferenceReservation(
        machineID: "01890f8c-7b2a-7cc3-98b0-112233445566",
        namespace: "order", reference: "ORD-0123-4567-89-P"
      )
      let reserved = try await adapter.reserve(request)
      let mapping = try await adapter.resolve(
        reference: request.reference, namespace: request.namespace
      )
      print("reserved=\(reserved) mapping=\(String(describing: mapping))")
    }
  }
}
