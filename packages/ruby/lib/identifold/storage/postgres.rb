require "pg"
require_relative "../../identifold"
require_relative "../storage"

module Identifold
  module Storage
    class PostgresAdapter
      def initialize(connection)
        @connection = connection
      end

      def reserve(request)
        result = query(
          "SELECT identifold_reserve_reference($1::text::uuid, $2::text, $3::text) AS reserved",
          [request.machine_id, request.namespace, request.reference]
        )
        value = result.first&.fetch("reserved", nil)
        return true if value == "t"
        return false if value == "f"

        raise Error, "allocation_conflict"
      end

      def resolve(reference, namespace)
        result = query(
          "SELECT resolved_machine_id::text AS machine_id, resolved_namespace AS namespace " \
            "FROM identifold_resolve_reference($1::text, $2::text)",
          [reference, namespace]
        )
        return nil if result.ntuples.zero?
        raise Error, "allocation_conflict" unless result.ntuples == 1

        row = result.first
        ReferenceMapping.new(machine_id: row.fetch("machine_id"), namespace: row.fetch("namespace"))
      end

      def allocate(request)
        result = query(
          "SELECT identifold_allocate_sequence(" \
            "$1::text::uuid, $2::text, $3::text, $4::text, $5::smallint) AS sequence",
          [
            request.machine_id,
            request.namespace,
            request.reference_prefix,
            request.scope,
            request.width
          ]
        )
        value = result.first&.fetch("sequence", nil)
        raise Error, "allocation_conflict" unless value&.match?(/\A\d+\z/)

        value.to_i
      end

      private

      def query(sql, values)
        @connection.exec_params(sql, values)
      rescue PG::Error => exception
        code = exception.result&.error_field(PG::Result::PG_DIAG_SQLSTATE)
        raise Error, case code
                     when "22003" then "sequence_overflow"
                     when "22023" then "invalid_allocation_policy"
                     else "allocation_conflict"
                     end
      end
    end
  end
end
