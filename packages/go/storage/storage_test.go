package storage

import (
	"context"
	"testing"
)

type fakeStorage struct{}

func (fakeStorage) Reserve(context.Context, ReferenceReservation) (bool, error) {
	return true, nil
}

func (fakeStorage) Resolve(_ context.Context, _ string, namespace string) (*ReferenceMapping, error) {
	return &ReferenceMapping{MachineID: "01890f8c-7b2a-7cc3-98b0-112233445566", Namespace: namespace}, nil
}

func (fakeStorage) Allocate(context.Context, SequenceAllocationRequest) (uint64, error) {
	return 1, nil
}

func TestAdapterExposesAllStorageOperations(t *testing.T) {
	var adapter Adapter = fakeStorage{}
	reservation := ReferenceReservation{
		MachineID: "01890f8c-7b2a-7cc3-98b0-112233445566",
		Namespace: "order",
		Reference: "ORD-0123-4567-89-P",
	}
	reserved, err := adapter.Reserve(context.Background(), reservation)
	if err != nil || !reserved {
		t.Fatalf("reserve failed: reserved=%v err=%v", reserved, err)
	}
	mapping, err := adapter.Resolve(context.Background(), reservation.Reference, reservation.Namespace)
	if err != nil || mapping == nil || mapping.MachineID != reservation.MachineID {
		t.Fatalf("resolve failed: mapping=%#v err=%v", mapping, err)
	}
	sequence, err := adapter.Allocate(context.Background(), SequenceAllocationRequest{
		MachineID: reservation.MachineID, Namespace: "receipt", ReferencePrefix: "RCT", Width: 4,
	})
	if err != nil || sequence != 1 {
		t.Fatalf("allocate failed: sequence=%d err=%v", sequence, err)
	}
}
