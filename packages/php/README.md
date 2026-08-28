# Identifold for PHP

The Composer package implements the stable Identifold 1.0 MID, PID, and REF wire contract for PHP 8.2 and later.

```php
$pid = Identifold::publicIdFromMachineId($mid, 'order');
$parsed = Identifold::parsePublicId($pid);
```

The dependency-free core and JSON adapter are exercised by the language-neutral conformance runner.
