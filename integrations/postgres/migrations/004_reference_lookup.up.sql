BEGIN;

CREATE OR REPLACE FUNCTION identifold_resolve_reference(
  requested_reference text,
  requested_namespace text
) RETURNS TABLE (
  resolved_machine_id uuid,
  resolved_namespace text
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  reference_parts text[];
  requested_prefix text;
  requested_scope text;
  requested_sequence bigint;
BEGIN
  RETURN QUERY
  SELECT stored.machine_id, stored.namespace
  FROM identifold_references AS stored
  WHERE stored.reference = requested_reference
    AND stored.namespace = requested_namespace;

  IF FOUND THEN
    RETURN;
  END IF;

  reference_parts := regexp_match(
    requested_reference,
    '^([A-Z]{2,8})-([0-9]{4,18})-[0-9A-Z*~$=U]$'
  );
  IF reference_parts IS NOT NULL THEN
    requested_prefix := reference_parts[1];
    requested_scope := '';
    requested_sequence := reference_parts[2]::bigint;
  ELSE
    reference_parts := regexp_match(
      requested_reference,
      '^([A-Z]{2,8})-([0-9]{4})-([0-9]{4,18})-[0-9A-Z*~$=U]$'
    );
    IF reference_parts IS NULL THEN
      RETURN;
    END IF;
    requested_prefix := reference_parts[1];
    requested_scope := reference_parts[2];
    requested_sequence := reference_parts[3]::bigint;
  END IF;

  RETURN QUERY
  SELECT allocation.machine_id, allocation.namespace
  FROM identifold_sequence_allocations AS allocation
  WHERE allocation.namespace = requested_namespace
    AND allocation.reference_prefix = requested_prefix
    AND allocation.scope = requested_scope
    AND allocation.sequence = requested_sequence;
END;
$$;

COMMIT;
