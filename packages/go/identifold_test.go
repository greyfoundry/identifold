package identifold

import "testing"

func TestPublicIDRoundTrip(t *testing.T) {
	mid := "019d4c72-c910-7a84-b313-53c3ac61a32f"
	pid, err := PublicIDFromMachineID(mid, "order")
	if err != nil {
		t.Fatal(err)
	}
	if pid != "order_01kn675j8gfa2b64tkrep638sf" {
		t.Fatalf("unexpected PID: %s", pid)
	}
	parsed, err := ParsePublicID(pid)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.MachineID != mid || parsed.Namespace != "order" {
		t.Fatalf("unexpected parse result: %#v", parsed)
	}
}

func TestReferenceAlgorithms(t *testing.T) {
	if got := CheckSymbol("0123456789", false); got != "P" {
		t.Fatalf("unexpected random check symbol: %s", got)
	}
	if got := CheckSymbol("2026001842", true); got != "M" {
		t.Fatalf("unexpected sequential check symbol: %s", got)
	}
}
