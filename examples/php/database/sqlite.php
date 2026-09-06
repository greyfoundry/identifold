<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Greyfoundry\Identifold\Storage\ReferenceReservation;
use Greyfoundry\Identifold\Storage\Sqlite\SqliteStorageAdapter;

$connection = new PDO('sqlite::memory:', options: [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$migration = file_get_contents(__DIR__ . '/../../../integrations/sqlite/migrations/001_identifold.up.sql');
if ($migration === false) {
    throw new RuntimeException('SQLite migration is unavailable');
}
$connection->exec($migration);
$adapter = new SqliteStorageAdapter($connection);
$request = new ReferenceReservation(
    '01890f8c-7b2a-7cc3-98b0-112233445566',
    'order',
    'ORD-0123-4567-89-P',
);
$reserved = $adapter->reserve($request);
$mapping = $adapter->resolve($request->reference, $request->namespace);
echo json_encode(['reserved' => $reserved, 'mapping' => $mapping], JSON_THROW_ON_ERROR), PHP_EOL;
