"""Identifold conformance adapter launcher for PHP."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parents[1]
PHP = os.environ.get("IDENTIFOLD_PHP", "php")
result = subprocess.run(
    [PHP, str(ROOT / "packages" / "php" / "bin" / "adapter.php")],
    input=sys.stdin.read(),
    check=False,
    capture_output=True,
    text=True,
)
sys.stdout.write(result.stdout)
sys.stderr.write(result.stderr)
raise SystemExit(result.returncode)
