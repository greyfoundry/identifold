-- Example only: adapt legacy table and column names before use.
-- The UUID column remains authoritative; the human reference is an alias.
BEGIN;

INSERT INTO identifold_references (reference, namespace, machine_id)
SELECT legacy_reference, 'ticket', machine_id
FROM legacy_tickets
WHERE legacy_reference IS NOT NULL
ON CONFLICT (reference) DO NOTHING;

COMMIT;
