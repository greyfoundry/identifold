<?php

declare(strict_types=1);

namespace Greyfoundry\Identifold\Storage\MySQL;

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

final readonly class MySQLStorageAdapter implements ReferenceStore, ReferenceLookup, SequenceAllocator
{
    public function __construct(private PDO $connection)
    {
    }

    public function reserve(ReferenceReservation $request): bool
    {
        try {
            $value = $this->callScalar(
                'CALL identifold_reserve_reference(?, ?, ?)',
                [
                    [$this->machineIdBytes($request->machineId), PDO::PARAM_LOB],
                    [$request->namespace, PDO::PARAM_STR],
                    [$request->reference, PDO::PARAM_STR],
                ],
            );
            if ($value === true || $value === 1 || $value === '1') {
                return true;
            }
            if ($value === false || $value === 0 || $value === '0') {
                return false;
            }
            throw new IdentifoldException('allocation_conflict');
        } catch (PDOException $exception) {
            throw $this->map($exception);
        }
    }

    public function resolve(string $reference, string $namespace): ?ReferenceMapping
    {
        try {
            $row = $this->selectRow(
                'SELECT machine_id, namespace FROM identifold_references '
                . 'WHERE reference = ? AND namespace = ?',
                [[$reference, PDO::PARAM_STR], [$namespace, PDO::PARAM_STR]],
            );
            if ($row !== null) {
                return $this->mapping($row);
            }

            if (preg_match(
                '/^([A-Z]{2,8})-(?:([0-9]{4})-)?([0-9]{4,18})-[0-9A-Z*~$=U]$/D',
                $reference,
                $matches,
            ) !== 1) {
                return null;
            }
            $row = $this->selectRow(
                'SELECT machine_id, namespace FROM identifold_sequence_allocations '
                . 'WHERE namespace = ? AND reference_prefix = ? AND scope = ? AND sequence = ?',
                [
                    [$namespace, PDO::PARAM_STR],
                    [$matches[1], PDO::PARAM_STR],
                    [$matches[2] ?? '', PDO::PARAM_STR],
                    [$matches[3], PDO::PARAM_STR],
                ],
            );
            return $row === null ? null : $this->mapping($row);
        } catch (PDOException $exception) {
            throw $this->map($exception);
        }
    }

    public function allocate(SequenceAllocationRequest $request): int
    {
        $machineId = $this->machineIdBytes($request->machineId);
        for ($attempt = 0; $attempt < 5; ++$attempt) {
            try {
                $value = $this->callScalar(
                    'CALL identifold_allocate_sequence(?, ?, ?, ?, ?)',
                    [
                        [$machineId, PDO::PARAM_LOB],
                        [$request->namespace, PDO::PARAM_STR],
                        [$request->referencePrefix, PDO::PARAM_STR],
                        [$request->scope, $request->scope === null ? PDO::PARAM_NULL : PDO::PARAM_STR],
                        [$request->width, PDO::PARAM_INT],
                    ],
                );
                if ((is_int($value) || (is_string($value) && preg_match('/^\d+$/D', $value) === 1))
                    && (int) $value >= 0) {
                    return (int) $value;
                }
                throw new IdentifoldException('allocation_conflict');
            } catch (PDOException $exception) {
                if ($attempt < 4 && $this->transient($exception)) {
                    usleep(1_000 * (2 ** $attempt));
                    continue;
                }
                throw $this->map($exception);
            }
        }
        throw new IdentifoldException('allocation_conflict');
    }

    /** @param list<array{mixed, int}> $parameters */
    private function callScalar(string $sql, array $parameters): mixed
    {
        $statement = $this->statement($sql, $parameters);
        try {
            $value = $statement->fetchColumn();
            while ($statement->nextRowset()) {
                // Drain every result set produced by CALL before reusing the connection.
            }
            return $value;
        } finally {
            $statement->closeCursor();
        }
    }

    /**
     * @param list<array{mixed, int}> $parameters
     * @return array<string, mixed>|null
     */
    private function selectRow(string $sql, array $parameters): ?array
    {
        $statement = $this->statement($sql, $parameters);
        try {
            $row = $statement->fetch(PDO::FETCH_ASSOC);
            return is_array($row) ? $row : null;
        } finally {
            $statement->closeCursor();
        }
    }

    /** @param list<array{mixed, int}> $parameters */
    private function statement(string $sql, array $parameters): PDOStatement
    {
        $statement = $this->connection->prepare($sql);
        foreach ($parameters as $index => [$value, $type]) {
            $statement->bindValue($index + 1, $value, $type);
        }
        $statement->execute();
        return $statement;
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

    private function transient(PDOException $exception): bool
    {
        $state = $exception->errorInfo[0] ?? $exception->getCode();
        $code = $exception->errorInfo[1] ?? null;
        return $state === '40001' || $code === 1205 || $code === 1213;
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
