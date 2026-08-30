<?php

declare(strict_types=1);

namespace Greyfoundry\Identifold\Storage;

final readonly class ReferenceReservation
{
    public function __construct(
        public string $machineId,
        public string $namespace,
        public string $reference,
    ) {
    }
}
