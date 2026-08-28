# Identifold for Ruby

The Ruby gem implements the stable Identifold 1.0 MID, PID, and REF wire contract for Ruby 3.2 and later.

```ruby
pid = Identifold.public_id_from_machine_id(mid, "order")
parsed = Identifold.parse_public_id(pid)
```

The dependency-free core and JSON adapter are exercised by the language-neutral conformance runner.
