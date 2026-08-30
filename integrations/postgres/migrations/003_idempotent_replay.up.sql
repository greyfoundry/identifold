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
  current_last_value bigint;
  current_reference_prefix text;
  current_width smallint;
  existing_sequence bigint;
  maximum_value bigint;
  scope_key text := coalesce(requested_scope, '');
BEGIN
  IF requested_width < 4 OR requested_width > 18 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'invalid_sequence_width';
  END IF;

  SELECT
    allocation.sequence,
    allocation.reference_prefix,
    allocation.width
  INTO
    existing_sequence,
    current_reference_prefix,
    current_width
  FROM identifold_sequence_allocations AS allocation
  WHERE allocation.namespace = requested_namespace
    AND allocation.scope = scope_key
    AND allocation.machine_id = requested_machine_id;

  IF FOUND THEN
    IF current_reference_prefix <> requested_reference_prefix
      OR current_width <> requested_width THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'sequence_replay_policy_mismatch';
    END IF;
    RETURN existing_sequence;
  END IF;

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

  SELECT
    sequence_state.reference_prefix,
    sequence_state.width,
    sequence_state.last_value
  INTO
    current_reference_prefix,
    current_width,
    current_last_value
  FROM identifold_sequences AS sequence_state
  WHERE sequence_state.namespace = requested_namespace
    AND sequence_state.scope = scope_key
  FOR UPDATE;

  IF NOT FOUND
    OR current_reference_prefix <> requested_reference_prefix
    OR current_width <> requested_width THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'sequence_definition_mismatch';
  END IF;

  SELECT allocation.sequence
  INTO existing_sequence
  FROM identifold_sequence_allocations AS allocation
  WHERE allocation.namespace = requested_namespace
    AND allocation.scope = scope_key
    AND allocation.machine_id = requested_machine_id;

  IF FOUND THEN
    RETURN existing_sequence;
  END IF;

  maximum_value := (power(10::numeric, requested_width) - 1)::bigint;
  IF current_last_value >= maximum_value THEN
    RAISE EXCEPTION USING
      ERRCODE = '22003',
      MESSAGE = 'sequence_overflow';
  END IF;

  allocated := current_last_value + 1;

  UPDATE identifold_sequences
  SET last_value = allocated
  WHERE namespace = requested_namespace
    AND scope = scope_key;

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
