require "sqlite3"
require "thread"
require_relative "../../identifold"
require_relative "../storage"

module Identifold
  module Storage
    class SqliteAdapter
      SEQUENTIAL_REFERENCE = /\A([A-Z]{2,8})-(?:([0-9]{4})-)?([0-9]{4,18})-[0-9A-Z*~$=U]\z/

      def initialize(connection)
        @connection = connection
        @mutex = Mutex.new
      end

      def reserve(request)
        synchronize do
          @connection.execute(
            "INSERT INTO identifold_references " \
              "(reference, namespace, machine_id) VALUES (?, ?, ?) " \
              "ON CONFLICT(reference) DO NOTHING",
            [request.reference, request.namespace, machine_id_bytes(request.machine_id)]
          )
          @connection.changes == 1
        end
      end

      def resolve(reference, namespace)
        synchronize do
          row = @connection.get_first_row(
            "SELECT machine_id, namespace FROM identifold_references " \
              "WHERE reference = ? AND namespace = ?",
            [reference, namespace]
          )
          return mapping(row) if row

          match = SEQUENTIAL_REFERENCE.match(reference)
          return nil unless match

          row = @connection.get_first_row(
            "SELECT machine_id, namespace FROM identifold_sequence_allocations " \
              "WHERE namespace = ? AND reference_prefix = ? AND scope = ? AND sequence = ?",
            [namespace, match[1], match[2] || "", match[3]]
          )
          row ? mapping(row) : nil
        end
      end

      def allocate(request)
        raise Error, "invalid_allocation_policy" unless (4..18).cover?(request.width)

        synchronize do
          @connection.execute("BEGIN IMMEDIATE")
          begin
            allocated = allocate_in_transaction(request)
            @connection.execute("COMMIT")
            allocated
          rescue StandardError
            @connection.execute("ROLLBACK") if @connection.transaction_active?
            raise
          end
        end
      end

      private

      def allocate_in_transaction(request)
        scope = request.scope || ""
        machine_id = machine_id_bytes(request.machine_id)
        replay = @connection.get_first_row(
          "SELECT sequence, reference_prefix, width FROM identifold_sequence_allocations " \
            "WHERE namespace = ? AND scope = ? AND machine_id = ?",
          [request.namespace, scope, machine_id]
        )
        if replay
          unless row_value(replay, "reference_prefix", 1) == request.reference_prefix &&
                 row_value(replay, "width", 2) == request.width
            raise Error, "invalid_allocation_policy"
          end
          return row_value(replay, "sequence", 0)
        end

        @connection.execute(
          "INSERT INTO identifold_sequences " \
            "(namespace, scope, reference_prefix, width, last_value) VALUES (?, ?, ?, ?, 0) " \
            "ON CONFLICT DO NOTHING",
          [request.namespace, scope, request.reference_prefix, request.width]
        )
        sequence = @connection.get_first_row(
          "SELECT reference_prefix, width, last_value FROM identifold_sequences " \
            "WHERE namespace = ? AND scope = ?",
          [request.namespace, scope]
        )
        unless sequence && row_value(sequence, "reference_prefix", 0) == request.reference_prefix &&
                           row_value(sequence, "width", 1) == request.width
          raise Error, "invalid_allocation_policy"
        end
        current = row_value(sequence, "last_value", 2)
        raise Error, "sequence_overflow" if current >= (10**request.width) - 1

        allocated = current + 1
        @connection.execute(
          "UPDATE identifold_sequences SET last_value = ? WHERE namespace = ? AND scope = ?",
          [allocated, request.namespace, scope]
        )
        @connection.execute(
          "INSERT INTO identifold_sequence_allocations " \
            "(namespace, scope, sequence, machine_id, reference_prefix, width) " \
            "VALUES (?, ?, ?, ?, ?, ?)",
          [
            request.namespace,
            scope,
            allocated,
            machine_id,
            request.reference_prefix,
            request.width
          ]
        )
        allocated
      end

      def synchronize(&operation)
        @mutex.synchronize(&operation)
      rescue Error
        raise
      rescue SQLite3::Exception, ArgumentError
        raise Error, "allocation_conflict"
      end

      def machine_id_bytes(value)
        hex = value.delete("-")
        raise ArgumentError unless hex.match?(/\A[0-9a-fA-F]{32}\z/)

        [hex].pack("H*")
      end

      def bytes_machine_id(value)
        hex = value.unpack1("H*")
        raise ArgumentError unless hex.length == 32

        "#{hex[0, 8]}-#{hex[8, 4]}-#{hex[12, 4]}-#{hex[16, 4]}-#{hex[20, 12]}"
      end

      def mapping(row)
        machine_id = row.is_a?(Hash) ? row.fetch("machine_id") : row[0]
        namespace = row.is_a?(Hash) ? row.fetch("namespace") : row[1]
        ReferenceMapping.new(machine_id: bytes_machine_id(machine_id), namespace: namespace)
      end

      def row_value(row, name, index)
        row.is_a?(Hash) ? row.fetch(name) : row[index]
      end
    end
  end
end
