<?php

declare(strict_types=1);

namespace Greyfoundry\Identifold\Storage;

final readonly class SequenceAllocationRequest
{
    public function __construct(
        public string $machineId,
        public string $namespace,
        public string $referencePrefix,
        public ?string $scope,
        public int $width,
    ) {
    }
}
