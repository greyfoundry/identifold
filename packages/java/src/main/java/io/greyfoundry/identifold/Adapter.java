package io.greyfoundry.identifold;

import java.util.ArrayList;
import java.util.Arrays;

public final class Adapter {
    private Adapter() {}

    public static void main(String[] args) {
        try {
            var operation = args[0];
            var registry = Identifold.parseRegistry(args.length > 4 ? args[4] : "");
            String value;
            switch (operation) {
                case "parseMachineId" -> value = Identifold.parseMachineId(args[1]);
                case "publicIdFromMachineId" -> value = Identifold.publicIdFromMachineId(args[1], args[2]);
                case "parsePublicId" -> {
                    var parsed = Identifold.parsePublicId(args[1]);
                    value = parsed.value() + "\t" + parsed.namespace() + "\t" + parsed.machineId();
                }
                case "createReferenceCandidate" -> {
                    var bytes = new ArrayList<Integer>();
                    if (!args[3].isEmpty()) {
                        Arrays.stream(args[3].split(",")).map(Integer::parseInt).forEach(bytes::add);
                    }
                    value = Identifold.createReferenceCandidate(registry, args[2], bytes);
                }
                case "formatSequentialReference" -> value = Identifold.formatSequentialReference(
                        registry, args[2], args[3], args.length > 5 ? args[5] : "");
                case "normalize", "parseReference", "inspect" -> value = Identifold.normalize(args[1], registry);
                default -> throw new IllegalArgumentException("unsupported operation");
            }
            System.out.print("OK\t" + value);
        } catch (Identifold.IdentifoldException exception) {
            System.out.print("ERR\t" + exception.code());
        }
    }
}
