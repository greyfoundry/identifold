package postgres

import (
	"context"
	"database/sql"
	"errors"

	identifold "github.com/greyfoundry/identifold/packages/go"
	"github.com/greyfoundry/identifold/packages/go/storage"
)

type queryer interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

// Adapter uses a caller-owned database/sql handle backed by PostgreSQL.
type Adapter struct {
	database queryer
}

func New(database queryer) *Adapter {
	return &Adapter{database: database}
}

func (adapter *Adapter) Reserve(ctx context.Context, request storage.ReferenceReservation) (bool, error) {
	var reserved bool
	err := adapter.database.QueryRowContext(
		ctx,
		"SELECT identifold_reserve_reference($1::uuid, $2::text, $3::text)",
		request.MachineID,
		request.Namespace,
		request.Reference,
	).Scan(&reserved)
	if err != nil {
		return false, mapError(err)
	}
	return reserved, nil
}

func (adapter *Adapter) Resolve(ctx context.Context, reference string, namespace string) (*storage.ReferenceMapping, error) {
	var mapping storage.ReferenceMapping
	err := adapter.database.QueryRowContext(
		ctx,
		"SELECT resolved_machine_id::text, resolved_namespace FROM identifold_resolve_reference($1::text, $2::text)",
		reference,
		namespace,
	).Scan(&mapping.MachineID, &mapping.Namespace)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, mapError(err)
	}
	return &mapping, nil
}

func (adapter *Adapter) Allocate(ctx context.Context, request storage.SequenceAllocationRequest) (uint64, error) {
	var sequence int64
	err := adapter.database.QueryRowContext(
		ctx,
		"SELECT identifold_allocate_sequence($1::uuid, $2::text, $3::text, $4::text, $5::smallint)",
		request.MachineID,
		request.Namespace,
		request.ReferencePrefix,
		request.Scope,
		request.Width,
	).Scan(&sequence)
	if err != nil {
		return 0, mapError(err)
	}
	if sequence < 0 {
		return 0, &identifold.Error{Code: "allocation_conflict"}
	}
	return uint64(sequence), nil
}

func mapError(err error) error {
	type sqlStateError interface {
		SQLState() string
	}
	var databaseError sqlStateError
	if errors.As(err, &databaseError) {
		switch databaseError.SQLState() {
		case "22003":
			return &identifold.Error{Code: "sequence_overflow"}
		case "22023":
			return &identifold.Error{Code: "invalid_allocation_policy"}
		}
	}
	return &identifold.Error{Code: "allocation_conflict"}
}

var _ storage.Adapter = (*Adapter)(nil)
