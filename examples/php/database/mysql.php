<?php

declare(strict_types=1);

require_once __DIR__ . '/../vendor/autoload.php';

use Greyfoundry\Identifold\Storage\MySQL\MySQLStorageAdapter;
use Greyfoundry\Identifold\Storage\ReferenceReservation;

$parts = parse_url((string) getenv('IDENTIFOLD_TEST_MYSQL_URL'));
if (!is_array($parts)) {
    throw new RuntimeException('IDENTIFOLD_TEST_MYSQL_URL is required');
}
$connection = new PDO(
    sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
        $parts['host'],
        $parts['port'],
        ltrim($parts['path'], '/'),
    ),
    $parts['user'],
    $parts['pass'],
    [PDO::ATTR_EMULATE_PREPARES => false, PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION],
);
$adapter = new MySQLStorageAdapter($connection);
$request = new ReferenceReservation(
    '01890f8c-7b2a-7cc3-98b0-112233445568',
    'order',
    'ORD-9876-5432-10-X',
);
$reserved = $adapter->reserve($request);
$mapping = $adapter->resolve($request->reference, $request->namespace);
echo json_encode(['reserved' => $reserved, 'mapping' => $mapping], JSON_THROW_ON_ERROR), PHP_EOL;
