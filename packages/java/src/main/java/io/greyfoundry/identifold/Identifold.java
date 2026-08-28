package io.greyfoundry.identifold;

import java.math.BigInteger;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

public final class Identifold {
    private static final String DATA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    private static final String CHECK = DATA + "*~$=U";
    private static final String TYPE_ID = "0123456789abcdefghjkmnpqrstvwxyz";
    private static final Pattern MACHINE = Pattern.compile("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");
    private static final Pattern PUBLIC_PREFIX = Pattern.compile("^[a-z](?:[a-z_]{0,61}[a-z])?$");

    private Identifold() {}

    public static final class IdentifoldException extends IllegalArgumentException {
        private final String code;

        public IdentifoldException(String code) {
            super(code);
            this.code = code;
        }

        public String code() {
            return code;
        }
    }

    public record ParsedPublicId(String value, String namespace, String machineId) {}

    public record ReferenceDefinition(String prefix, String profile, String strategy, String scope, int width) {}

    public record NamespaceDefinition(String publicPrefix, ReferenceDefinition reference) {}

    public static String parseMachineId(String input) {
        var value = input == null ? "" : input.toLowerCase(Locale.ROOT);
        if (!MACHINE.matcher(value).matches()) {
            throw error("invalid_mid");
        }
        if (value.charAt(14) != '7') {
            throw error("invalid_uuid_version");
        }
        if ("89ab".indexOf(value.charAt(19)) < 0) {
            throw error("invalid_mid");
        }
        return value;
    }

    public static String publicIdFromMachineId(String machineId, String namespace) {
        if (!PUBLIC_PREFIX.matcher(namespace).matches()) {
            throw error("invalid_public_prefix");
        }
        var number = new BigInteger(parseMachineId(machineId).replace("-", ""), 16);
        var suffix = new char[26];
        var base = BigInteger.valueOf(32);
        for (var index = suffix.length - 1; index >= 0; index--) {
            var result = number.divideAndRemainder(base);
            suffix[index] = TYPE_ID.charAt(result[1].intValue());
            number = result[0];
        }
        return namespace + "_" + new String(suffix);
    }

    public static ParsedPublicId parsePublicId(String value) {
        if (value == null || !value.equals(value.toLowerCase(Locale.ROOT))) {
            throw error("invalid_pid");
        }
        var separator = value.lastIndexOf('_');
        if (separator < 0) {
            throw error("invalid_public_prefix");
        }
        var namespace = value.substring(0, separator);
        var suffix = value.substring(separator + 1);
        if (!PUBLIC_PREFIX.matcher(namespace).matches()) {
            throw error("invalid_public_prefix");
        }
        if (suffix.length() != 26 || suffix.charAt(0) > '7') {
            throw error("invalid_pid");
        }
        var number = BigInteger.ZERO;
        for (var symbol : suffix.toCharArray()) {
            var position = TYPE_ID.indexOf(symbol);
            if (position < 0) {
                throw error("invalid_pid");
            }
            number = number.shiftLeft(5).or(BigInteger.valueOf(position));
        }
        var hex = String.format("%032x", number);
        var machineId = hex.substring(0, 8) + "-" + hex.substring(8, 12) + "-"
                + hex.substring(12, 16) + "-" + hex.substring(16, 20) + "-" + hex.substring(20);
        try {
            machineId = parseMachineId(machineId);
        } catch (IdentifoldException exception) {
            throw error("invalid_pid");
        }
        return new ParsedPublicId(value, namespace, machineId);
    }

    public static char checkSymbol(String payload, boolean sequential) {
        var alphabet = sequential ? "0123456789" : DATA;
        var base = sequential ? 10 : 32;
        var remainder = 0;
        for (var symbol : payload.toCharArray()) {
            var position = alphabet.indexOf(symbol);
            if (position < 0) {
                throw error("invalid_ref_symbol");
            }
            remainder = (remainder * base + position) % 37;
        }
        return CHECK.charAt(remainder);
    }

    public static String createReferenceCandidate(
            List<NamespaceDefinition> registry, String namespace, List<Integer> randomBytes) {
        var reference = findNamespace(registry, namespace).reference();
        if (reference == null || !reference.strategy().equals("random")) {
            throw error("unknown_namespace");
        }
        var length = profileLength(reference.profile());
        if (randomBytes.size() < length) {
            throw error("invalid_random_source");
        }
        var payload = new StringBuilder(length);
        for (var index = 0; index < length; index++) {
            var value = randomBytes.get(index);
            if (value < 0 || value > 255) {
                throw error("invalid_random_source");
            }
            payload.append(DATA.charAt(value % 32));
        }
        return reference.prefix() + "-" + group(payload.toString()) + "-" + checkSymbol(payload.toString(), false);
    }

    public static String formatSequentialReference(
            List<NamespaceDefinition> registry, String namespace, String sequence, String scope) {
        var reference = findNamespace(registry, namespace).reference();
        if (reference == null || !reference.strategy().equals("sequence")) {
            throw error("unknown_namespace");
        }
        if (!sequence.chars().allMatch(Character::isDigit) || sequence.length() > reference.width()) {
            throw error("sequence_overflow");
        }
        var padded = "0".repeat(reference.width() - sequence.length()) + sequence;
        var actualScope = scope == null ? "" : scope;
        var payload = actualScope + padded;
        return reference.prefix() + "-" + (actualScope.isEmpty() ? "" : actualScope + "-")
                + padded + "-" + checkSymbol(payload, true);
    }

    public static String normalize(String value, List<NamespaceDefinition> registry) {
        if (value.contains("_")) {
            var parsed = parsePublicId(value);
            findNamespace(registry, parsed.namespace());
            return parsed.value();
        }
        if (value.length() == 36) {
            return parseMachineId(value);
        }
        var compact = value.toUpperCase(Locale.ROOT).replace("-", "");
        NamespaceDefinition definition = null;
        for (var candidate : registry) {
            if (candidate.reference() != null && compact.startsWith(candidate.reference().prefix())) {
                definition = candidate;
                break;
            }
        }
        if (definition == null) {
            if (value.matches("^[A-Za-z]{2,8}.*")) {
                throw error("unknown_namespace");
            }
            throw error("invalid_kind");
        }
        var reference = definition.reference();
        var body = compact.substring(reference.prefix().length());
        if (body.contains("?") || body.contains("_")) {
            throw error("invalid_ref");
        }
        if (reference.strategy().equals("sequence")) {
            var scopeLength = reference.scope().equals("calendar-year") ? 4 : 0;
            if (body.length() != scopeLength + reference.width() + 1) {
                throw error("invalid_ref_length");
            }
            var payload = body.substring(0, body.length() - 1);
            var supplied = body.charAt(body.length() - 1);
            if (checkSymbol(payload, true) != supplied) {
                throw error("invalid_checksum");
            }
            return formatSequentialReference(registry, definition.publicPrefix(),
                    payload.substring(scopeLength), payload.substring(0, scopeLength));
        }
        var length = profileLength(reference.profile());
        if (body.length() != length + 1) {
            throw error("invalid_ref_length");
        }
        var payload = body.substring(0, length).replace('O', '0').replace('I', '1').replace('L', '1');
        var supplied = body.charAt(length);
        if (checkSymbol(payload, false) != supplied) {
            throw error("invalid_checksum");
        }
        return reference.prefix() + "-" + group(payload) + "-" + supplied;
    }

    public static List<NamespaceDefinition> parseRegistry(String encoded) {
        var result = new ArrayList<NamespaceDefinition>();
        if (encoded == null || encoded.isEmpty()) {
            return result;
        }
        for (var item : encoded.split(";", -1)) {
            var fields = item.split(",", -1);
            ReferenceDefinition reference = null;
            if (fields.length > 1 && !fields[1].isEmpty()) {
                reference = new ReferenceDefinition(fields[1], fields[3], fields[2], fields[4], Integer.parseInt(fields[5]));
            }
            result.add(new NamespaceDefinition(fields[0], reference));
        }
        return result;
    }

    private static NamespaceDefinition findNamespace(List<NamespaceDefinition> registry, String namespace) {
        return registry.stream().filter(item -> item.publicPrefix().equals(namespace)).findFirst()
                .orElseThrow(() -> error("unknown_namespace"));
    }

    private static int profileLength(String profile) {
        return switch (profile) {
            case "compact" -> 8;
            case "high" -> 12;
            default -> 10;
        };
    }

    private static String group(String value) {
        var result = new ArrayList<String>();
        for (var index = 0; index < value.length(); index += 4) {
            result.add(value.substring(index, Math.min(index + 4, value.length())));
        }
        return String.join("-", result);
    }

    private static IdentifoldException error(String code) {
        return new IdentifoldException(code);
    }
}
