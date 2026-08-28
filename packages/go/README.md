# Identifold for Go

The Go implementation targets the Identifold 1.0 wire contract. It provides UUIDv7 MID validation, TypeID-compatible PID conversion, and checksummed random and sequential reference operations.

```go
pid, err := identifold.PublicIDFromMachineID(mid, "order")
parsed, err := identifold.ParsePublicID(pid)
```

Run the package tests with `go test ./...`. The adapter under `cmd/identifold-adapter` is used by the language-neutral conformance runner.
