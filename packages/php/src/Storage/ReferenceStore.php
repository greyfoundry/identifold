<?php

declare(strict_types=1);

namespace Greyfoundry\Identifold\Storage;

interface ReferenceStore
{
    public function reserve(ReferenceReservation $request): bool;
}
