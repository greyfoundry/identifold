// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "Identifold",
  platforms: [.macOS(.v13)],
  products: [
    .library(name: "Identifold", targets: ["Identifold"]),
    .executable(name: "identifold-adapter", targets: ["IdentifoldAdapter"]),
  ],
  targets: [
    .target(name: "Identifold"),
    .executableTarget(name: "IdentifoldAdapter", dependencies: ["Identifold"]),
    .testTarget(name: "IdentifoldTests", dependencies: ["Identifold"]),
  ]
)
