package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/greyfoundry/identifold/packages/go"
)

func main() {
	const mid = "019d4c72-c910-7a84-b313-53c3ac61a32f"
	pid, err := identifold.PublicIDFromMachineID(mid, "order")
	if err != nil {
		panic(err)
	}
	parsed, err := identifold.ParsePublicID(pid)
	if err != nil {
		panic(err)
	}
	roundTrip := parsed.MachineID == mid
	if !roundTrip {
		panic("MID/PID round trip failed")
	}

	result := struct {
		MID       string `json:"mid"`
		Namespace string `json:"namespace"`
		PID       string `json:"pid"`
		RoundTrip bool   `json:"roundTrip"`
	}{mid, parsed.Namespace, pid, roundTrip}
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(result); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
