package postgres

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"github.com/greyfoundry/identifold/packages/go/storage"
	_ "github.com/jackc/pgx/v5/stdlib"
)

func TestPostgresAdapterReservesAllocatesAndResolves(t *testing.T) {
	databaseURL := os.Getenv("IDENTIFOLD_TEST_DATABASE_URL")
	if databaseURL == "" {
		t.Skip("IDENTIFOLD_TEST_DATABASE_URL is not configured")
	}
	database, err := sql.Open("pgx", databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	root := filepath.Join("..", "..", "..", "..")
	for _, migration := range []string{
		"001_identifold.down.sql",
		"001_identifold.up.sql",
		"003_idempotent_replay.up.sql",
		"004_reference_lookup.up.sql",
	} {
		script, readErr := os.ReadFile(filepath.Join(root, "integrations", "postgres", "migrations", migration))
		if readErr != nil {
			t.Fatal(readErr)
		}
		if _, execErr := database.Exec(string(script)); execErr != nil {
			t.Fatal(execErr)
		}
	}

	adapter := New(database)
	ctx := context.Background()
	randomMID := "01890f8c-7b2a-7cc3-98b0-112233445566"
	randomREF := "ORD-0123-4567-89-P"
	reserved, err := adapter.Reserve(ctx, storage.ReferenceReservation{
		MachineID: randomMID, Namespace: "order", Reference: randomREF,
	})
	if err != nil || !reserved {
		t.Fatalf("reserve failed: reserved=%v err=%v", reserved, err)
	}
	mapping, err := adapter.Resolve(ctx, randomREF, "order")
	if err != nil || mapping == nil || mapping.MachineID != randomMID || mapping.Namespace != "order" {
		t.Fatalf("resolve failed: mapping=%#v err=%v", mapping, err)
	}

	request := storage.SequenceAllocationRequest{
		MachineID:       "01890f8c-7b2a-7cc3-98b0-112233445567",
		Namespace:       "receipt",
		ReferencePrefix: "RCT",
		Width:           4,
	}
	first, err := adapter.Allocate(ctx, request)
	if err != nil || first != 1 {
		t.Fatalf("allocate failed: sequence=%d err=%v", first, err)
	}
	replay, err := adapter.Allocate(ctx, request)
	if err != nil || replay != first {
		t.Fatalf("replay failed: sequence=%d err=%v", replay, err)
	}
	mapping, err = adapter.Resolve(ctx, "RCT-0001-1", "receipt")
	if err != nil || mapping == nil || mapping.MachineID != request.MachineID {
		t.Fatalf("sequential resolve failed: mapping=%#v err=%v", mapping, err)
	}
}
