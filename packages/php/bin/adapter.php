<?php

declare(strict_types=1);

require_once __DIR__ . '/../src/Identifold.php';

use Greyfoundry\Identifold\Identifold;
use Greyfoundry\Identifold\IdentifoldException;

$request = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
$registry = $request['registry'] ?? [];

try {
    $value = match ($request['operation']) {
        'parseMachineId' => Identifold::parseMachineId($request['input']),
        'publicIdFromMachineId' => Identifold::publicIdFromMachineId($request['machineId'], $request['namespace']),
        'parsePublicId' => Identifold::parsePublicId($request['input']),
        'createReferenceCandidate' => Identifold::createReferenceCandidate(
            $registry,
            $request['namespace'],
            $request['randomBytes'],
        ),
        'formatSequentialReference' => Identifold::formatSequentialReference(
            $registry,
            $request['namespace'],
            $request['sequence'],
            $request['scope'] ?? '',
        ),
        'normalize', 'parseReference', 'inspect' => Identifold::normalize($request['input'], $registry),
        default => throw new RuntimeException('Unsupported operation'),
    };
    echo json_encode(['ok' => true, 'value' => $value], JSON_THROW_ON_ERROR);
} catch (IdentifoldException $exception) {
    echo json_encode(['ok' => false, 'errorCode' => $exception->errorCode], JSON_THROW_ON_ERROR);
}
