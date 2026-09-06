package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"
	"sync"
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

	reservationResults := make(chan bool, 20)
	var reservations sync.WaitGroup
	for index := range 20 {
		reservations.Add(1)
		go func() {
			defer reservations.Done()
			reserved, reserveErr := adapter.Reserve(ctx, storage.ReferenceReservation{
				MachineID: fmt.Sprintf("01890f8c-7b2a-7cc3-98b1-%012x", index),
				Namespace: "order", Reference: "ORD-CONCURRENT-X",
			})
			if reserveErr != nil {
				t.Errorf("concurrent reserve: %v", reserveErr)
			}
			reservationResults <- reserved
		}()
	}
	reservations.Wait()
	close(reservationResults)
	winners := 0
	for reserved := range reservationResults {
		if reserved {
			winners++
		}
	}
	if winners != 1 {
		t.Fatalf("reservation winners: %d", winners)
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

	sequences := make(chan uint64, 32)
	var allocations sync.WaitGroup
	for index := range 32 {
		allocations.Add(1)
		go func() {
			defer allocations.Done()
			value, allocateErr := adapter.Allocate(ctx, storage.SequenceAllocationRequest{
				MachineID: fmt.Sprintf("01890f8c-7b2a-7cc3-98b2-%012x", index),
				Namespace: "invoice", ReferencePrefix: "INV", Width: 4,
			})
			if allocateErr != nil {
				t.Errorf("concurrent allocate: %v", allocateErr)
			}
			sequences <- value
		}()
	}
	allocations.Wait()
	close(sequences)
	allocated := make([]int, 0, 32)
	for value := range sequences {
		allocated = append(allocated, int(value))
	}
	sort.Ints(allocated)
	for index, value := range allocated {
		if value != index+1 {
			t.Fatalf("allocated values: %v", allocated)
		}
	}

	if _, err = database.Exec(
		"INSERT INTO identifold_sequences VALUES ('overflow', '', 'OVR', 4, 9999)",
	); err != nil {
		t.Fatal(err)
	}
	_, err = adapter.Allocate(ctx, storage.SequenceAllocationRequest{
		MachineID: "01890f8c-7b2a-7cc3-98b3-112233445568",
		Namespace: "overflow", ReferencePrefix: "OVR", Width: 4,
	})
	if !errors.As(err, &typed) || typed.Code != "sequence_overflow" {
		t.Fatalf("overflow error: %v", err)
	}
	var counter int
	if err = database.QueryRow(
		"SELECT last_value FROM identifold_sequences WHERE namespace = 'overflow'",
	).Scan(&counter); err != nil || counter != 9999 {
		t.Fatalf("overflow changed counter: %d %v", counter, err)
	}

	if _, err = database.Exec(`
		CREATE TRIGGER identifold_test_reject_allocation
		BEFORE INSERT ON identifold_sequence_allocations
		WHEN NEW.namespace = 'failure'
		BEGIN SELECT RAISE(ABORT, 'injected_failure'); END
	`); err != nil {
		t.Fatal(err)
	}
	_, err = adapter.Allocate(ctx, storage.SequenceAllocationRequest{
		MachineID: "01890f8c-7b2a-7cc3-98b4-112233445568",
		Namespace: "failure", ReferencePrefix: "FLR", Width: 4,
	})
	if !errors.As(err, &typed) || typed.Code != "allocation_conflict" {
		t.Fatalf("rollback error: %v", err)
	}
	if err = database.QueryRow(
		"SELECT count(*) FROM identifold_sequences WHERE namespace = 'failure'",
	).Scan(&counter); err != nil || counter != 0 {
		t.Fatalf("failed allocation was not rolled back: %d %v", counter, err)
	}
}
