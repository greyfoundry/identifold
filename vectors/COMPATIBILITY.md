# Vector compatibility policy

`manifest.json` is the entry point for the Identifold conformance corpus.

`schemaVersion` versions the manifest structure. A runner must reject a schema version it does not support. Additive optional manifest fields may retain the current schema version; changes that alter required fields or their meaning increment it.

`specVersion` versions identifier behavior. Every required vector file must declare the same value as the manifest. A runner must reject mixed versions instead of silently applying partial compatibility.

Before specification 1.0, vector values and error classifications may change incompatibly. Each such change updates `specVersion`. After 1.0, existing valid values, canonical normalization, and stable error classifications remain valid for the lifetime of that major specification version.

Files marked `required` are part of a complete conformance claim. Implementations may publish additional implementation-specific tests, but those tests do not change the language-neutral contract.
