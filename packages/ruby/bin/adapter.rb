require "json"
require_relative "../lib/identifold"

request = JSON.parse($stdin.read)
registry = request.fetch("registry", [])

begin
  value = case request["operation"]
  when "parseMachineId"
    Identifold.parse_machine_id(request["input"])
  when "publicIdFromMachineId"
    Identifold.public_id_from_machine_id(request["machineId"], request["namespace"])
  when "parsePublicId"
    Identifold.parse_public_id(request["input"])
  when "createReferenceCandidate"
    Identifold.create_reference_candidate(registry, request["namespace"], request["randomBytes"])
  when "formatSequentialReference"
    Identifold.format_sequential_reference(registry, request["namespace"], request["sequence"], request.fetch("scope", ""))
  when "normalize", "parseReference", "inspect"
    Identifold.normalize(request["input"], registry)
  else
    raise "unsupported operation"
  end
  print JSON.generate(ok: true, value: value)
rescue Identifold::Error => error
  print JSON.generate(ok: false, errorCode: error.code)
end
