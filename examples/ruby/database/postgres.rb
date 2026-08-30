require "identifold"
require "identifold/storage/postgres"
require "pg"

connection = PG.connect(ENV.fetch("DATABASE_URL"))
adapter = Identifold::Storage::PostgresAdapter.new(connection)
request = Identifold::Storage::ReferenceReservation.new(
  machine_id: "01890f8c-7b2a-7cc3-98b0-112233445566",
  namespace: "order",
  reference: "ORD-0123-4567-89-P"
)
reserved = adapter.reserve(request)
mapping = adapter.resolve(request.reference, request.namespace)
puts({ reserved: reserved, mapping: mapping }.inspect)
connection.close
