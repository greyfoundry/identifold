require "identifold"
require "json"

mid = "019d4c72-c910-7a84-b313-53c3ac61a32f"
pid = Identifold.public_id_from_machine_id(mid, "order")
parsed = Identifold.parse_public_id(pid)
round_trip = parsed[:machineId] == mid
raise "MID/PID round trip failed." unless round_trip

puts JSON.pretty_generate(
  mid: mid,
  namespace: parsed[:namespace],
  pid: pid,
  roundTrip: round_trip
)
