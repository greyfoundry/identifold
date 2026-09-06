package mysql

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

	_ "github.com/go-sql-driver/mysql"
	identifold "github.com/greyfoundry/identifold/packages/go"
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
	var stored string
	if err = database.QueryRow(
		"SELECT HEX(machine_id) FROM identifold_references WHERE reference = ?", randomREF,
	).Scan(&stored); err != nil || stored != strings.ToUpper(strings.ReplaceAll(randomMID, "-", "")) {
		t.Fatalf("stored UUID bytes changed: %s %v", stored, err)
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

	_, err = adapter.Allocate(ctx, storage.SequenceAllocationRequest{
		MachineID: request.MachineID, Namespace: "receipt",
		ReferencePrefix: "RCT", Width: 5,
	})
	var typed *identifold.Error
	if !errors.As(err, &typed) || typed.Code != "invalid_allocation_policy" {
		t.Fatalf("policy error: %v", err)
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
	var counter uint64
	if err = database.QueryRow(
		"SELECT counter_value FROM identifold_sequences WHERE namespace = 'overflow'",
	).Scan(&counter); err != nil || counter != 9999 {
		t.Fatalf("overflow changed counter: %d %v", counter, err)
	}
}
