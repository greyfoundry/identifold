require_relative "../lib/identifold/storage"

class FakeStorage
  def reserve(_request) = true

  def resolve(_reference, namespace)
    Identifold::Storage::ReferenceMapping.new(
      machine_id: "01890f8c-7b2a-7cc3-98b0-112233445566",
      namespace: namespace
    )
  end

  def allocate(_request) = 1
end

adapter = Identifold::Storage::Adapter.new(
  reference_store: FakeStorage.new,
  reference_lookup: FakeStorage.new,
  sequence_allocator: FakeStorage.new
)
reservation = Identifold::Storage::ReferenceReservation.new(
  machine_id: "01890f8c-7b2a-7cc3-98b0-112233445566",
  namespace: "order",
  reference: "ORD-0123-4567-89-P"
)
raise "reserve" unless adapter.reference_store.reserve(reservation)
raise "resolve" unless adapter.reference_lookup.resolve(
  reservation.reference, reservation.namespace
).machine_id == reservation.machine_id
raise "allocate" unless adapter.sequence_allocator.allocate(
  Identifold::Storage::SequenceAllocationRequest.new(
    machine_id: reservation.machine_id,
    namespace: "receipt",
    reference_prefix: "RCT",
    scope: nil,
    width: 4
  )
) == 1
