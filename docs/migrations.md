# Legacy identifier migrations

Legacy values are aliases, not inputs to a reversible identifier conversion. `inspectLegacyIdentifier` recognizes bounded UUIDv4, integer, ULID, default NanoID, and short-code shapes. `planLegacyMigration` creates a new UUIDv7 MID and states explicitly that legacy-to-MID resolution must be stored while MID-to-PID derivation is deterministic.

Use `002_legacy_aliases.up.sql` to retain the original value, its classified kind, namespace, and target MID. The UUID remains the application source of truth.

A safe rollout has four stages:

1. Backfill aliases while continuing legacy reads and writes; audit duplicates before accepting traffic.
2. Dual-read by MID first and alias second; compare resolution outcomes and record mismatches without rewriting values.
3. Write new records only with MID/PID while retaining aliases for existing records.
4. Remove legacy reads only after the retention period and a reviewed audit show no required consumers.

Rollback restores the prior read path and reverses only the alias-table migration. It must not delete newly assigned MIDs or overwrite retained legacy values. Alias retention follows application and regulatory requirements; Identifold does not choose a deletion policy.
