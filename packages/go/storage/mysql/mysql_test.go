package mysql

import (
	"context"
	"database/sql"
	"os"
	"testing"

	_ "github.com/go-sql-driver/mysql"
	"github.com/greyfoundry/identifold/packages/go/storage"
)

func TestMySQLAdapterReservesAllocatesAndResolves(t *testing.T) {
	databaseURL := os.Getenv("IDENTIFOLD_TEST_MYSQL_URL")
	if databaseURL == "" {
		t.Skip("IDENTIFOLD_TEST_MYSQL_URL is not configured")
	}
	database, err := sql.Open("mysql", databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	for _, table := range []string{
		"identifold_sequence_allocations",
		"identifold_sequences",
		"identifold_references",
	} {
		if _, err := database.Exec("DELETE FROM " + table); err != nil {
			t.Fatal(err)
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
