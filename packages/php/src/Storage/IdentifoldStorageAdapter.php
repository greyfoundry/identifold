<?php

declare(strict_types=1);

namespace Greyfoundry\Identifold\Storage;

final readonly class IdentifoldStorageAdapter
{
    public function __construct(
        public ReferenceStore $referenceStore,
        public ReferenceLookup $referenceLookup,
        public SequenceAllocator $sequenceAllocator,
    ) {
    }
}
