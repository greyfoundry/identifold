require "identifold"
require "identifold/storage/sqlite"
require "sqlite3"

connection = SQLite3::Database.new(":memory:")
connection.results_as_hash = true
connection.execute_batch(File.read("integrations/sqlite/migrations/001_identifold.up.sql"))
adapter = Identifold::Storage::SqliteAdapter.new(connection)
request = Identifold::Storage::ReferenceReservation.new(
  machine_id: "01890f8c-7b2a-7cc3-98b0-112233445566",
  namespace: "order",
  reference: "ORD-0123-4567-89-P"
)
reserved = adapter.reserve(request)
mapping = adapter.resolve(request.reference, request.namespace)
puts({ reserved: reserved, mapping: mapping }.inspect)
connection.close
