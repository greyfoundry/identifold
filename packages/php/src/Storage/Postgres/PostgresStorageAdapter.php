<?php

declare(strict_types=1);

namespace Greyfoundry\Identifold\Storage\Postgres;

use Greyfoundry\Identifold\IdentifoldException;
use Greyfoundry\Identifold\Storage\ReferenceLookup;
use Greyfoundry\Identifold\Storage\ReferenceMapping;
use Greyfoundry\Identifold\Storage\ReferenceReservation;
use Greyfoundry\Identifold\Storage\ReferenceStore;
use Greyfoundry\Identifold\Storage\SequenceAllocationRequest;
use Greyfoundry\Identifold\Storage\SequenceAllocator;
use PDO;
use PDOException;

final readonly class PostgresStorageAdapter implements ReferenceStore, ReferenceLookup, SequenceAllocator
{
    public function __construct(private PDO $connection)
    {
    }

    public function reserve(ReferenceReservation $request): bool
    {
        $value = $this->scalar(
            'SELECT identifold_reserve_reference(:machine_id::text::uuid, :namespace::text, :reference::text)',
            [
                'machine_id' => $request->machineId,
                'namespace' => $request->namespace,
                'reference' => $request->reference,
            ],
        );
        if ($value === true || $value === 't' || $value === 1 || $value === '1') {
            return true;
        }
        if ($value === false || $value === 'f' || $value === 0 || $value === '0') {
            return false;
        }
        throw new IdentifoldException('allocation_conflict');
    }

    public function resolve(string $reference, string $namespace): ?ReferenceMapping
    {
        try {
            $statement = $this->connection->prepare(
                'SELECT resolved_machine_id::text AS machine_id, resolved_namespace AS namespace '
                . 'FROM identifold_resolve_reference(:reference::text, :namespace::text)',
            );
            $statement->execute(['reference' => $reference, 'namespace' => $namespace]);
            $row = $statement->fetch(PDO::FETCH_ASSOC);
            if ($row === false) {
                return null;
            }
            if (!is_string($row['machine_id'] ?? null) || !is_string($row['namespace'] ?? null)) {
                throw new IdentifoldException('allocation_conflict');
            }
            return new ReferenceMapping($row['machine_id'], $row['namespace']);
        } catch (PDOException $exception) {
            throw $this->map($exception);
        }
    }

    public function allocate(SequenceAllocationRequest $request): int
    {
        $value = $this->scalar(
            'SELECT identifold_allocate_sequence('
            . ':machine_id::text::uuid, :namespace::text, :prefix::text, :scope::text, :width::smallint)',
            [
                'machine_id' => $request->machineId,
                'namespace' => $request->namespace,
                'prefix' => $request->referencePrefix,
                'scope' => $request->scope,
                'width' => $request->width,
            ],
        );
        if ((is_int($value) || (is_string($value) && preg_match('/^\d+$/D', $value) === 1))
            && (int) $value >= 0) {
            return (int) $value;
        }
        throw new IdentifoldException('allocation_conflict');
    }

    /** @param array<string, int|string|null> $parameters */
    private function scalar(string $sql, array $parameters): mixed
    {
        try {
            $statement = $this->connection->prepare($sql);
            $statement->execute($parameters);
            return $statement->fetchColumn();
        } catch (PDOException $exception) {
            throw $this->map($exception);
        }
    }

    private function map(PDOException $exception): IdentifoldException
    {
        $state = $exception->errorInfo[0] ?? $exception->getCode();
        return new IdentifoldException(match ($state) {
            '22003' => 'sequence_overflow',
            '22023' => 'invalid_allocation_policy',
            default => 'allocation_conflict',
        });
    }
}
