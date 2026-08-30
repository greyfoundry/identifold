package storage

import "context"

type ReferenceReservation struct {
	MachineID string
	Namespace string
	Reference string
}

type ReferenceMapping struct {
	MachineID string
	Namespace string
}

type SequenceAllocationRequest struct {
	MachineID       string
	Namespace       string
	ReferencePrefix string
	Scope           *string
	Width           uint8
}

type Adapter interface {
	Reserve(context.Context, ReferenceReservation) (bool, error)
	Resolve(context.Context, string, string) (*ReferenceMapping, error)
	Allocate(context.Context, SequenceAllocationRequest) (uint64, error)
}
