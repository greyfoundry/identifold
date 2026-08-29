# Identifold for Ruby

[![RubyGems](https://img.shields.io/gem/v/identifold?logo=rubygems)](https://rubygems.org/gems/identifold)
[![Languages CI](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/languages.yml)
[![Ruby](https://img.shields.io/badge/Ruby-%E2%89%A53.2-CC342D?logo=ruby)](identifold.gemspec)

The Ruby gem implements the stable Identifold 1.0 MID, PID, and REF wire contract for Ruby 3.2 and later.

## Install

```console
gem install identifold -v 1.0.0
```

## Quick start

```ruby
require "identifold"

pid = Identifold.public_id_from_machine_id(mid, "order")
parsed = Identifold.parse_public_id(pid)
```

## Verification

```console
ruby test/identifold_test.rb
gem build identifold.gemspec
```

The dependency-free core and JSON adapter are exercised by the complete [language-neutral conformance suite](https://github.com/greyfoundry/identifold/tree/main/conformance). Version 1.0.0 is live on RubyGems.
