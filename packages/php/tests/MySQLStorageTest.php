<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Greyfoundry\Identifold\Storage\MySQL\MySQLStorageAdapter;
use Greyfoundry\Identifold\Storage\ReferenceReservation;
use Greyfoundry\Identifold\Storage\SequenceAllocationRequest;

$databaseUrl = getenv('IDENTIFOLD_TEST_MYSQL_URL');
if ($databaseUrl === false) {
    exit(0);
}
$parts = parse_url($databaseUrl);
if (!is_array($parts)) {
    throw new RuntimeException('database URL');
}
$pdo = new PDO(
    sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $parts['host'],
        $parts['port'],
        ltrim($parts['path'], '/'),
    ),
    $parts['user'],
    $parts['pass'],
    [
        PDO::ATTR_EMULATE_PREPARES => false,
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    ],
);
foreach ([
    'identifold_sequence_allocations',
    'identifold_sequences',
    'identifold_references',
] as $table) {
    $pdo->exec('DELETE FROM ' . $table);
}

$adapter = new MySQLStorageAdapter($pdo);
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
