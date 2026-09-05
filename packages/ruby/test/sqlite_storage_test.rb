require "minitest/autorun"
require "sqlite3"
require_relative "../lib/identifold"
require_relative "../lib/identifold/storage/sqlite"

class SqliteStorageTest < Minitest::Test
  def test_reserves_allocates_replays_and_resolves
    connection = SQLite3::Database.new(":memory:")
    connection.results_as_hash = true
    root = File.expand_path("../../..", __dir__)
    connection.execute_batch(File.read(File.join(
      root, "integrations/sqlite/migrations/001_identifold.up.sql"
    )))

    adapter = Identifold::Storage::SqliteAdapter.new(connection)
    random_mid = "01890f8c-7b2a-7cc3-98b0-112233445566"
    random_ref = "ORD-0123-4567-89-P"
    assert adapter.reserve(Identifold::Storage::ReferenceReservation.new(
      machine_id: random_mid, namespace: "order", reference: random_ref
    ))
    refute adapter.reserve(Identifold::Storage::ReferenceReservation.new(
      machine_id: "01890f8c-7b2a-7cc3-98b0-112233445569",
      namespace: "order",
      reference: random_ref
    ))
    assert_equal random_mid, adapter.resolve(random_ref, "order").machine_id
    assert_equal random_mid.delete("-").upcase,
                 connection.get_first_value("SELECT hex(machine_id) FROM identifold_references")

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
