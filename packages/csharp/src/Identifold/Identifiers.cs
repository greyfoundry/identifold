using System.Globalization;
using System.Numerics;
using System.Text.RegularExpressions;

namespace Greyfoundry.Identifold;

public sealed class IdentifoldException(string code) : ArgumentException(code)
{
    public string Code { get; } = code;
}

public sealed record ParsedPublicId(string Value, string Namespace, string MachineId);
public sealed record ReferenceDefinition(string Prefix, string Profile, string Strategy, string Scope, int Width);
public sealed record NamespaceDefinition(string PublicPrefix, ReferenceDefinition? Reference);

public static partial class Identifiers
{
    private const string Data = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    private const string Check = Data + "*~$=U";
    private const string TypeId = "0123456789abcdefghjkmnpqrstvwxyz";

    [GeneratedRegex("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")]
    private static partial Regex MachinePattern();

    [GeneratedRegex("^[a-z](?:[a-z_]{0,61}[a-z])?$")]
    private static partial Regex PublicPrefixPattern();

    public static string ParseMachineId(string input)
    {
        var value = input?.ToLowerInvariant() ?? "";
        if (!MachinePattern().IsMatch(value)) throw Error("invalid_mid");
        if (value[14] != '7') throw Error("invalid_uuid_version");
        if (!"89ab".Contains(value[19])) throw Error("invalid_mid");
        return value;
    }

    public static string PublicIdFromMachineId(string machineId, string @namespace)
    {
        if (!PublicPrefixPattern().IsMatch(@namespace)) throw Error("invalid_public_prefix");
        var number = BigInteger.Parse("0" + ParseMachineId(machineId).Replace("-", ""), NumberStyles.AllowHexSpecifier);
        var suffix = new char[26];
        for (var index = suffix.Length - 1; index >= 0; index--)
        {
            number = BigInteger.DivRem(number, 32, out var remainder);
            suffix[index] = TypeId[(int)remainder];
        }
        return $"{@namespace}_{new string(suffix)}";
    }

    public static ParsedPublicId ParsePublicId(string value)
    {
        if (value != value.ToLowerInvariant()) throw Error("invalid_pid");
        var separator = value.LastIndexOf('_');
        if (separator < 0) throw Error("invalid_public_prefix");
        var @namespace = value[..separator];
        var suffix = value[(separator + 1)..];
        if (!PublicPrefixPattern().IsMatch(@namespace)) throw Error("invalid_public_prefix");
        if (suffix.Length != 26 || suffix[0] > '7') throw Error("invalid_pid");
        var number = BigInteger.Zero;
        foreach (var symbol in suffix)
        {
            var position = TypeId.IndexOf(symbol);
            if (position < 0) throw Error("invalid_pid");
            number = (number << 5) | position;
        }
        var hex = number.ToString("x32");
        var machineId = $"{hex[..8]}-{hex[8..12]}-{hex[12..16]}-{hex[16..20]}-{hex[20..]}";
        try { machineId = ParseMachineId(machineId); }
        catch (IdentifoldException) { throw Error("invalid_pid"); }
        return new ParsedPublicId(value, @namespace, machineId);
    }

    public static char CheckSymbol(string payload, bool sequential)
    {
        var alphabet = sequential ? "0123456789" : Data;
        var @base = sequential ? 10 : 32;
        var remainder = 0;
        foreach (var symbol in payload)
        {
            var position = alphabet.IndexOf(symbol);
            if (position < 0) throw Error("invalid_ref_symbol");
            remainder = (remainder * @base + position) % 37;
        }
        return Check[remainder];
    }

    public static string CreateReferenceCandidate(
        IReadOnlyList<NamespaceDefinition> registry, string @namespace, IReadOnlyList<int> randomBytes)
    {
        var reference = FindNamespace(registry, @namespace).Reference;
        if (reference is null || reference.Strategy != "random") throw Error("unknown_namespace");
        var length = ProfileLength(reference.Profile);
        if (randomBytes.Count < length) throw Error("invalid_random_source");
        var payload = new char[length];
        for (var index = 0; index < length; index++)
        {
            if (randomBytes[index] is < 0 or > 255) throw Error("invalid_random_source");
            payload[index] = Data[randomBytes[index] % 32];
        }
        var text = new string(payload);
        return $"{reference.Prefix}-{Group(text)}-{CheckSymbol(text, false)}";
    }

    public static string FormatSequentialReference(
        IReadOnlyList<NamespaceDefinition> registry, string @namespace, string sequence, string scope)
    {
        var reference = FindNamespace(registry, @namespace).Reference;
        if (reference is null || reference.Strategy != "sequence") throw Error("unknown_namespace");
        if (sequence.Length > reference.Width || sequence.Any(symbol => !char.IsAsciiDigit(symbol)))
            throw Error("sequence_overflow");
        var padded = sequence.PadLeft(reference.Width, '0');
        var payload = scope + padded;
        return $"{reference.Prefix}-{(scope.Length == 0 ? "" : scope + "-")}{padded}-{CheckSymbol(payload, true)}";
    }

    public static string Normalize(string value, IReadOnlyList<NamespaceDefinition> registry)
    {
        if (value.Contains('_'))
        {
            var parsed = ParsePublicId(value);
            FindNamespace(registry, parsed.Namespace);
            return parsed.Value;
        }
        if (value.Length == 36) return ParseMachineId(value);
        var compact = value.ToUpperInvariant().Replace("-", "");
        var definition = registry.FirstOrDefault(candidate =>
            candidate.Reference is not null && compact.StartsWith(candidate.Reference.Prefix));
        if (definition is null)
        {
            if (Regex.IsMatch(value, "^[A-Za-z]{2,8}.*")) throw Error("unknown_namespace");
            throw Error("invalid_kind");
        }
        var reference = definition.Reference!;
        var body = compact[reference.Prefix.Length..];
        if (body.Contains('?') || body.Contains('_')) throw Error("invalid_ref");
        if (reference.Strategy == "sequence")
        {
            var scopeLength = reference.Scope == "calendar-year" ? 4 : 0;
            if (body.Length != scopeLength + reference.Width + 1) throw Error("invalid_ref_length");
            var payload = body[..^1];
            if (CheckSymbol(payload, true) != body[^1]) throw Error("invalid_checksum");
            return FormatSequentialReference(registry, definition.PublicPrefix,
                payload[scopeLength..], payload[..scopeLength]);
        }
        var length = ProfileLength(reference.Profile);
        if (body.Length != length + 1) throw Error("invalid_ref_length");
        var randomPayload = body[..length].Replace('O', '0').Replace('I', '1').Replace('L', '1');
        if (CheckSymbol(randomPayload, false) != body[^1]) throw Error("invalid_checksum");
        return $"{reference.Prefix}-{Group(randomPayload)}-{body[^1]}";
    }

    private static NamespaceDefinition FindNamespace(IReadOnlyList<NamespaceDefinition> registry, string @namespace) =>
        registry.FirstOrDefault(item => item.PublicPrefix == @namespace) ?? throw Error("unknown_namespace");

    private static int ProfileLength(string profile) => profile switch
    {
        "compact" => 8,
        "high" => 12,
        _ => 10,
    };

    private static string Group(string value) => string.Join("-",
        Enumerable.Range(0, (value.Length + 3) / 4).Select(index =>
            value.Substring(index * 4, Math.Min(4, value.Length - index * 4))));

    private static IdentifoldException Error(string code) => new(code);
}
