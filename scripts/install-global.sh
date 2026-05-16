#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_DIR="${GRADIENT_BIN_DIR:-$HOME/.local/bin}"
CONFIG_DIR="${GRADIENT_CONFIG_DIR:-$HOME/.gradient}"

mkdir -p "$BIN_DIR" "$CONFIG_DIR"

ln -sfn "$ROOT/bin/gradient" "$BIN_DIR/gradient"
cp "$ROOT/docs/gradient-machine-brief.md" "$CONFIG_DIR/AGENTS.md"

CONFIG="$CONFIG_DIR/config.yaml"
if [ ! -f "$CONFIG" ]; then
  cat > "$CONFIG" <<EOF
gradient_root: $ROOT
default_profile: solo-frontier
primitive_library:
  name: spellbook
  path: /Users/phaedrus/Development/spellbook
work:
  default_adapter: backlog-d
fleet:
  default_backend: codex-local
policy:
  eval_runner: scripts/eval-gradient.sh
EOF
  echo "created $CONFIG"
else
  echo "preserved $CONFIG"
fi

python3 - "$CONFIG_DIR/AGENTS.md" <<'PY'
from pathlib import Path
import os
import sys

brief = Path(sys.argv[1])
home = Path(os.environ["HOME"])
targets = [
    home / ".codex" / "AGENTS.md",
    home / ".claude" / "CLAUDE.md",
    home / ".opencode" / "AGENTS.md",
    home / ".pi" / "agent" / "AGENTS.md",
]
start = "<!-- BEGIN GRADIENT MANAGED BLOCK -->"
end = "<!-- END GRADIENT MANAGED BLOCK -->"
block = f"""{start}
## Gradient Availability

Gradient is installed on this machine. Before planning harness, work, fleet,
policy, context, or repository-onboarding changes, read `{brief}` and prefer
the `gradient` command when the current repo has `gradient.yaml`.

Useful commands:

```sh
gradient status
gradient resolve
gradient validate
gradient capture backlog.d/<work-item>.md
gradient eval
gradient close backlog.d/<work-item>.md
gradient init --profile solo-frontier /path/to/repo
```
{end}
"""

for target in targets:
    target.parent.mkdir(parents=True, exist_ok=True)
    existing = target.read_text() if target.exists() else "# AGENTS\n"
    if start in existing and end in existing:
        before = existing.split(start, 1)[0].rstrip()
        after = existing.split(end, 1)[1].lstrip()
        text = f"{before}\n\n{block}\n"
        if after:
            text += f"\n{after}"
    else:
        text = existing.rstrip() + "\n\n" + block + "\n"
    target.write_text(text)
    print(f"updated harness snippet: {target}")
PY

echo "installed gradient -> $BIN_DIR/gradient"
echo "installed machine brief -> $CONFIG_DIR/AGENTS.md"
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo "warning: $BIN_DIR is not on PATH"
fi
