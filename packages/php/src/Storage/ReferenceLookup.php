<?php

declare(strict_types=1);

namespace Greyfoundry\Identifold\Storage;

interface ReferenceLookup
{
    public function resolve(string $reference, string $namespace): ?ReferenceMapping;
}
