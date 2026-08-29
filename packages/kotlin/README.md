# Identifold for Kotlin

The Kotlin package provides an idiomatic JVM API for the stable Identifold 1.0 MID, PID, and REF wire contract. It shares the dependency-free Java core while exposing Kotlin data classes and default arguments.

```kotlin
val pid = KotlinIdentifold.publicIdFromMachineId(mid, "order")
val parsed = KotlinIdentifold.parsePublicId(pid)
```

The package is compiled independently and its adapter is exercised by the complete language-neutral conformance suite.
