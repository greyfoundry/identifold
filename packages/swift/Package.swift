// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "Identifold",
  platforms: [.macOS(.v13)],
  products: [
    .library(name: "Identifold", targets: ["Identifold"]),
    .library(name: "IdentifoldPostgres", targets: ["IdentifoldPostgres"]),
    .executable(name: "identifold-adapter", targets: ["IdentifoldAdapter"]),
  ],
  dependencies: [
    .package(url: "https://github.com/vapor/postgres-nio.git", from: "1.21.0")
  ],
  targets: [
    .target(name: "Identifold"),
    .target(
      name: "IdentifoldPostgres",
      dependencies: [
        "Identifold",
        .product(name: "PostgresNIO", package: "postgres-nio"),
      ]
    ),
    .executableTarget(name: "IdentifoldAdapter", dependencies: ["Identifold"]),
    .testTarget(
      name: "IdentifoldTests",
      dependencies: ["Identifold", "IdentifoldPostgres"]
    ),
  ]
)
