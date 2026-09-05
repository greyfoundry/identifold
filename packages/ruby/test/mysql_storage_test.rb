require "minitest/autorun"
require "mysql2"
require "uri"
require_relative "../lib/identifold"
require_relative "../lib/identifold/storage/mysql"

class MySQLStorageTest < Minitest::Test
  def test_reserves_allocates_and_resolves
    database_url = ENV["IDENTIFOLD_TEST_MYSQL_URL"]
    skip "IDENTIFOLD_TEST_MYSQL_URL is not configured" unless database_url

    url = URI(database_url)
    connection = Mysql2::Client.new(
      host: url.host,
      port: url.port || 3306,
      username: url.user,
      password: url.password,
      database: url.path.delete_prefix("/"),
      cast_booleans: true
    )
    %w[
      identifold_sequence_allocations
      identifold_sequences
      identifold_references
    ].each { |table| connection.query("DELETE FROM #{table}") }

    adapter = Identifold::Storage::MySQLAdapter.new(connection)
    random_mid = "01890f8c-7b2a-7cc3-98b0-112233445566"
    random_ref = "ORD-0123-4567-89-P"
    assert adapter.reserve(Identifold::Storage::ReferenceReservation.new(
      machine_id: random_mid, namespace: "order", reference: random_ref
    ))
    assert_equal random_mid, adapter.resolve(random_ref, "order").machine_id

    request = Identifold::Storage::SequenceAllocationRequest.new(
      machine_id: "01890f8c-7b2a-7cc3-98b0-112233445567",
      namespace: "receipt",
      reference_prefix: "RCT",
      scope: nil,
      width: 4
    )
    assert_equal 1, adapter.allocate(request)
    assert_equal 1, adapter.allocate(request)
    assert_equal request.machine_id, adapter.resolve("RCT-0001-1", "receipt").machine_id
  ensure
    connection&.close
  end
end
