<?php

declare(strict_types=1);

namespace Greyfoundry\Identifold;

final class IdentifoldException extends \InvalidArgumentException
{
    public function __construct(public readonly string $errorCode)
    {
        parent::__construct($errorCode);
    }
}

final class Identifold
{
    private const DATA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    private const CHECK = self::DATA . '*~$=U';
    private const TYPE_ID = '0123456789abcdefghjkmnpqrstvwxyz';

    public static function parseMachineId(string $input): string
    {
        $value = strtolower($input);
        if (preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/D', $value) !== 1) {
            throw self::error('invalid_mid');
        }
        if ($value[14] !== '7') {
            throw self::error('invalid_uuid_version');
        }
        if (!str_contains('89ab', $value[19])) {
            throw self::error('invalid_mid');
        }
        return $value;
    }

    public static function publicIdFromMachineId(string $machineId, string $namespace): string
    {
        if (preg_match('/^[a-z](?:[a-z_]{0,61}[a-z])?$/D', $namespace) !== 1) {
            throw self::error('invalid_public_prefix');
        }
        $hex = str_replace('-', '', self::parseMachineId($machineId));
        $bits = '00';
        foreach (str_split($hex, 2) as $byte) {
            $bits .= str_pad(decbin((int) hexdec($byte)), 8, '0', STR_PAD_LEFT);
        }
        $suffix = '';
        foreach (str_split($bits, 5) as $chunk) {
            $suffix .= self::TYPE_ID[bindec($chunk)];
        }
        return $namespace . '_' . $suffix;
    }

    /** @return array{value: string, namespace: string, machineId: string} */
    public static function parsePublicId(string $value): array
    {
        if ($value !== strtolower($value)) {
            throw self::error('invalid_pid');
        }
        $separator = strrpos($value, '_');
        if ($separator === false) {
            throw self::error('invalid_public_prefix');
        }
        $namespace = substr($value, 0, $separator);
        $suffix = substr($value, $separator + 1);
        if (preg_match('/^[a-z](?:[a-z_]{0,61}[a-z])?$/D', $namespace) !== 1) {
            throw self::error('invalid_public_prefix');
        }
        if (strlen($suffix) !== 26 || $suffix[0] > '7') {
            throw self::error('invalid_pid');
        }
        $bits = '';
        foreach (str_split($suffix) as $symbol) {
            $position = strpos(self::TYPE_ID, $symbol);
            if ($position === false) {
                throw self::error('invalid_pid');
            }
            $bits .= str_pad(decbin($position), 5, '0', STR_PAD_LEFT);
        }
        if (substr($bits, 0, 2) !== '00') {
            throw self::error('invalid_pid');
        }
        $hex = '';
        foreach (str_split(substr($bits, 2), 8) as $byte) {
            $hex .= str_pad(dechex(bindec($byte)), 2, '0', STR_PAD_LEFT);
        }
        $machineId = substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4)
            . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
        try {
            $machineId = self::parseMachineId($machineId);
        } catch (IdentifoldException) {
            throw self::error('invalid_pid');
        }
        return ['value' => $value, 'namespace' => $namespace, 'machineId' => $machineId];
    }

    public static function checkSymbol(string $payload, bool $sequential): string
    {
        $alphabet = $sequential ? '0123456789' : self::DATA;
        $base = $sequential ? 10 : 32;
        $remainder = 0;
        foreach (str_split($payload) as $symbol) {
            $position = strpos($alphabet, $symbol);
            if ($position === false) {
                throw self::error('invalid_ref_symbol');
            }
            $remainder = ($remainder * $base + $position) % 37;
        }
        return self::CHECK[$remainder];
    }

    /** @param list<array<string, mixed>> $registry @param list<int> $randomBytes */
    public static function createReferenceCandidate(array $registry, string $namespace, array $randomBytes): string
    {
        $reference = self::findNamespace($registry, $namespace)['reference'] ?? null;
        if (!is_array($reference) || ($reference['strategy'] ?? '') !== 'random') {
            throw self::error('unknown_namespace');
        }
        $length = self::profileLength((string) ($reference['profile'] ?? ''));
        if (count($randomBytes) < $length) {
            throw self::error('invalid_random_source');
        }
        $payload = '';
        for ($index = 0; $index < $length; $index++) {
            if ($randomBytes[$index] < 0 || $randomBytes[$index] > 255) {
                throw self::error('invalid_random_source');
            }
            $payload .= self::DATA[$randomBytes[$index] % 32];
        }
        return $reference['prefix'] . '-' . self::group($payload) . '-' . self::checkSymbol($payload, false);
    }

    /** @param list<array<string, mixed>> $registry */
    public static function formatSequentialReference(
        array $registry,
        string $namespace,
        string $sequence,
        string $scope = '',
    ): string {
        $reference = self::findNamespace($registry, $namespace)['reference'] ?? null;
        if (!is_array($reference) || ($reference['strategy'] ?? '') !== 'sequence') {
            throw self::error('unknown_namespace');
        }
        $width = (int) $reference['width'];
        if (!ctype_digit($sequence) || strlen($sequence) > $width) {
            throw self::error('sequence_overflow');
        }
        $padded = str_pad($sequence, $width, '0', STR_PAD_LEFT);
        $payload = $scope . $padded;
        return $reference['prefix'] . '-' . ($scope === '' ? '' : $scope . '-')
            . $padded . '-' . self::checkSymbol($payload, true);
    }

    /** @param list<array<string, mixed>> $registry */
    public static function normalize(string $value, array $registry): string
    {
        if (str_contains($value, '_')) {
            $parsed = self::parsePublicId($value);
            self::findNamespace($registry, $parsed['namespace']);
            return $parsed['value'];
        }
        if (strlen($value) === 36) {
            return self::parseMachineId($value);
        }
        $compact = str_replace('-', '', strtoupper($value));
        $definition = null;
        foreach ($registry as $candidate) {
            $prefix = $candidate['reference']['prefix'] ?? null;
            if (is_string($prefix) && str_starts_with($compact, $prefix)) {
                $definition = $candidate;
                break;
            }
        }
        if ($definition === null) {
            throw self::error(preg_match('/^[A-Za-z]{2,8}/', $value) === 1 ? 'unknown_namespace' : 'invalid_kind');
        }
        $reference = $definition['reference'];
        $body = substr($compact, strlen($reference['prefix']));
        if (str_contains($body, '?') || str_contains($body, '_')) {
            throw self::error('invalid_ref');
        }
        if ($reference['strategy'] === 'sequence') {
            $scopeLength = ($reference['scope'] ?? '') === 'calendar-year' ? 4 : 0;
            if (strlen($body) !== $scopeLength + (int) $reference['width'] + 1) {
                throw self::error('invalid_ref_length');
            }
            $payload = substr($body, 0, -1);
            if (self::checkSymbol($payload, true) !== $body[-1]) {
                throw self::error('invalid_checksum');
            }
            return self::formatSequentialReference(
                $registry,
                $definition['publicPrefix'],
                substr($payload, $scopeLength),
                substr($payload, 0, $scopeLength),
            );
        }
        $length = self::profileLength((string) ($reference['profile'] ?? ''));
        if (strlen($body) !== $length + 1) {
            throw self::error('invalid_ref_length');
        }
        $payload = strtr(substr($body, 0, $length), ['O' => '0', 'I' => '1', 'L' => '1']);
        if (self::checkSymbol($payload, false) !== $body[-1]) {
            throw self::error('invalid_checksum');
        }
        return $reference['prefix'] . '-' . self::group($payload) . '-' . $body[-1];
    }

    /** @param list<array<string, mixed>> $registry @return array<string, mixed> */
    private static function findNamespace(array $registry, string $namespace): array
    {
        foreach ($registry as $definition) {
            if (($definition['publicPrefix'] ?? null) === $namespace) {
                return $definition;
            }
        }
        throw self::error('unknown_namespace');
    }

    private static function profileLength(string $profile): int
    {
        return match ($profile) {
            'compact' => 8,
            'high' => 12,
            default => 10,
        };
    }

    private static function group(string $value): string
    {
        return implode('-', str_split($value, 4));
    }

    private static function error(string $code): IdentifoldException
    {
        return new IdentifoldException($code);
    }
}
