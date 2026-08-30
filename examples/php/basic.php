<?php

declare(strict_types=1);

require __DIR__ . '/vendor/autoload.php';

use Greyfoundry\Identifold\Identifold;

$mid = '019d4c72-c910-7a84-b313-53c3ac61a32f';
$pid = Identifold::publicIdFromMachineId($mid, 'order');
$parsed = Identifold::parsePublicId($pid);
$roundTrip = $parsed['machineId'] === $mid;

if (!$roundTrip) {
    throw new RuntimeException('MID/PID round trip failed.');
}

echo json_encode([
    'mid' => $mid,
    'namespace' => $parsed['namespace'],
    'pid' => $pid,
    'roundTrip' => $roundTrip,
], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR), PHP_EOL;
