<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Greyfoundry\Identifold\Storage\Postgres\PostgresStorageAdapter;
use Greyfoundry\Identifold\Storage\ReferenceReservation;
use Greyfoundry\Identifold\Storage\SequenceAllocationRequest;

$databaseUrl = getenv('IDENTIFOLD_TEST_DATABASE_URL');
if ($databaseUrl === false) {
    exit(0);
}
$parts = parse_url($databaseUrl);
if (!is_array($parts)) {
    throw new RuntimeException('database URL');
}
$pdo = new PDO(
    sprintf(
        'pgsql:host=%s;port=%d;dbname=%s',
        $parts['host'],
        $parts['port'],
        ltrim($parts['path'], '/'),
    ),
    $parts['user'],
    $parts['pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
);
$root = dirname(__DIR__, 3);
foreach ([
    '001_identifold.down.sql',
    '001_identifold.up.sql',
    '003_idempotent_replay.up.sql',
    '004_reference_lookup.up.sql',
] as $migration) {
    $pdo->exec(file_get_contents(
        $root . '/integrations/postgres/migrations/' . $migration,
    ));
}

$adapter = new PostgresStorageAdapter($pdo);
$randomMid = '01890f8c-7b2a-7cc3-98b0-112233445566';
$randomRef = 'ORD-0123-4567-89-P';
assert($adapter->reserve(new ReferenceReservation($randomMid, 'order', $randomRef)));
assert($adapter->resolve($randomRef, 'order')?->machineId === $randomMid);
$request = new SequenceAllocationRequest(
    '01890f8c-7b2a-7cc3-98b0-112233445567',
    'receipt',
    'RCT',
    null,
    4,
);
assert($adapter->allocate($request) === 1);
assert($adapter->allocate($request) === 1);
assert($adapter->resolve('RCT-0001-1', 'receipt')?->machineId === $request->machineId);
