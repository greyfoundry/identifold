// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "Identifold",
  platforms: [.macOS(.v13)],
  products: [
    .library(name: "Identifold", targets: ["Identifold"]),
    .library(name: "IdentifoldMySQL", targets: ["IdentifoldMySQL"]),
    .library(name: "IdentifoldPostgres", targets: ["IdentifoldPostgres"]),
    .library(name: "IdentifoldSQLite", targets: ["IdentifoldSQLite"]),
    .executable(name: "identifold-adapter", targets: ["IdentifoldAdapter"]),
  ],
  dependencies: [
    .package(url: "https://github.com/vapor/mysql-nio.git", from: "1.9.1"),
    .package(url: "https://github.com/vapor/postgres-nio.git", from: "1.21.0"),
    .package(url: "https://github.com/apple/swift-nio.git", from: "2.101.3"),
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
    .target(
      name: "IdentifoldMySQL",
      dependencies: [
        "Identifold",
        .product(name: "MySQLNIO", package: "mysql-nio"),
      ]
    ),
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
      dependencies: [
        "Identifold",
        "IdentifoldMySQL",
        "IdentifoldPostgres",
        "IdentifoldSQLite",
        "CSQLite",
        .product(name: "MySQLNIO", package: "mysql-nio"),
        .product(name: "NIOPosix", package: "swift-nio"),
      ]
    ),
  ]
)
