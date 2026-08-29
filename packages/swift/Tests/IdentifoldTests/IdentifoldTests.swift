import Testing

@testable import Identifold

@Test func publicIdentifierRoundTrips() throws {
  let mid = "019d4c72-c910-7a84-b313-53c3ac61a32f"
  let pid = try Identifiers.publicID(from: mid, namespace: "order")
  #expect(pid == "order_01kn675j8gfa2b64tkrep638sf")
  let parsed = try Identifiers.parsePublicID(pid)
  #expect(parsed.machineID == mid)
  #expect(parsed.namespace == "order")
}

@Test func referenceChecksMatchContract() throws {
  #expect(try Identifiers.checkSymbol("0123456789", sequential: false) == "P")
  #expect(try Identifiers.checkSymbol("2026001842", sequential: true) == "M")
}
