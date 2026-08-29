# Identifold for .NET

[![NuGet](https://img.shields.io/nuget/v/Greyfoundry.Identifold?logo=nuget)](https://www.nuget.org/packages/Greyfoundry.Identifold)
[![Languages CI](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml)
[![.NET 9](https://img.shields.io/badge/.NET-9-512BD4?logo=dotnet)](https://dotnet.microsoft.com/)

The .NET implementation provides a nullable-safe C# API for the stable Identifold 1.0 MID, PID, and REF wire contract.

## Install

```console
dotnet add package Greyfoundry.Identifold --version 1.0.0
```

## Quick start

```csharp
using Greyfoundry.Identifold;

var pid = Identifiers.PublicIdFromMachineId(mid, "order");
var parsed = Identifiers.ParsePublicId(pid);
```

## Verification

```console
dotnet run --project tests/Identifold.Tests/Identifold.Tests.csproj
```

The adapter console project is exercised by the complete [language-neutral conformance suite](https://github.com/greyfoundry/identifold/tree/main/conformance). Version 1.0.0 is live on NuGet.
