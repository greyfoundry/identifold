<?php

declare(strict_types=1);

namespace Greyfoundry\Identifold\Storage;

interface SequenceAllocator
{
    public function allocate(SequenceAllocationRequest $request): int;
}
