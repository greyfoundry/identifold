// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "Identifold",
  platforms: [.macOS(.v13)],
  products: [
    .library(name: "Identifold", targets: ["Identifold"]),
    .executable(name: "IdentifoldExample", targets: ["IdentifoldExample"]),
  ],
  targets: [
    .target(
      name: "Identifold",
      path: "packages/swift/Sources/Identifold"
    ),
    .executableTarget(
      name: "IdentifoldExample",
      dependencies: ["Identifold"],
      path: "examples/swift",
      exclude: ["database"]
    ),
    .testTarget(
      name: "IdentifoldTests",
      dependencies: ["Identifold"],
      path: "packages/swift/Tests/IdentifoldTests",
      exclude: ["PostgresStorageTests.swift", "SqliteStorageTests.swift"]
    ),
  ]
)
