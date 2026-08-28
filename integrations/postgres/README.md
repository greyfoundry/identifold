# PostgreSQL integration

Apply `migrations/001_identifold.up.sql` to create the storage tables and the two atomic allocation functions. The matching down migration removes the complete integration. `backfill.sql` is an adaptation template, not a ready-to-run migration.

The UUIDv7 MID stored in application tables remains the source of truth. Human references and scoped sequences are aliases bound to that MID; they must not replace primary or foreign-key UUID columns.

Use the `@greyfoundry/identifold/postgres`, `/prisma`, or `/drizzle` entry point matching the database client. Each adapter calls the same PostgreSQL functions with parameters. `identifold_reserve_reference` relies on the `C`-collated primary key for byte-stable uniqueness. `identifold_allocate_sequence` advances and binds a value in one transaction, using an empty scope key for unscoped namespaces.

Run migrations with a role allowed to create functions and tables. Run applications with only the permissions needed to execute the functions and read their own resolution data. Do not retry a failed allocation outside the service's documented retry boundary without first determining whether the transaction committed.
