# Identifold for Kotlin

[![Maven Central](https://img.shields.io/maven-central/v/io.github.greyfoundry/identifold-kotlin?logo=apachemaven)](https://central.sonatype.com/artifact/io.github.greyfoundry/identifold-kotlin)
[![Languages CI](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml)
[![Kotlin](https://img.shields.io/badge/Kotlin-2.4-7F52FF?logo=kotlin)](https://kotlinlang.org/)

The Kotlin package provides an idiomatic JVM API for the stable Identifold 1.0 MID, PID, and REF wire contract. It shares the dependency-free Java core while exposing Kotlin data classes and default arguments.

## Install

```xml
<dependency>
  <groupId>io.github.greyfoundry</groupId>
  <artifactId>identifold-kotlin</artifactId>
  <version>1.0.0</version>
</dependency>
```

## Quick start

```kotlin
import io.greyfoundry.identifold.KotlinIdentifold

val mid = "019d4c72-c910-7a84-b313-53c3ac61a32f"
val pid = KotlinIdentifold.publicIdFromMachineId(mid, "order")
val parsed = KotlinIdentifold.parsePublicId(pid)
```

## Verification

```console
mvn --batch-mode --no-transfer-progress test
```

The package is compiled independently and its adapter is exercised by the complete [language-neutral conformance suite](https://github.com/greyfoundry/identifold/tree/main/conformance). Version 1.0.0 is live on Maven Central.
