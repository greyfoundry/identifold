// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "Identifold",
  platforms: [.macOS(.v13)],
  products: [
    .library(name: "Identifold", targets: ["Identifold"])
  ],
  targets: [
    .target(
      name: "Identifold",
      path: "packages/swift/Sources/Identifold"
    ),
    .testTarget(
      name: "IdentifoldTests",
      dependencies: ["Identifold"],
      path: "packages/swift/Tests/IdentifoldTests"
    ),
  ]
)
