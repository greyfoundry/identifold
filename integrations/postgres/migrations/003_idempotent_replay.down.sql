BEGIN;

CREATE OR REPLACE FUNCTION identifold_allocate_sequence(
  requested_machine_id uuid,
  requested_namespace text,
  requested_reference_prefix text,
  requested_scope text,
  requested_width smallint
) RETURNS bigint
LANGUAGE plpgsql
AS $$
DECLARE
  allocated bigint;
  maximum_value bigint;
  scope_key text := coalesce(requested_scope, '');
BEGIN
  IF requested_width < 4 OR requested_width > 18 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_sequence_width';
  END IF;

  maximum_value := (power(10::numeric, requested_width) - 1)::bigint;

  INSERT INTO identifold_sequences (
    namespace,
    scope,
    reference_prefix,
    width,
    last_value
  )
  VALUES (
    requested_namespace,
    scope_key,
    requested_reference_prefix,
    requested_width,
    0
  )
  ON CONFLICT DO NOTHING;

  UPDATE identifold_sequences
  SET last_value = last_value + 1
  WHERE namespace = requested_namespace
    AND scope = scope_key
    AND reference_prefix = requested_reference_prefix
    AND width = requested_width
    AND last_value < maximum_value
  RETURNING last_value INTO allocated;

  IF allocated IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22003',
      MESSAGE = 'sequence_overflow_or_definition_mismatch';
  END IF;

  INSERT INTO identifold_sequence_allocations (
    namespace,
    scope,
    sequence,
    machine_id,
    reference_prefix,
    width
  )
  VALUES (
    requested_namespace,
    scope_key,
    allocated,
    requested_machine_id,
    requested_reference_prefix,
    requested_width
  );

  RETURN allocated;
END;
$$;

COMMIT;
