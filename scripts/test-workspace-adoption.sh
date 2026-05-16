#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_ROOT="${TMPDIR:-/tmp}/gradient-workspace-adoption-test-$$"

cleanup() {
  rm -rf "$TMP_ROOT"
}
trap cleanup EXIT

mkdir -p "$TMP_ROOT"

git -C "$TMP_ROOT" init source >/dev/null
git -C "$TMP_ROOT/source" config user.email gradient@example.invalid
git -C "$TMP_ROOT/source" config user.name "Gradient Test"
printf "# Fixture\n" > "$TMP_ROOT/source/README.md"
git -C "$TMP_ROOT/source" add README.md
git -C "$TMP_ROOT/source" commit -m "seed" >/dev/null
git -C "$TMP_ROOT/source" worktree add "$TMP_ROOT/linked" >/dev/null

mkdir -p \
  "$TMP_ROOT/linked/.agents/skills/existing-skill" \
  "$TMP_ROOT/linked/.claude/skills" \
  "$TMP_ROOT/linked/.codex/skills" \
  "$TMP_ROOT/linked/.pi/skills" \
  "$TMP_ROOT/linked/backlog.d"
printf "source: existing\n" > "$TMP_ROOT/linked/.agents/skills/existing-skill/.spellbook"
printf -- "---\nname: existing-skill\n---\n# Existing Skill\n" > "$TMP_ROOT/linked/.agents/skills/existing-skill/SKILL.md"
ln -s ../../.agents/skills/existing-skill "$TMP_ROOT/linked/.claude/skills/existing-skill"
ln -s ../../.agents/skills/existing-skill "$TMP_ROOT/linked/.codex/skills/existing-skill"
ln -s ../../.agents/skills/existing-skill "$TMP_ROOT/linked/.pi/skills/existing-skill"
cat > "$TMP_ROOT/linked/backlog.d/README.md" <<'EOF'
# Backlog Notes
EOF
cat > "$TMP_ROOT/linked/backlog.d/003-existing-ticket.md" <<'EOF'
# Existing Ticket

Priority: high
Status: done

## Oracle

- [ ] Preserve the original body.
EOF

"$ROOT/scripts/gradient.sh" init --profile solo-frontier "$TMP_ROOT/linked" > "$TMP_ROOT/init.txt"

grep -Eq "resolved git worktree root: .*/linked" "$TMP_ROOT/init.txt"
grep -q "detected shared skill root: .agents/skills" "$TMP_ROOT/init.txt"
test -d "$TMP_ROOT/linked/.agents/skills/gradient-contracts"
test ! -d "$TMP_ROOT/linked/.agent/skills"
grep -q "shared_skill_root: .agents/skills" "$TMP_ROOT/linked/gradient.yaml"

(
  cd "$TMP_ROOT/linked"
  ./scripts/gradient.sh work adopt backlog.d > "$TMP_ROOT/adopt.txt"
  grep -q "backlog.d/README.md.*skip.*non-ticket markdown" "$TMP_ROOT/adopt.txt"
  grep -q "backlog.d/003-existing-ticket.md.*adopt.*done" "$TMP_ROOT/adopt.txt"
  grep -q "Preserve the original body." backlog.d/003-existing-ticket.md
  ./scripts/gradient.sh feedback report \
    --module Work \
    --classification work-adapter \
    --severity high \
    --summary "Synthetic feedback route" \
    --expected "Feedback routes to backlog" \
    --actual "No route existed before this fixture" \
    --evidence "synthetic fixture" \
    --route backlog > "$TMP_ROOT/feedback.txt"
  grep -q "routed feedback to backlog" "$TMP_ROOT/feedback.txt"
  ./scripts/gradient.sh feedback list --status routed > "$TMP_ROOT/feedback-list.txt"
  grep -q "Synthetic feedback route" "$TMP_ROOT/feedback-list.txt"
  ./scripts/gradient.sh resolve
  ./scripts/gradient.sh validate
)

echo "workspace adoption regression passed"
