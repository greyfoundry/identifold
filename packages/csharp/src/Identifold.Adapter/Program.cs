using System.Text.Json;
using Greyfoundry.Identifold;

var request = JsonDocument.Parse(Console.In.ReadToEnd()).RootElement;
var registry = request.TryGetProperty("registry", out var registryJson)
    ? registryJson.EnumerateArray().Select(ParseNamespace).ToArray()
    : [];

try
{
    object value = request.GetProperty("operation").GetString() switch
    {
        "parseMachineId" => Identifiers.ParseMachineId(request.GetProperty("input").GetString()!),
        "publicIdFromMachineId" => Identifiers.PublicIdFromMachineId(
            request.GetProperty("machineId").GetString()!, request.GetProperty("namespace").GetString()!),
        "parsePublicId" => Identifiers.ParsePublicId(request.GetProperty("input").GetString()!),
        "createReferenceCandidate" => Identifiers.CreateReferenceCandidate(registry,
            request.GetProperty("namespace").GetString()!,
            request.GetProperty("randomBytes").EnumerateArray().Select(item => item.GetInt32()).ToArray()),
        "formatSequentialReference" => Identifiers.FormatSequentialReference(registry,
            request.GetProperty("namespace").GetString()!, request.GetProperty("sequence").GetString()!,
            request.TryGetProperty("scope", out var scope) ? scope.GetString()! : ""),
        "normalize" or "parseReference" or "inspect" => Identifiers.Normalize(
            request.GetProperty("input").GetString()!, registry),
        _ => throw new InvalidOperationException("unsupported operation"),
    };
    Console.Write(JsonSerializer.Serialize(new { ok = true, value }, new JsonSerializerOptions
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    }));
}
catch (IdentifoldException exception)
{
    Console.Write(JsonSerializer.Serialize(new { ok = false, errorCode = exception.Code }));
}

static NamespaceDefinition ParseNamespace(JsonElement value)
{
    ReferenceDefinition? reference = null;
    if (value.TryGetProperty("reference", out var item))
    {
        reference = new ReferenceDefinition(
            item.GetProperty("prefix").GetString()!,
            item.TryGetProperty("profile", out var profile) ? profile.GetString()! : "",
            item.GetProperty("strategy").GetString()!,
            item.TryGetProperty("scope", out var scope) ? scope.GetString()! : "",
            item.TryGetProperty("width", out var width) ? width.GetInt32() : 0);
    }
    return new NamespaceDefinition(value.GetProperty("publicPrefix").GetString()!, reference);
}
