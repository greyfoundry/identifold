# Developer integrations

The optional entry points `@greyfoundry/identifold/zod`, `/openapi`, `/json`, `/middleware`, and `/observability` carry validated identifiers through application boundaries without changing their wire formats.

Zod schemas transform strings into the package's branded MID, namespace-specific PID, and REF types. OpenAPI components describe syntax and registered namespaces through versioned custom formats. JSON helpers verify that a PID contains the same MID and that an optional REF belongs to the same namespace.

The middleware helper turns expected input mistakes into bounded `400` errors with stable codes and no input echo. Structured logging fields include kind, namespace, strategy, and UUID version; they intentionally omit the complete identifier.

Identifiers identify records. They do not prove identity, possession, authorization, tenancy, or permission. Applications must perform those checks independently after parsing and resolution.
