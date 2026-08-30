<?php

declare(strict_types=1);

spl_autoload_register(static function (string $class): void {
    $prefix = 'Greyfoundry\\Identifold\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $path = __DIR__ . '/../src/' . str_replace('\\', '/', substr($class, strlen($prefix))) . '.php';
    if (is_file($path)) {
        require_once $path;
    }
});

use Greyfoundry\Identifold\Storage\IdentifoldStorageAdapter;
use Greyfoundry\Identifold\Storage\ReferenceLookup;
use Greyfoundry\Identifold\Storage\ReferenceMapping;
use Greyfoundry\Identifold\Storage\ReferenceReservation;
use Greyfoundry\Identifold\Storage\ReferenceStore;
use Greyfoundry\Identifold\Storage\SequenceAllocationRequest;
use Greyfoundry\Identifold\Storage\SequenceAllocator;

$fake = new class () implements ReferenceStore, ReferenceLookup, SequenceAllocator {
    public function reserve(ReferenceReservation $request): bool
    {
        return true;
    }

    public function resolve(string $reference, string $namespace): ?ReferenceMapping
    {
        return new ReferenceMapping('01890f8c-7b2a-7cc3-98b0-112233445566', $namespace);
    }

    public function allocate(SequenceAllocationRequest $request): int
    {
        return 1;
    }
};
$adapter = new IdentifoldStorageAdapter($fake, $fake, $fake);
$reservation = new ReferenceReservation(
    '01890f8c-7b2a-7cc3-98b0-112233445566',
    'order',
    'ORD-0123-4567-89-P',
);
assert($adapter->referenceStore->reserve($reservation));
assert($adapter->referenceLookup->resolve($reservation->reference, $reservation->namespace)?->machineId
    === $reservation->machineId);
assert($adapter->sequenceAllocator->allocate(new SequenceAllocationRequest(
    $reservation->machineId,
    'receipt',
    'RCT',
    null,
    4,
)) === 1);
