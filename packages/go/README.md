# Identifold for Go

[![Go package](https://pkg.go.dev/badge/github.com/greyfoundry/identifold/packages/go.svg)](https://pkg.go.dev/github.com/greyfoundry/identifold/packages/go)
[![Languages CI](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml)
[![Go version](https://img.shields.io/github/go-mod/go-version/greyfoundry/identifold?filename=packages%2Fgo%2Fgo.mod&logo=go)](go.mod)

The Go implementation targets the Identifold 1.0 wire contract. It provides UUIDv7 MID validation, TypeID-compatible PID conversion, and checksummed random and sequential reference operations.

## Install

```console
go get github.com/greyfoundry/identifold/packages/go@v1.0.0
```

## Quick start

```go
import "github.com/greyfoundry/identifold/packages/go"

mid := "019d4c72-c910-7a84-b313-53c3ac61a32f"
pid, err := identifold.PublicIDFromMachineID(mid, "order")
parsed, err := identifold.ParsePublicID(pid)
```

## Verification

```console
go test ./...
go vet ./...
```

The adapter under `cmd/identifold-adapter` is exercised by the complete [language-neutral conformance suite](https://github.com/greyfoundry/identifold/tree/main/conformance). The `packages/go/v1.0.0` module tag is available through the public Go proxy.
