<?php

declare(strict_types=1);

namespace Greyfoundry\Identifold\Storage;

final readonly class ReferenceMapping
{
    public function __construct(
        public string $machineId,
        public string $namespace,
    ) {
    }
}
