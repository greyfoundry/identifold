# Identifold for Java

[![Maven Central](https://img.shields.io/maven-central/v/io.github.greyfoundry/identifold?logo=apachemaven)](https://central.sonatype.com/artifact/io.github.greyfoundry/identifold)
[![Languages CI](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml)
[![Java 17](https://img.shields.io/badge/Java-17-ED8B00?logo=openjdk)](https://openjdk.org/projects/jdk/17/)

The Java implementation targets Java 17 and the stable Identifold 1.0 MID, PID, and REF wire contract.

## Install

```xml
<dependency>
  <groupId>io.github.greyfoundry</groupId>
  <artifactId>identifold</artifactId>
  <version>1.0.0</version>
</dependency>
```

## Quick start

```java
import io.greyfoundry.identifold.Identifold;

var mid = "019d4c72-c910-7a84-b313-53c3ac61a32f";
var pid = Identifold.publicIdFromMachineId(mid, "order");
var parsed = Identifold.parsePublicId(pid);
```

## Verification

```console
mvn --batch-mode --no-transfer-progress test
```

The Maven project contains a dependency-free core library and an adapter exercised by the complete [language-neutral conformance suite](https://github.com/greyfoundry/identifold/tree/main/conformance). Version 1.0.0 is live on Maven Central.
