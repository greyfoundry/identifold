using System.Text.Json;
using Greyfoundry.Identifold;

const string mid = "019d4c72-c910-7a84-b313-53c3ac61a32f";
var pid = Identifiers.PublicIdFromMachineId(mid, "order");
var parsed = Identifiers.ParsePublicId(pid);
var roundTrip = parsed.MachineId == mid;

if (!roundTrip)
{
    throw new InvalidOperationException("MID/PID round trip failed.");
}

Console.WriteLine(JsonSerializer.Serialize(new Dictionary<string, object>
{
    ["mid"] = mid,
    ["namespace"] = parsed.Namespace,
    ["pid"] = pid,
    ["roundTrip"] = roundTrip,
}, new JsonSerializerOptions { WriteIndented = true }));
