# Identifold for .NET

The .NET implementation provides a nullable-safe C# API for the stable Identifold 1.0 MID, PID, and REF wire contract.

```csharp
var pid = Identifiers.PublicIdFromMachineId(mid, "order");
var parsed = Identifiers.ParsePublicId(pid);
```

The `Greyfoundry.Identifold` project is package-ready. The adapter console project is exercised by the language-neutral conformance runner.
