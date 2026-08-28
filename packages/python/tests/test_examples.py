from __future__ import annotations

import runpy
from pathlib import Path

ROOT = Path(__file__).parents[3]


def test_production_example_round_trips_identity() -> None:
    example = runpy.run_path(ROOT / "examples" / "python" / "basic.py")
    identity = example["build_identity"]()

    assert identity["namespace"] == "order"
    assert identity["pid"].startswith("order_")
    assert identity["roundTrip"] is True
