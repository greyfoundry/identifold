from __future__ import annotations

import json
from typing import TypedDict

from identifold import (
    create_machine_id,
    parse_public_id,
    public_id_from_machine_id,
)


class ExampleIdentity(TypedDict):
    mid: str
    namespace: str
    pid: str
    roundTrip: bool


def build_identity() -> ExampleIdentity:
    machine_id = create_machine_id()
    public_id = public_id_from_machine_id(machine_id, "order")
    parsed = parse_public_id(public_id, "order")

    return {
        "mid": machine_id,
        "namespace": parsed.namespace,
        "pid": public_id,
        "roundTrip": parsed.machine_id == machine_id,
    }


if __name__ == "__main__":
    print(json.dumps(build_identity(), indent=2))
