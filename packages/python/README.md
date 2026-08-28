# identifold

Python implementation of the Identifold wire specification. This package is pre-release and currently exists as an independent consumer of the language-neutral conformance suite.

```python
from identifold import NamespaceRegistry, create_machine_id, public_id_from_machine_id

registry = NamespaceRegistry([{"publicPrefix": "user"}])
mid = create_machine_id()
pid = public_id_from_machine_id(mid, "user")
```

UUIDv7 generation uses `uuid6`; TypeID encoding uses `typeid-python`. REF behavior is implemented from the published Identifold specification and judged by the same vectors as the TypeScript package.

Release automation must build a wheel and source distribution, run the complete conformance manifest on Python 3.12–3.14, and publish with trusted provenance. Vulnerabilities should be reported through the repository's private security-advisory channel. Supported-version policy follows the root security policy.
