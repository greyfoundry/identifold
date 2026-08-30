<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Greyfoundry\Identifold\Storage\Postgres\PostgresStorageAdapter;
use Greyfoundry\Identifold\Storage\ReferenceReservation;

$parts = parse_url((string) getenv('DATABASE_URL'));
if (!is_array($parts)) {
    throw new RuntimeException('DATABASE_URL is required');
}
$connection = new PDO(
    sprintf('pgsql:host=%s;port=%d;dbname=%s', $parts['host'], $parts['port'], ltrim($parts['path'], '/')),
    $parts['user'],
    $parts['pass'],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
);
$adapter = new PostgresStorageAdapter($connection);
$request = new ReferenceReservation(
    '01890f8c-7b2a-7cc3-98b0-112233445566',
    'order',
    'ORD-0123-4567-89-P',
);
$reserved = $adapter->reserve($request);
$mapping = $adapter->resolve($request->reference, $request->namespace);
echo json_encode(['reserved' => $reserved, 'mapping' => $mapping], JSON_THROW_ON_ERROR), PHP_EOL;
