# Identifold for PHP

[![Packagist](https://img.shields.io/packagist/v/greyfoundry/identifold?logo=packagist)](https://packagist.org/packages/greyfoundry/identifold)
[![Languages CI](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml)
[![PHP](https://img.shields.io/packagist/dependency-v/greyfoundry/identifold/php?logo=php)](composer.json)

The Composer package implements the stable Identifold 1.0 MID, PID, and REF wire contract for PHP 8.2 and later.

## Install

```console
composer require greyfoundry/identifold:^1.0
```

## Quick start

```php
use Greyfoundry\Identifold\Identifold;

$mid = '019d4c72-c910-7a84-b313-53c3ac61a32f';
$pid = Identifold::publicIdFromMachineId($mid, 'order');
$parsed = Identifold::parsePublicId($pid);
```

## Verification

```console
composer validate --strict
php -d zend.assertions=1 -d assert.exception=1 tests/IdentifoldTest.php
```

The dependency-free core and JSON adapter are exercised by the complete [language-neutral conformance suite](https://github.com/greyfoundry/identifold/tree/main/conformance). Version 1.0.0 is live through Packagist and the public [PHP split repository](https://github.com/greyfoundry/identifold-php).
