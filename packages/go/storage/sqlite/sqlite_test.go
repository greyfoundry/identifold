package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"strings"
	"testing"

	identifold "github.com/greyfoundry/identifold/packages/go"
	"github.com/greyfoundry/identifold/packages/go/storage"
	_ "modernc.org/sqlite"
)

func TestAdapterContract(t *testing.T) {
	database, err := sql.Open("sqlite", "file::memory:?cache=shared")
	if err != nil {
		t.Fatal(err)
	}
	database.SetMaxOpenConns(1)
	defer database.Close()
	migration, err := os.ReadFile("../../../../integrations/sqlite/migrations/001_identifold.up.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = database.Exec(string(migration)); err != nil {
		t.Fatal(err)
	}

	adapter := New(database)
	ctx := context.Background()
	randomMID := "01890f8c-7b2a-7cc3-98b0-112233445566"
	randomREF := "ORD-0123-4567-89-P"
	reserved, err := adapter.Reserve(ctx, storage.ReferenceReservation{
		MachineID: randomMID, Namespace: "order", Reference: randomREF,
	})
	if err != nil || !reserved {
		t.Fatalf("reserve: %v %v", reserved, err)
	}
	reserved, err = adapter.Reserve(ctx, storage.ReferenceReservation{
		MachineID: "01890f8c-7b2a-7cc3-98b0-112233445569",
		Namespace: "order", Reference: randomREF,
	})
	if err != nil || reserved {
		t.Fatalf("duplicate reserve: %v %v", reserved, err)
	}
	mapping, err := adapter.Resolve(ctx, randomREF, "order")
	if err != nil || mapping == nil || mapping.MachineID != randomMID {
		t.Fatalf("random resolve: %#v %v", mapping, err)
	}
	var stored string
	if err = database.QueryRow("SELECT hex(machine_id) FROM identifold_references").Scan(&stored); err != nil {
		t.Fatal(err)
	}
	if stored != strings.ToUpper(strings.ReplaceAll(randomMID, "-", "")) {
		t.Fatalf("stored UUID bytes changed: %s", stored)
	}

	request := storage.SequenceAllocationRequest{
		MachineID: "01890f8c-7b2a-7cc3-98b0-112233445567",
		Namespace: "receipt", ReferencePrefix: "RCT", Width: 4,
	}
	first, err := adapter.Allocate(ctx, request)
	if err != nil || first != 1 {
		t.Fatalf("first allocation: %d %v", first, err)
	}
	replayed, err := adapter.Allocate(ctx, request)
	if err != nil || replayed != first {
		t.Fatalf("replay: %d %v", replayed, err)
	}
	mapping, err = adapter.Resolve(ctx, "RCT-0001-1", "receipt")
	if err != nil || mapping == nil || mapping.MachineID != request.MachineID {
		t.Fatalf("sequence resolve: %#v %v", mapping, err)
	}

	_, err = adapter.Allocate(ctx, storage.SequenceAllocationRequest{
		MachineID: request.MachineID, Namespace: "receipt",
		ReferencePrefix: "RCT", Width: 5,
	})
	var typed *identifold.Error
	if !errors.As(err, &typed) || typed.Code != "invalid_allocation_policy" {
		t.Fatalf("policy error: %v", err)
	}
}
