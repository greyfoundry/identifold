<?php

declare(strict_types=1);

namespace Greyfoundry\Identifold\Storage\Sqlite;

use Greyfoundry\Identifold\IdentifoldException;
use Greyfoundry\Identifold\Storage\ReferenceLookup;
use Greyfoundry\Identifold\Storage\ReferenceMapping;
use Greyfoundry\Identifold\Storage\ReferenceReservation;
use Greyfoundry\Identifold\Storage\ReferenceStore;
use Greyfoundry\Identifold\Storage\SequenceAllocationRequest;
use Greyfoundry\Identifold\Storage\SequenceAllocator;
use PDO;
use PDOException;
use PDOStatement;

final readonly class SqliteStorageAdapter implements ReferenceStore, ReferenceLookup, SequenceAllocator
{
    public function __construct(private PDO $connection)
    {
    }

    public function reserve(ReferenceReservation $request): bool
    {
        try {
            $statement = $this->connection->prepare(
                'INSERT INTO identifold_references '
                . '(reference, namespace, machine_id) VALUES (?, ?, ?) '
                . 'ON CONFLICT(reference) DO NOTHING',
            );
            $statement->bindValue(1, $request->reference);
            $statement->bindValue(2, $request->namespace);
            $statement->bindValue(3, $this->machineIdBytes($request->machineId), PDO::PARAM_LOB);
            $statement->execute();
            return $statement->rowCount() === 1;
        } catch (PDOException $exception) {
            throw $this->map($exception);
        }
    }

    public function resolve(string $reference, string $namespace): ?ReferenceMapping
    {
        try {
            $statement = $this->connection->prepare(
                'SELECT machine_id, namespace FROM identifold_references '
                . 'WHERE reference = ? AND namespace = ?',
            );
            $statement->execute([$reference, $namespace]);
            $row = $statement->fetch(PDO::FETCH_ASSOC);
            if (is_array($row)) {
                return $this->mapping($row);
            }

            if (preg_match(
                '/^([A-Z]{2,8})-(?:([0-9]{4})-)?([0-9]{4,18})-[0-9A-Z*~$=U]$/D',
                $reference,
                $matches,
            ) !== 1) {
                return null;
            }
            $statement = $this->connection->prepare(
                'SELECT machine_id, namespace FROM identifold_sequence_allocations '
                . 'WHERE namespace = ? AND reference_prefix = ? AND scope = ? AND sequence = ?',
            );
            $statement->execute([
                $namespace,
                $matches[1],
                $matches[2] ?? '',
                $matches[3],
            ]);
            $row = $statement->fetch(PDO::FETCH_ASSOC);
            return is_array($row) ? $this->mapping($row) : null;
        } catch (PDOException $exception) {
            throw $this->map($exception);
        }
    }

    public function allocate(SequenceAllocationRequest $request): int
    {
        if ($request->width < 4 || $request->width > 18) {
            throw new IdentifoldException('invalid_allocation_policy');
        }
        try {
            $this->connection->exec('BEGIN IMMEDIATE');
            try {
                $allocated = $this->allocateInTransaction($request);
                $this->connection->exec('COMMIT');
                return $allocated;
            } catch (\Throwable $exception) {
                $this->rollback();
                throw $exception;
            }
        } catch (IdentifoldException $exception) {
            throw $exception;
        } catch (PDOException $exception) {
            throw $this->map($exception);
        }
    }

    private function allocateInTransaction(SequenceAllocationRequest $request): int
    {
        $scope = $request->scope ?? '';
        $machineId = $this->machineIdBytes($request->machineId);
        $replay = $this->connection->prepare(
            'SELECT sequence, reference_prefix, width FROM identifold_sequence_allocations '
            . 'WHERE namespace = ? AND scope = ? AND machine_id = ?',
        );
        $replay->bindValue(1, $request->namespace);
        $replay->bindValue(2, $scope);
        $replay->bindValue(3, $machineId, PDO::PARAM_LOB);
        $replay->execute();
        $row = $replay->fetch(PDO::FETCH_ASSOC);
        if (is_array($row)) {
            if ($row['reference_prefix'] !== $request->referencePrefix
                || (int) $row['width'] !== $request->width) {
                throw new IdentifoldException('invalid_allocation_policy');
            }
            return (int) $row['sequence'];
        }

        $create = $this->connection->prepare(
            'INSERT INTO identifold_sequences '
            . '(namespace, scope, reference_prefix, width, last_value) VALUES (?, ?, ?, ?, 0) '
            . 'ON CONFLICT DO NOTHING',
        );
        $create->execute([
            $request->namespace,
            $scope,
            $request->referencePrefix,
            $request->width,
        ]);
        $select = $this->connection->prepare(
            'SELECT reference_prefix, width, last_value FROM identifold_sequences '
            . 'WHERE namespace = ? AND scope = ?',
        );
        $select->execute([$request->namespace, $scope]);
        $row = $select->fetch(PDO::FETCH_ASSOC);
        if (!is_array($row) || $row['reference_prefix'] !== $request->referencePrefix
            || (int) $row['width'] !== $request->width) {
            throw new IdentifoldException('invalid_allocation_policy');
        }
        $current = (int) $row['last_value'];
        $maximum = (10 ** $request->width) - 1;
        if ($current >= $maximum) {
            throw new IdentifoldException('sequence_overflow');
        }
        $allocated = $current + 1;

        $update = $this->connection->prepare(
            'UPDATE identifold_sequences SET last_value = ? WHERE namespace = ? AND scope = ?',
        );
        $update->execute([$allocated, $request->namespace, $scope]);
        $insert = $this->connection->prepare(
            'INSERT INTO identifold_sequence_allocations '
            . '(namespace, scope, sequence, machine_id, reference_prefix, width) '
            . 'VALUES (?, ?, ?, ?, ?, ?)',
        );
        $insert->bindValue(1, $request->namespace);
        $insert->bindValue(2, $scope);
        $insert->bindValue(3, $allocated, PDO::PARAM_INT);
        $insert->bindValue(4, $machineId, PDO::PARAM_LOB);
        $insert->bindValue(5, $request->referencePrefix);
        $insert->bindValue(6, $request->width, PDO::PARAM_INT);
        $insert->execute();
        return $allocated;
    }

    /** @param array<string, mixed> $row */
    private function mapping(array $row): ReferenceMapping
    {
        if (!is_string($row['machine_id'] ?? null) || !is_string($row['namespace'] ?? null)) {
            throw new IdentifoldException('allocation_conflict');
        }
        return new ReferenceMapping($this->bytesMachineId($row['machine_id']), $row['namespace']);
    }

    private function machineIdBytes(string $value): string
    {
        $hex = str_replace('-', '', $value);
        $bytes = preg_match('/^[0-9a-fA-F]{32}$/D', $hex) === 1 ? hex2bin($hex) : false;
        if ($bytes === false) {
            throw new IdentifoldException('allocation_conflict');
        }
        return $bytes;
    }

    private function bytesMachineId(string $value): string
    {
        if (strlen($value) !== 16) {
            throw new IdentifoldException('allocation_conflict');
        }
        $hex = bin2hex($value);
        return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-'
            . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20, 12);
    }

    private function rollback(): void
    {
        try {
            $this->connection->exec('ROLLBACK');
        } catch (PDOException) {
            // The transaction may already have completed.
        }
    }

    private function map(PDOException $exception): IdentifoldException
    {
        return new IdentifoldException('allocation_conflict');
    }
}
