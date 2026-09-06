// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "IdentifoldDatabaseExamples",
  platforms: [.macOS(.v13)],
  dependencies: [
    .package(path: "../../../packages/swift"),
    .package(url: "https://github.com/vapor/mysql-nio.git", from: "1.9.1"),
    .package(url: "https://github.com/vapor/postgres-nio.git", from: "1.21.0"),
    .package(url: "https://github.com/apple/swift-nio.git", from: "2.101.3"),
  ],
  targets: [
    .executableTarget(
      name: "SQLiteExample",
      dependencies: [
        .product(name: "Identifold", package: "swift"),
        .product(name: "IdentifoldSQLite", package: "swift"),
      ]
    ),
    .executableTarget(
      name: "MySQLExample",
      dependencies: [
        .product(name: "Identifold", package: "swift"),
        .product(name: "IdentifoldMySQL", package: "swift"),
        .product(name: "MySQLNIO", package: "mysql-nio"),
        .product(name: "NIOPosix", package: "swift-nio"),
      ]
    ),
    .executableTarget(
      name: "PostgresExample",
      dependencies: [
        .product(name: "Identifold", package: "swift"),
        .product(name: "IdentifoldPostgres", package: "swift"),
        .product(name: "PostgresNIO", package: "postgres-nio"),
      ]
    ),
  ]
)
