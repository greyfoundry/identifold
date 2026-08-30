public struct ReferenceReservation: Equatable, Sendable {
  public let machineID: String
  public let namespace: String
  public let reference: String

  public init(machineID: String, namespace: String, reference: String) {
    self.machineID = machineID
    self.namespace = namespace
    self.reference = reference
  }
}

public struct ReferenceMapping: Equatable, Sendable {
  public let machineID: String
  public let namespace: String

  public init(machineID: String, namespace: String) {
    self.machineID = machineID
    self.namespace = namespace
  }
}

public struct SequenceAllocationRequest: Equatable, Sendable {
  public let machineID: String
  public let namespace: String
  public let referencePrefix: String
  public let scope: String?
  public let width: UInt8

  public init(
    machineID: String,
    namespace: String,
    referencePrefix: String,
    scope: String?,
    width: UInt8
  ) {
    self.machineID = machineID
    self.namespace = namespace
    self.referencePrefix = referencePrefix
    self.scope = scope
    self.width = width
  }
}

public protocol StorageAdapter: Sendable {
  func reserve(_ request: ReferenceReservation) async throws -> Bool

  func resolve(reference: String, namespace: String) async throws -> ReferenceMapping?

  func allocate(_ request: SequenceAllocationRequest) async throws -> UInt64
}
