"""Identifold conformance adapter launcher for Ruby."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parents[1]
RUBY = os.environ.get("IDENTIFOLD_RUBY", "ruby")
result = subprocess.run(
    [RUBY, str(ROOT / "packages" / "ruby" / "bin" / "adapter.rb")],
    input=sys.stdin.read(),
    check=False,
    capture_output=True,
    text=True,
)
sys.stdout.write(result.stdout)
sys.stderr.write(result.stderr)
raise SystemExit(result.returncode)
