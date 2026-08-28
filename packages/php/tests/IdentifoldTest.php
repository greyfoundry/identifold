<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/Identifold.php';

use Greyfoundry\Identifold\Identifold;

$mid = '019d4c72-c910-7a84-b313-53c3ac61a32f';
$pid = Identifold::publicIdFromMachineId($mid, 'order');
assert($pid === 'order_01kn675j8gfa2b64tkrep638sf');
$parsed = Identifold::parsePublicId($pid);
assert($parsed['machineId'] === $mid);
assert($parsed['namespace'] === 'order');
assert(Identifold::checkSymbol('0123456789', false) === 'P');
assert(Identifold::checkSymbol('2026001842', true) === 'M');
