require "mysql2"
require_relative "../../identifold"
require_relative "../storage"

module Identifold
  module Storage
    class MySQLAdapter
      SEQUENTIAL_REFERENCE = /\A([A-Z]{2,8})-(?:([0-9]{4})-)?([0-9]{4,18})-[0-9A-Z*~$=U]\z/

      def initialize(connection)
        @connection = connection
      end

      def reserve(request)
        database_operation do
          row = execute(
            "CALL identifold_reserve_reference(?, ?, ?)",
            [machine_id_bytes(request.machine_id), request.namespace, request.reference]
          ).first
          value = row_value(row, "reserved")
          return true if value == true || value == 1
          return false if value == false || value == 0

          raise Error, "allocation_conflict"
        end
      end

      def resolve(reference, namespace)
        database_operation do
          row = execute(
            "SELECT machine_id, namespace FROM identifold_references " \
              "WHERE reference = ? AND namespace = ?",
            [reference, namespace]
          ).first
          return mapping(row) if row

          match = SEQUENTIAL_REFERENCE.match(reference)
          return nil unless match

          row = execute(
            "SELECT machine_id, namespace FROM identifold_sequence_allocations " \
              "WHERE namespace = ? AND reference_prefix = ? AND scope = ? AND sequence = ?",
            [namespace, match[1], match[2] || "", match[3]]
          ).first
          row ? mapping(row) : nil
        end
      end

      def allocate(request)
        machine_id = machine_id_bytes(request.machine_id)
        5.times do |attempt|
          begin
            row = execute(
              "CALL identifold_allocate_sequence(?, ?, ?, ?, ?)",
              [
                machine_id,
                request.namespace,
                request.reference_prefix,
                request.scope,
                request.width
              ]
            ).first
            sequence = row_value(row, "sequence")
            return sequence if sequence.is_a?(Integer) && sequence >= 0

            raise Error, "allocation_conflict"
          rescue Mysql2::Error => exception
            if attempt < 4 && transient?(exception)
              sleep(0.001 * (2**attempt))
              next
            end
            raise Error, mapped_error(exception)
          end
        end
        raise Error, "allocation_conflict"
      end

      private

      def execute(sql, values)
        statement = @connection.prepare(sql)
        result = statement.execute(*values)
        result.to_a
      ensure
        drain_results
        statement&.close
      end

      def drain_results
        while @connection.next_result
          @connection.store_result
        end
      rescue Mysql2::Error
        nil
      end

      def database_operation
        yield
      rescue Error
        raise
      rescue Mysql2::Error => exception
        raise Error, mapped_error(exception)
      end

      def mapped_error(exception)
        case exception.sql_state
        when "22003" then "sequence_overflow"
        when "22023" then "invalid_allocation_policy"
        else "allocation_conflict"
        end
      end

      def transient?(exception)
        [1205, 1213].include?(exception.error_number) || exception.sql_state == "40001"
      end

      def machine_id_bytes(value)
        hex = value.delete("-")
        raise Error, "allocation_conflict" unless hex.match?(/\A[0-9a-fA-F]{32}\z/)

        [hex].pack("H*")
      end

      def bytes_machine_id(value)
        hex = value.unpack1("H*")
        raise Error, "allocation_conflict" unless hex.length == 32

        "#{hex[0, 8]}-#{hex[8, 4]}-#{hex[12, 4]}-#{hex[16, 4]}-#{hex[20, 12]}"
      end

      def mapping(row)
        ReferenceMapping.new(
          machine_id: bytes_machine_id(row_value(row, "machine_id")),
          namespace: row_value(row, "namespace")
        )
      end

      def row_value(row, name)
        return nil unless row

        row.key?(name) ? row[name] : row[name.to_sym]
      end
    end
  end
end
