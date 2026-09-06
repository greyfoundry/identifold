require "identifold"
require "identifold/storage/mysql"
require "mysql2"
require "uri"

url = URI(ENV.fetch("IDENTIFOLD_TEST_MYSQL_URL"))
connection = Mysql2::Client.new(
  host: url.host,
  port: url.port || 3306,
  username: url.user,
  password: url.password,
  database: url.path.delete_prefix("/"),
  cast_booleans: true
)
adapter = Identifold::Storage::MySQLAdapter.new(connection)
request = Identifold::Storage::ReferenceReservation.new(
  machine_id: "01890f8c-7b2a-7cc3-98b0-112233445568",
  namespace: "order",
  reference: "ORD-9876-5432-10-X"
)
reserved = adapter.reserve(request)
mapping = adapter.resolve(request.reference, request.namespace)
puts({ reserved: reserved, mapping: mapping }.inspect)
connection.close
