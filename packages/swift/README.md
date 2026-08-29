# Identifold for Swift

[![Swift Package Manager](https://img.shields.io/github/v/release/greyfoundry/identifold?display_name=tag&logo=swift)](https://github.com/greyfoundry/identifold/releases/latest)
[![Languages CI](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml)
[![Swift 6](https://img.shields.io/badge/Swift-6-F05138?logo=swift)](https://www.swift.org/)

The Swift package implements the stable Identifold 1.0 MID, PID, and REF wire contract with value types, structured errors, and a dependency-free core.

## Install

```swift
dependencies: [
    .package(
        url: "https://github.com/greyfoundry/identifold.git",
        from: "1.0.0"
    )
]
```

Add `.product(name: "Identifold", package: "identifold")` to the target that consumes the library.

## Quick start

```swift
import Identifold

let mid = "019d4c72-c910-7a84-b313-53c3ac61a32f"
let pid = try Identifiers.publicID(from: mid, namespace: "order")
let parsed = try Identifiers.parsePublicID(pid)
```

## Verification

```console
swift test
swift test --package-path packages/swift
```

The `identifold-adapter` executable is exercised by the complete [language-neutral conformance suite](https://github.com/greyfoundry/identifold/tree/main/conformance). Version 1.0.0 is available from the repository's Swift Package Manager tag.
