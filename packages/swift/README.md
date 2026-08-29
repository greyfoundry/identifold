# Identifold for Swift

The Swift package implements the stable Identifold 1.0 MID, PID, and REF wire contract with value types, structured errors, and a dependency-free core.

```swift
let pid = try Identifiers.publicID(from: mid, namespace: "order")
let parsed = try Identifiers.parsePublicID(pid)
```

Run `swift test` for package tests. The `identifold-adapter` executable is exercised by the complete language-neutral conformance suite.
