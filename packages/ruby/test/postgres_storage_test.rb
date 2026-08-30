require "minitest/autorun"
require "pg"
require_relative "../lib/identifold"
require_relative "../lib/identifold/storage/postgres"

class PostgresStorageTest < Minitest::Test
  def test_reserves_allocates_and_resolves
    database_url = ENV["IDENTIFOLD_TEST_DATABASE_URL"]
    skip "IDENTIFOLD_TEST_DATABASE_URL is not configured" unless database_url

    connection = PG.connect(database_url)
    root = File.expand_path("../../..", __dir__)
    %w[
      001_identifold.down.sql
      001_identifold.up.sql
      003_idempotent_replay.up.sql
      004_reference_lookup.up.sql
    ].each do |migration|
      connection.exec(File.read(File.join(root, "integrations/postgres/migrations", migration)))
    end

    adapter = Identifold::Storage::PostgresAdapter.new(connection)
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
