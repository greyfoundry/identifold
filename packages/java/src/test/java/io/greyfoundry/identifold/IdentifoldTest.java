package io.greyfoundry.identifold;

public final class IdentifoldTest {
    public static void main(String[] args) {
        var mid = "019d4c72-c910-7a84-b313-53c3ac61a32f";
        var pid = Identifold.publicIdFromMachineId(mid, "order");
        if (!pid.equals("order_01kn675j8gfa2b64tkrep638sf")) {
            throw new AssertionError(pid);
        }
        var parsed = Identifold.parsePublicId(pid);
        if (!parsed.machineId().equals(mid) || !parsed.namespace().equals("order")) {
            throw new AssertionError(parsed);
        }
        if (Identifold.checkSymbol("0123456789", false) != 'P') {
            throw new AssertionError("random checksum");
        }
        if (Identifold.checkSymbol("2026001842", true) != 'M') {
            throw new AssertionError("sequential checksum");
        }
    }
}
