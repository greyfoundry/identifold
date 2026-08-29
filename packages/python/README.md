# identifold

[![PyPI](https://img.shields.io/pypi/v/identifold?logo=pypi)](https://pypi.org/project/identifold/)
[![Python CI](https://github.com/greyfoundry/identifold/actions/workflows/python.yml/badge.svg?branch=main)](https://github.com/greyfoundry/identifold/actions/workflows/python.yml)
[![Python versions](https://img.shields.io/pypi/pyversions/identifold?logo=python)](https://pypi.org/project/identifold/)

Python implementation of the stable Identifold 1.0 wire specification and an independent consumer of the language-neutral conformance suite.

## Install

```console
python -m pip install identifold
```

## Quick start

```python
from identifold import NamespaceRegistry, create_machine_id, public_id_from_machine_id

registry = NamespaceRegistry([{"publicPrefix": "user"}])
mid = create_machine_id()
pid = public_id_from_machine_id(mid, "user")
```

UUIDv7 generation uses `uuid6`; TypeID encoding uses `typeid-python`. REF behavior is implemented from the published Identifold specification and judged by the same vectors as the TypeScript package.

## Verification

```console
python -m pip install -e ".[test]"
python -m pytest tests -q
```

Release automation builds a wheel and source distribution, tests Python 3.12–3.14, runs the complete conformance manifest, and publishes with trusted provenance. Version 1.0.0 is live on PyPI. Vulnerabilities should be reported through the repository's [private security-advisory channel](https://github.com/greyfoundry/identifold/security/advisories/new).
