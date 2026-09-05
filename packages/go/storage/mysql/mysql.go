package mysql

import (
	"context"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	mysqlDriver "github.com/go-sql-driver/mysql"
	identifold "github.com/greyfoundry/identifold/packages/go"
	"github.com/greyfoundry/identifold/packages/go/storage"
)

type queryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

// Adapter uses a caller-owned database/sql handle backed by MySQL or MariaDB.
type Adapter struct {
	database queryer
}

func New(database queryer) *Adapter {
	return &Adapter{database: database}
}

func (adapter *Adapter) Reserve(ctx context.Context, request storage.ReferenceReservation) (bool, error) {
	machineID, err := machineIDBytes(request.MachineID)
	if err != nil {
		return false, err
	}
	rows, err := adapter.database.QueryContext(
		ctx,
		"CALL identifold_reserve_reference(?, ?, ?)",
		machineID,
		request.Namespace,
		request.Reference,
	)
	if err != nil {
		return false, mapError(err)
	}
	defer rows.Close()
	if !rows.Next() {
		return false, conflict()
	}
	var reserved bool
	if err := rows.Scan(&reserved); err != nil || rows.Next() {
		return false, conflict()
	}
	return reserved, nil
}

func (adapter *Adapter) Resolve(ctx context.Context, reference string, namespace string) (*storage.ReferenceMapping, error) {
	mapping, err := adapter.lookup(
		ctx,
		"SELECT machine_id, namespace FROM identifold_references WHERE reference = ? AND namespace = ?",
		reference,
		namespace,
	)
	if err != nil || mapping != nil {
		return mapping, err
	}
	prefix, scope, sequence, ok := parseSequentialReference(reference)
	if !ok {
		return nil, nil
	}
	return adapter.lookup(
		ctx,
		"SELECT machine_id, namespace FROM identifold_sequence_allocations WHERE namespace = ? AND reference_prefix = ? AND scope = ? AND sequence = ?",
		namespace,
		prefix,
		scope,
		sequence,
	)
}

func (adapter *Adapter) Allocate(ctx context.Context, request storage.SequenceAllocationRequest) (uint64, error) {
	machineID, err := machineIDBytes(request.MachineID)
	if err != nil {
		return 0, err
	}
	for attempt := 0; attempt < 5; attempt++ {
		rows, queryErr := adapter.database.QueryContext(
			ctx,
			"CALL identifold_allocate_sequence(?, ?, ?, ?, ?)",
			machineID,
			request.Namespace,
			request.ReferencePrefix,
			request.Scope,
			request.Width,
		)
		if queryErr == nil {
			sequence, scanErr := scanSequence(rows)
			if scanErr == nil {
				return sequence, nil
			}
			queryErr = scanErr
		}
		if attempt == 4 || !isTransient(queryErr) {
			return 0, mapError(queryErr)
		}
		select {
		case <-ctx.Done():
			return 0, conflict()
		case <-time.After(time.Duration(1<<attempt) * time.Millisecond):
		}
	}
	return 0, conflict()
}

func (adapter *Adapter) lookup(ctx context.Context, query string, arguments ...any) (*storage.ReferenceMapping, error) {
	var machineID []byte
	var namespace string
	err := adapter.database.QueryRowContext(ctx, query, arguments...).Scan(&machineID, &namespace)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, mapError(err)
	}
	value, err := machineIDString(machineID)
	if err != nil {
		return nil, err
	}
	return &storage.ReferenceMapping{MachineID: value, Namespace: namespace}, nil
}

func scanSequence(rows *sql.Rows) (uint64, error) {
	defer rows.Close()
	if !rows.Next() {
		return 0, conflict()
	}
	var sequence uint64
	if err := rows.Scan(&sequence); err != nil || rows.Next() {
		return 0, conflict()
	}
	return sequence, nil
}

func machineIDBytes(value string) ([]byte, error) {
	hexadecimal := strings.ReplaceAll(value, "-", "")
	if len(hexadecimal) != 32 {
		return nil, conflict()
	}
	result, err := hex.DecodeString(hexadecimal)
	if err != nil {
		return nil, conflict()
	}
	return result, nil
}

func machineIDString(value []byte) (string, error) {
	if len(value) != 16 {
		return "", conflict()
	}
	hexadecimal := hex.EncodeToString(value)
	return fmt.Sprintf(
		"%s-%s-%s-%s-%s",
		hexadecimal[0:8],
		hexadecimal[8:12],
		hexadecimal[12:16],
		hexadecimal[16:20],
		hexadecimal[20:32],
	), nil
}

func parseSequentialReference(reference string) (string, string, string, bool) {
	parts := strings.Split(reference, "-")
	var prefix, scope, sequence, check string
	switch len(parts) {
	case 3:
		prefix, sequence, check = parts[0], parts[1], parts[2]
	case 4:
		prefix, scope, sequence, check = parts[0], parts[1], parts[2], parts[3]
	default:
		return "", "", "", false
	}
	if len(prefix) < 2 || len(prefix) > 8 || !asciiRange(prefix, 'A', 'Z') ||
		(scope != "" && (len(scope) != 4 || !asciiRange(scope, '0', '9'))) ||
		len(sequence) < 4 || len(sequence) > 18 || !asciiRange(sequence, '0', '9') ||
		len(check) != 1 {
		return "", "", "", false
	}
	return prefix, scope, sequence, true
}

func asciiRange(value string, minimum byte, maximum byte) bool {
	for index := range len(value) {
		if value[index] < minimum || value[index] > maximum {
			return false
		}
	}
	return true
}

func mapError(err error) error {
	var databaseError *mysqlDriver.MySQLError
	if errors.As(err, &databaseError) {
		switch string(databaseError.SQLState[:]) {
		case "22003":
			return &identifold.Error{Code: "sequence_overflow"}
		case "22023":
			return &identifold.Error{Code: "invalid_allocation_policy"}
		}
	}
	return conflict()
}

func isTransient(err error) bool {
	var databaseError *mysqlDriver.MySQLError
	return errors.As(err, &databaseError) &&
		(databaseError.Number == 1205 || databaseError.Number == 1213 ||
			string(databaseError.SQLState[:]) == "40001")
}

func conflict() error {
	return &identifold.Error{Code: "allocation_conflict"}
}

var _ storage.Adapter = (*Adapter)(nil)
