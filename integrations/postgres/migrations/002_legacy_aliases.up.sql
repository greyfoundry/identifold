BEGIN;

CREATE TABLE identifold_legacy_aliases (
  namespace text NOT NULL,
  legacy_kind text NOT NULL,
  legacy_value text COLLATE "C" NOT NULL,
  machine_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  PRIMARY KEY (namespace, legacy_kind, legacy_value),
  CONSTRAINT identifold_legacy_aliases_kind_check
    CHECK (legacy_kind IN ('uuidv4', 'integer', 'ulid', 'nanoid', 'short-code')),
  CONSTRAINT identifold_legacy_aliases_value_check
    CHECK (octet_length(legacy_value) BETWEEN 1 AND 100)
);

CREATE INDEX identifold_legacy_aliases_machine_id_idx
  ON identifold_legacy_aliases (machine_id);

COMMIT;
