module Identifold
  module Storage
    ReferenceReservation = Data.define(:machine_id, :namespace, :reference)
    ReferenceMapping = Data.define(:machine_id, :namespace)
    SequenceAllocationRequest = Data.define(
      :machine_id,
      :namespace,
      :reference_prefix,
      :scope,
      :width
    )
    Adapter = Data.define(:reference_store, :reference_lookup, :sequence_allocator)
  end
end
