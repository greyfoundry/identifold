import Identifold

let mid = "019d4c72-c910-7a84-b313-53c3ac61a32f"
let pid = try Identifiers.publicID(from: mid, namespace: "order")
let parsed = try Identifiers.parsePublicID(pid)
let roundTrip = parsed.machineID == mid
precondition(roundTrip, "MID/PID round trip failed.")

print(
  """
  {
    "mid": "\(mid)",
    "namespace": "\(parsed.namespace)",
    "pid": "\(pid)",
    "roundTrip": true
  }
  """
)
