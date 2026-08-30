CREATE TABLE identifold_references (
  reference varchar(100) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  namespace varchar(63) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  machine_id binary(16) NOT NULL,
  created_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  CONSTRAINT identifold_references_namespace_check
    CHECK (REGEXP_LIKE(namespace, '^[a-z]([a-z_]{0,61}[a-z])?$')),
  CONSTRAINT identifold_references_value_check
    CHECK (octet_length(reference) BETWEEN 4 AND 100),
  INDEX identifold_references_machine_id_idx (machine_id)
) ENGINE = InnoDB;

CREATE TABLE identifold_sequences (
  namespace varchar(63) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  scope varchar(4) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  reference_prefix varchar(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  width tinyint unsigned NOT NULL,
  counter_value bigint unsigned NOT NULL,
  PRIMARY KEY (namespace, scope),
  UNIQUE KEY identifold_sequences_prefix_scope_key (reference_prefix, scope),
  CONSTRAINT identifold_sequences_scope_check
    CHECK (scope = '' OR REGEXP_LIKE(scope, '^[0-9]{4}$')),
  CONSTRAINT identifold_sequences_prefix_check
    CHECK (REGEXP_LIKE(reference_prefix, '^[A-Z]{2,8}$')),
  CONSTRAINT identifold_sequences_width_check CHECK (width BETWEEN 4 AND 18)
) ENGINE = InnoDB;

CREATE TABLE identifold_sequence_allocations (
  namespace varchar(63) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  scope varchar(4) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  sequence bigint unsigned NOT NULL,
  machine_id binary(16) NOT NULL,
  reference_prefix varchar(8) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  width tinyint unsigned NOT NULL,
  allocated_at timestamp(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (namespace, scope, sequence),
  UNIQUE KEY identifold_allocations_prefix_scope_sequence_key
    (reference_prefix, scope, sequence),
  UNIQUE KEY identifold_allocations_namespace_scope_mid_key
    (namespace, scope, machine_id),
  CONSTRAINT identifold_allocations_sequence_state_fk
    FOREIGN KEY (namespace, scope)
    REFERENCES identifold_sequences (namespace, scope),
  CONSTRAINT identifold_allocations_width_check CHECK (width BETWEEN 4 AND 18)
) ENGINE = InnoDB;

DELIMITER $$

CREATE PROCEDURE identifold_reserve_reference(
  IN requested_machine_id binary(16),
  IN requested_namespace varchar(63),
  IN requested_reference varchar(100)
)
BEGIN
  DECLARE reserved boolean DEFAULT TRUE;
  DECLARE CONTINUE HANDLER FOR 1062 SET reserved = FALSE;

  INSERT INTO identifold_references (reference, namespace, machine_id)
  VALUES (requested_reference, requested_namespace, requested_machine_id);

  SELECT reserved AS reserved;
END$$

CREATE PROCEDURE identifold_allocate_sequence(
  IN requested_machine_id binary(16),
  IN requested_namespace varchar(63),
  IN requested_reference_prefix varchar(8),
  IN requested_scope varchar(4),
  IN requested_width tinyint unsigned
)
main: BEGIN
  DECLARE allocated bigint unsigned;
  DECLARE current_prefix varchar(8);
  DECLARE current_width tinyint unsigned;
  DECLARE current_value bigint unsigned;
  DECLARE existing_sequence bigint unsigned;
  DECLARE found_row boolean DEFAULT TRUE;
  DECLARE scope_key varchar(4) DEFAULT COALESCE(requested_scope, '');
  DECLARE maximum_value decimal(20, 0);
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET found_row = FALSE;
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF requested_width < 4 OR requested_width > 18 THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'invalid_sequence_width';
  END IF;

  START TRANSACTION;

  SET found_row = TRUE;
  SELECT sequence, reference_prefix, width
    INTO existing_sequence, current_prefix, current_width
  FROM identifold_sequence_allocations
  WHERE namespace = requested_namespace
    AND scope = scope_key
    AND machine_id = requested_machine_id
  FOR UPDATE;

  IF found_row THEN
    IF current_prefix <> requested_reference_prefix
      OR current_width <> requested_width THEN
      SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'sequence_replay_policy_mismatch';
    END IF;
    COMMIT;
    SELECT existing_sequence AS sequence;
    LEAVE main;
  END IF;

  INSERT INTO identifold_sequences (
    namespace, scope, reference_prefix, width, counter_value
  ) VALUES (
    requested_namespace, scope_key, requested_reference_prefix, requested_width, 0
  ) ON DUPLICATE KEY UPDATE namespace = VALUES(namespace);

  SET found_row = TRUE;
  SELECT reference_prefix, width, counter_value
    INTO current_prefix, current_width, current_value
  FROM identifold_sequences
  WHERE namespace = requested_namespace AND scope = scope_key
  FOR UPDATE;

  IF NOT found_row
    OR current_prefix <> requested_reference_prefix
    OR current_width <> requested_width THEN
    SIGNAL SQLSTATE '22023' SET MESSAGE_TEXT = 'sequence_definition_mismatch';
  END IF;

  SET maximum_value = POW(10, requested_width) - 1;
  IF current_value >= maximum_value THEN
    SIGNAL SQLSTATE '22003' SET MESSAGE_TEXT = 'sequence_overflow';
  END IF;

  SET allocated = current_value + 1;
  UPDATE identifold_sequences
  SET counter_value = allocated
  WHERE namespace = requested_namespace AND scope = scope_key;

  INSERT INTO identifold_sequence_allocations (
    namespace, scope, sequence, machine_id, reference_prefix, width
  ) VALUES (
    requested_namespace,
    scope_key,
    allocated,
    requested_machine_id,
    requested_reference_prefix,
    requested_width
  );

  COMMIT;
  SELECT allocated AS sequence;
END$$

DELIMITER ;
