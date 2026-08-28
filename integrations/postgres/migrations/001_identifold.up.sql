BEGIN;

CREATE TABLE identifold_references (
  reference text COLLATE "C" PRIMARY KEY,
  namespace text NOT NULL,
  machine_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  CONSTRAINT identifold_references_namespace_check
    CHECK (namespace ~ '^[a-z]([a-z_]{0,61}[a-z])?$'),
  CONSTRAINT identifold_references_value_check
    CHECK (octet_length(reference) BETWEEN 4 AND 100)
);

CREATE INDEX identifold_references_machine_id_idx
  ON identifold_references (machine_id);

CREATE TABLE identifold_sequences (
  namespace text NOT NULL,
  scope text NOT NULL,
  reference_prefix text NOT NULL,
  width smallint NOT NULL,
  last_value bigint NOT NULL,
  PRIMARY KEY (namespace, scope),
  UNIQUE (reference_prefix, scope),
  CONSTRAINT identifold_sequences_scope_check
    CHECK (scope = '' OR scope ~ '^[0-9]{4}$'),
  CONSTRAINT identifold_sequences_prefix_check
    CHECK (reference_prefix ~ '^[A-Z]{2,8}$'),
  CONSTRAINT identifold_sequences_width_check
    CHECK (width BETWEEN 4 AND 18),
  CONSTRAINT identifold_sequences_value_check
    CHECK (
      last_value >= 0
      AND last_value < power(10::numeric, width)
    )
);

CREATE TABLE identifold_sequence_allocations (
  namespace text NOT NULL,
  scope text NOT NULL,
  sequence bigint NOT NULL,
  machine_id uuid NOT NULL,
  reference_prefix text NOT NULL,
  width smallint NOT NULL,
  allocated_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (namespace, scope, sequence),
  UNIQUE (reference_prefix, scope, sequence),
  UNIQUE (namespace, scope, machine_id),
  CONSTRAINT identifold_sequence_allocations_scope_check
    CHECK (scope = '' OR scope ~ '^[0-9]{4}$'),
  CONSTRAINT identifold_sequence_allocations_sequence_check
    CHECK (sequence >= 0),
  CONSTRAINT identifold_sequence_allocations_prefix_check
    CHECK (reference_prefix ~ '^[A-Z]{2,8}$'),
  CONSTRAINT identifold_sequence_allocations_width_check
    CHECK (width BETWEEN 4 AND 18)
);

CREATE OR REPLACE FUNCTION identifold_reserve_reference(
  requested_machine_id uuid,
  requested_namespace text,
  requested_reference text
) RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO identifold_references (reference, namespace, machine_id)
  VALUES (requested_reference, requested_namespace, requested_machine_id)
  ON CONFLICT (reference) DO NOTHING;

  RETURN FOUND;
END;
$$;

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
