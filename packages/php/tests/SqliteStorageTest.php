<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Greyfoundry\Identifold\Storage\ReferenceReservation;
use Greyfoundry\Identifold\Storage\SequenceAllocationRequest;
use Greyfoundry\Identifold\Storage\Sqlite\SqliteStorageAdapter;

$pdo = new PDO('sqlite::memory:', options: [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$root = dirname(__DIR__, 3);
$migration = file_get_contents(
    $root . '/integrations/sqlite/migrations/001_identifold.up.sql',
);
if ($migration === false) {
    throw new RuntimeException('sqlite migration');
}
$pdo->exec($migration);

$adapter = new SqliteStorageAdapter($pdo);
$randomMid = '01890f8c-7b2a-7cc3-98b0-112233445566';
$randomRef = 'ORD-0123-4567-89-P';
assert($adapter->reserve(new ReferenceReservation($randomMid, 'order', $randomRef)));
assert(!$adapter->reserve(new ReferenceReservation(
    '01890f8c-7b2a-7cc3-98b0-112233445569',
    'order',
    $randomRef,
)));
assert($adapter->resolve($randomRef, 'order')?->machineId === $randomMid);
assert($pdo->query('SELECT hex(machine_id) FROM identifold_references')?->fetchColumn()
    === strtoupper(str_replace('-', '', $randomMid)));

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
