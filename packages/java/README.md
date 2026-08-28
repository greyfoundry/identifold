# Identifold for Java

The Java implementation targets Java 17 and the stable Identifold 1.0 MID, PID, and REF wire contract.

```java
var pid = Identifold.publicIdFromMachineId(mid, "order");
var parsed = Identifold.parsePublicId(pid);
```

The Maven project contains a dependency-free core library and an adapter used by the language-neutral conformance runner.
