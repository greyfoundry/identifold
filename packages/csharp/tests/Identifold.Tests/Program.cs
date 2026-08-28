using Greyfoundry.Identifold;

const string mid = "019d4c72-c910-7a84-b313-53c3ac61a32f";
var pid = Identifiers.PublicIdFromMachineId(mid, "order");
if (pid != "order_01kn675j8gfa2b64tkrep638sf") throw new Exception(pid);
var parsed = Identifiers.ParsePublicId(pid);
if (parsed.MachineId != mid || parsed.Namespace != "order") throw new Exception("round trip");
if (Identifiers.CheckSymbol("0123456789", false) != 'P') throw new Exception("random checksum");
if (Identifiers.CheckSymbol("2026001842", true) != 'M') throw new Exception("sequential checksum");
