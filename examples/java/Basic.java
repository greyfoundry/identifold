import io.greyfoundry.identifold.Identifold;

public final class Basic {
    private Basic() {}

    public static void main(String[] args) {
        var mid = "019d4c72-c910-7a84-b313-53c3ac61a32f";
        var pid = Identifold.publicIdFromMachineId(mid, "order");
        var parsed = Identifold.parsePublicId(pid);
        var roundTrip = parsed.machineId().equals(mid);
        if (!roundTrip) {
            throw new IllegalStateException("MID/PID round trip failed.");
        }
        System.out.printf(
                "{\n  \"mid\": \"%s\",\n  \"namespace\": \"%s\",\n  \"pid\": \"%s\",\n  \"roundTrip\": true\n}%n",
                mid, parsed.namespace(), pid);
    }
}
