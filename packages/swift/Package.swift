// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "Identifold",
  platforms: [.macOS(.v13)],
  products: [
    .library(name: "Identifold", targets: ["Identifold"]),
    .library(name: "IdentifoldPostgres", targets: ["IdentifoldPostgres"]),
    .library(name: "IdentifoldSQLite", targets: ["IdentifoldSQLite"]),
    .executable(name: "identifold-adapter", targets: ["IdentifoldAdapter"]),
  ],
  dependencies: [
    .package(url: "https://github.com/vapor/postgres-nio.git", from: "1.21.0")
  ],
  targets: [
    .systemLibrary(
      name: "CSQLite",
      pkgConfig: "sqlite3",
      providers: [
        .apt(["libsqlite3-dev"]),
        .brew(["sqlite3"]),
      ]
    ),
    .target(name: "Identifold"),
    .target(name: "IdentifoldSQLite", dependencies: ["Identifold", "CSQLite"]),
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
      dependencies: ["Identifold", "IdentifoldPostgres", "IdentifoldSQLite", "CSQLite"]
    ),
  ]
)
