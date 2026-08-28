BEGIN;

DROP FUNCTION IF EXISTS identifold_allocate_sequence(uuid, text, text, text, smallint);
DROP FUNCTION IF EXISTS identifold_reserve_reference(uuid, text, text);
DROP TABLE IF EXISTS identifold_sequence_allocations;
DROP TABLE IF EXISTS identifold_sequences;
DROP TABLE IF EXISTS identifold_references;

COMMIT;
