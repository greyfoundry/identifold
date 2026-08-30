import Testing

@testable import Identifold

private struct FakeStorage: StorageAdapter {
  func reserve(_ request: ReferenceReservation) async throws -> Bool { true }

  func resolve(reference: String, namespace: String) async throws -> ReferenceMapping? {
    ReferenceMapping(
      machineID: "01890f8c-7b2a-7cc3-98b0-112233445566",
      namespace: namespace)
  }

  func allocate(_ request: SequenceAllocationRequest) async throws -> UInt64 { 1 }
}

@Test func storageAdapterExposesAllOperations() async throws {
  let adapter: any StorageAdapter = FakeStorage()
  let reservation = ReferenceReservation(
    machineID: "01890f8c-7b2a-7cc3-98b0-112233445566",
    namespace: "order",
    reference: "ORD-0123-4567-89-P")
  #expect(try await adapter.reserve(reservation))
  #expect(
    try await adapter.resolve(
      reference: reservation.reference, namespace: reservation.namespace)?.machineID
      == reservation.machineID)
  #expect(
    try await adapter.allocate(
      SequenceAllocationRequest(
        machineID: reservation.machineID,
        namespace: "receipt",
        referencePrefix: "RCT",
        scope: nil,
        width: 4)) == 1)
}
