package main

import (
	"encoding/json"
	"errors"
	"os"

	identifold "github.com/greyfoundry/identifold/packages/go"
)

type request struct {
	Operation   string                           `json:"operation"`
	Input       string                           `json:"input"`
	MachineID   string                           `json:"machineId"`
	Namespace   string                           `json:"namespace"`
	RandomBytes []int                            `json:"randomBytes"`
	Sequence    string                           `json:"sequence"`
	Scope       string                           `json:"scope"`
	Registry    []identifold.NamespaceDefinition `json:"registry"`
}

type response struct {
	OK        bool   `json:"ok"`
	Value     any    `json:"value,omitempty"`
	ErrorCode string `json:"errorCode,omitempty"`
}

func main() {
	var input request
	if json.NewDecoder(os.Stdin).Decode(&input) != nil {
		os.Exit(2)
	}
	registry := identifold.Registry(input.Registry)
	var value any
	var err error
	switch input.Operation {
	case "parseMachineId":
		value, err = identifold.ParseMachineID(input.Input)
	case "publicIdFromMachineId":
		value, err = identifold.PublicIDFromMachineID(input.MachineID, input.Namespace)
	case "parsePublicId":
		value, err = identifold.ParsePublicID(input.Input)
	case "createReferenceCandidate":
		value, err = identifold.CreateReferenceCandidate(registry, input.Namespace, input.RandomBytes)
	case "formatSequentialReference":
		value, err = identifold.FormatSequentialReference(registry, input.Namespace, input.Sequence, input.Scope)
	case "normalize", "parseReference", "inspect":
		value, err = identifold.Normalize(input.Input, registry)
	default:
		os.Exit(2)
	}
	output := response{OK: err == nil, Value: value}
	if err != nil {
		var typed *identifold.Error
		if !errors.As(err, &typed) {
			os.Exit(2)
		}
		output.ErrorCode = typed.Code
		output.Value = nil
	}
	if json.NewEncoder(os.Stdout).Encode(output) != nil {
		os.Exit(2)
	}
}
