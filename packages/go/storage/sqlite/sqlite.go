package sqlite

import (
	"context"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"

	identifold "github.com/greyfoundry/identifold/packages/go"
	"github.com/greyfoundry/identifold/packages/go/storage"
)

var sequentialReference = regexp.MustCompile(`^([A-Z]{2,8})-(?:([0-9]{4})-)?([0-9]{4,18})-[0-9A-Z*~$=U]$`)

// Adapter uses a caller-owned database/sql handle backed by SQLite.
type Adapter struct {
	database *sql.DB
}

func New(database *sql.DB) *Adapter {
	return &Adapter{database: database}
}

func (adapter *Adapter) Reserve(ctx context.Context, request storage.ReferenceReservation) (bool, error) {
	machineID, err := machineIDBytes(request.MachineID)
	if err != nil {
		return false, allocationError("allocation_conflict")
	}
	result, err := adapter.database.ExecContext(ctx,
		`INSERT INTO identifold_references (reference, namespace, machine_id)
		 VALUES (?, ?, ?) ON CONFLICT(reference) DO NOTHING`,
		request.Reference, request.Namespace, machineID,
	)
	if err != nil {
		return false, allocationError("allocation_conflict")
	}
	changes, err := result.RowsAffected()
	if err != nil {
		return false, allocationError("allocation_conflict")
	}
	return changes == 1, nil
}

func (adapter *Adapter) Resolve(ctx context.Context, reference string, namespace string) (*storage.ReferenceMapping, error) {
	var machineID []byte
	var resolvedNamespace string
	err := adapter.database.QueryRowContext(ctx,
		`SELECT machine_id, namespace FROM identifold_references
		 WHERE reference = ? AND namespace = ?`, reference, namespace,
	).Scan(&machineID, &resolvedNamespace)
	if errors.Is(err, sql.ErrNoRows) {
		parts := sequentialReference.FindStringSubmatch(reference)
		if parts == nil {
			return nil, nil
		}
		err = adapter.database.QueryRowContext(ctx,
			`SELECT machine_id, namespace FROM identifold_sequence_allocations
			 WHERE namespace = ? AND reference_prefix = ? AND scope = ? AND sequence = ?`,
			namespace, parts[1], parts[2], parts[3],
		).Scan(&machineID, &resolvedNamespace)
	}
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, allocationError("allocation_conflict")
	}
	value, err := bytesMachineID(machineID)
	if err != nil {
		return nil, allocationError("allocation_conflict")
	}
	return &storage.ReferenceMapping{MachineID: value, Namespace: resolvedNamespace}, nil
}

func (adapter *Adapter) Allocate(ctx context.Context, request storage.SequenceAllocationRequest) (uint64, error) {
	if request.Width < 4 || request.Width > 18 {
		return 0, allocationError("invalid_allocation_policy")
	}
	machineID, err := machineIDBytes(request.MachineID)
	if err != nil {
		return 0, allocationError("allocation_conflict")
	}
	scope := ""
	if request.Scope != nil {
		scope = *request.Scope
	}
	connection, err := adapter.database.Conn(ctx)
	if err != nil {
		return 0, allocationError("allocation_conflict")
	}
	defer connection.Close()
	if _, err = connection.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return 0, allocationError("allocation_conflict")
	}
	committed := false
	defer func() {
		if !committed {
			_, _ = connection.ExecContext(context.Background(), "ROLLBACK")
		}
	}()

	var existing int64
	var existingPrefix string
	var existingWidth uint8
	err = connection.QueryRowContext(ctx,
		`SELECT sequence, reference_prefix, width
		 FROM identifold_sequence_allocations
		 WHERE namespace = ? AND scope = ? AND machine_id = ?`,
		request.Namespace, scope, machineID,
	).Scan(&existing, &existingPrefix, &existingWidth)
	if err == nil {
		if existingPrefix != request.ReferencePrefix || existingWidth != request.Width {
			return 0, allocationError("invalid_allocation_policy")
		}
		if _, err = connection.ExecContext(ctx, "COMMIT"); err != nil {
			return 0, allocationError("allocation_conflict")
		}
		committed = true
		return uint64(existing), nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return 0, allocationError("allocation_conflict")
	}
	_, err = connection.ExecContext(ctx,
		`INSERT INTO identifold_sequences
		 (namespace, scope, reference_prefix, width, last_value)
		 VALUES (?, ?, ?, ?, 0) ON CONFLICT DO NOTHING`,
		request.Namespace, scope, request.ReferencePrefix, request.Width,
	)
	if err != nil {
		return 0, allocationError("allocation_conflict")
	}
	var prefix string
	var width uint8
	var current int64
	err = connection.QueryRowContext(ctx,
		`SELECT reference_prefix, width, last_value FROM identifold_sequences
		 WHERE namespace = ? AND scope = ?`, request.Namespace, scope,
	).Scan(&prefix, &width, &current)
	if err != nil {
		return 0, allocationError("allocation_conflict")
	}
	if prefix != request.ReferencePrefix || width != request.Width {
		return 0, allocationError("invalid_allocation_policy")
	}
	maximum := int64(1)
	for range request.Width {
		maximum *= 10
	}
	maximum--
	if current >= maximum {
		return 0, allocationError("sequence_overflow")
	}
	allocated := current + 1
	_, err = connection.ExecContext(ctx,
		`UPDATE identifold_sequences SET last_value = ?
		 WHERE namespace = ? AND scope = ?`, allocated, request.Namespace, scope,
	)
	if err == nil {
		_, err = connection.ExecContext(ctx,
			`INSERT INTO identifold_sequence_allocations
			 (namespace, scope, sequence, machine_id, reference_prefix, width)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			request.Namespace, scope, allocated, machineID, request.ReferencePrefix, request.Width,
		)
	}
	if err != nil {
		return 0, allocationError("allocation_conflict")
	}
	if _, err = connection.ExecContext(ctx, "COMMIT"); err != nil {
		return 0, allocationError("allocation_conflict")
	}
	committed = true
	return uint64(allocated), nil
}

func machineIDBytes(value string) ([]byte, error) {
	decoded, err := hex.DecodeString(strings.ReplaceAll(value, "-", ""))
	if err != nil || len(decoded) != 16 {
		return nil, errors.New("invalid machine identifier")
	}
	return decoded, nil
}

func bytesMachineID(value []byte) (string, error) {
	if len(value) != 16 {
		return "", errors.New("invalid machine identifier")
	}
	hexValue := hex.EncodeToString(value)
	return fmt.Sprintf("%s-%s-%s-%s-%s", hexValue[:8], hexValue[8:12], hexValue[12:16], hexValue[16:20], hexValue[20:]), nil
}

func allocationError(code string) error {
	return &identifold.Error{Code: code}
}

var _ storage.Adapter = (*Adapter)(nil)
