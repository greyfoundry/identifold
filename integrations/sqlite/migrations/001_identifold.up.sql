PRAGMA foreign_keys = ON;

CREATE TABLE identifold_references (
  reference TEXT COLLATE BINARY PRIMARY KEY,
  namespace TEXT NOT NULL,
  machine_id BLOB NOT NULL CHECK (length(machine_id) = 16),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (namespace GLOB '[a-z]*' AND length(namespace) BETWEEN 1 AND 63),
  CHECK (length(CAST(reference AS BLOB)) BETWEEN 4 AND 100)
) STRICT;

CREATE INDEX identifold_references_machine_id_idx
  ON identifold_references (machine_id);

CREATE TABLE identifold_sequences (
  namespace TEXT NOT NULL,
  scope TEXT NOT NULL,
  reference_prefix TEXT NOT NULL,
  width INTEGER NOT NULL,
  last_value INTEGER NOT NULL,
  PRIMARY KEY (namespace, scope),
  UNIQUE (reference_prefix, scope),
  CHECK (scope = '' OR (length(scope) = 4 AND scope NOT GLOB '*[^0-9]*')),
  CHECK (length(reference_prefix) BETWEEN 2 AND 8 AND reference_prefix NOT GLOB '*[^A-Z]*'),
  CHECK (width BETWEEN 4 AND 18),
  CHECK (last_value >= 0)
) STRICT;

CREATE TABLE identifold_sequence_allocations (
  namespace TEXT NOT NULL,
  scope TEXT NOT NULL,
  sequence INTEGER NOT NULL,
  machine_id BLOB NOT NULL CHECK (length(machine_id) = 16),
  reference_prefix TEXT NOT NULL,
  width INTEGER NOT NULL,
  allocated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (namespace, scope, sequence),
  UNIQUE (reference_prefix, scope, sequence),
  UNIQUE (namespace, scope, machine_id),
  FOREIGN KEY (namespace, scope)
    REFERENCES identifold_sequences (namespace, scope),
  CHECK (sequence >= 0),
  CHECK (width BETWEEN 4 AND 18)
) STRICT;
