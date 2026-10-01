#!/usr/bin/env python3
"""Read-only guard; rejects protected or unrelated branches."""
import subprocess
import sys
from pathlib import Path
repo = Path(__file__).resolve().parents[2]
branch = subprocess.check_output(["git", "branch", "--show-current"], cwd=repo, text=True).strip()
if branch != "feat/produccion":
    print("Blocked: expected feat/produccion, got " + (branch or "detached HEAD"), file=sys.stderr)
    sys.exit(1)
print("Branch OK: " + branch)
