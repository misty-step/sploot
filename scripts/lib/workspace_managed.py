from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
from datetime import datetime, timezone

import yaml

MANIFEST_PATH = pathlib.Path(".gradient/managed-manifest.json")
MANIFEST_VERSION = 1
MANAGED_DIRS = ["schemas", "profiles", "standards", "evals", "scripts"]
MANAGED_TOP_LEVEL = ["gradient.yaml.example", "requirements.txt"]


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    if path.is_symlink():
        digest.update(b"symlink:")
        digest.update(os.readlink(path).encode())
        return digest.hexdigest()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def rel(path: pathlib.Path, root: pathlib.Path) -> str:
    return str(path.relative_to(root))


def source_version(source_root: pathlib.Path) -> str:
    proc = subprocess.run(
        ["git", "-C", str(source_root), "rev-parse", "--short=12", "HEAD"],
        text=True,
        capture_output=True,
        check=False,
    )
    if proc.returncode == 0:
        return proc.stdout.strip()
    return "unknown"


def load_yaml(path: pathlib.Path) -> dict:
    with path.open() as fh:
        return yaml.safe_load(fh)


def parse_source_skills(source_root: pathlib.Path) -> list[str]:
    profile = load_yaml(source_root / "gradient.yaml")
    return list(profile.get("harness", {}).get("skills", []))


def source_shared_roots(source_root: pathlib.Path) -> list[pathlib.Path]:
    roots: list[pathlib.Path] = []
    profile = source_root / "gradient.yaml"
    if profile.exists():
        data = load_yaml(profile)
        shared = data.get("harness", {}).get("shared_skill_root")
        if shared:
            roots.append(source_root / shared)
    for candidate in [source_root / ".agents" / "skills", source_root / ".agent" / "skills"]:
        if candidate not in roots:
            roots.append(candidate)
    return roots


def target_shared_root(target_root: pathlib.Path) -> pathlib.Path:
    profile = target_root / "gradient.yaml"
    if profile.exists():
        data = load_yaml(profile)
        shared = data.get("harness", {}).get("shared_skill_root")
        if shared:
            return target_root / shared
    return target_root / ".agents" / "skills"


def iter_files(root: pathlib.Path) -> list[pathlib.Path]:
    if not root.exists():
        return []
    return sorted(path for path in root.rglob("*") if path.is_file() or path.is_symlink())


def add_candidate(candidates: list[dict], source_root: pathlib.Path, target_root: pathlib.Path, source_path: pathlib.Path, target_path: pathlib.Path) -> None:
    if not source_path.exists() and not source_path.is_symlink():
        return
    candidates.append(
        {
            "source_path": rel(source_path, source_root),
            "target_path": rel(target_path, target_root),
            "kind": "symlink" if source_path.is_symlink() else "file",
            "owner": "gradient-managed",
            "policy": "update-if-unchanged",
        }
    )


def managed_candidates(source_root: pathlib.Path, target_root: pathlib.Path) -> list[dict]:
    candidates: list[dict] = []
    for directory in MANAGED_DIRS:
        source_dir = source_root / directory
        for source_path in iter_files(source_dir):
            add_candidate(
                candidates,
                source_root,
                target_root,
                source_path,
                target_root / rel(source_path, source_root),
            )

    for name in MANAGED_TOP_LEVEL:
        add_candidate(candidates, source_root, target_root, source_root / name, target_root / name)

    source_agents = source_root / "AGENTS.md"
    if (target_root / "AGENTS.gradient.md").exists():
        add_candidate(candidates, source_root, target_root, source_agents, target_root / "AGENTS.gradient.md")
    elif (target_root / "AGENTS.md").exists() and sha256(target_root / "AGENTS.md") == sha256(source_agents):
        add_candidate(candidates, source_root, target_root, source_agents, target_root / "AGENTS.md")

    shared = target_shared_root(target_root)
    source_roots = source_shared_roots(source_root)
    for skill in parse_source_skills(source_root):
        source_skill = next((root / skill for root in source_roots if (root / skill).exists()), None)
        if source_skill is None:
            continue
        for source_path in iter_files(source_skill):
            add_candidate(
                candidates,
                source_root,
                target_root,
                source_path,
                shared / skill / rel(source_path, source_skill),
            )

    deduped: dict[str, dict] = {}
    for candidate in candidates:
        deduped[candidate["target_path"]] = candidate
    return [deduped[key] for key in sorted(deduped)]


def load_manifest(target_root: pathlib.Path) -> dict:
    path = target_root / MANIFEST_PATH
    if not path.exists():
        return {"schema_version": MANIFEST_VERSION, "files": []}
    with path.open() as fh:
        return json.load(fh)


def manifest_entry(source_root: pathlib.Path, target_root: pathlib.Path, candidate: dict) -> dict:
    source_path = source_root / candidate["source_path"]
    target_path = target_root / candidate["target_path"]
    entry = dict(candidate)
    entry["source_sha256"] = sha256(source_path)
    entry["target_sha256"] = sha256(target_path)
    return entry


def write_manifest(source_root: pathlib.Path, target_root: pathlib.Path) -> dict:
    files = []
    for candidate in managed_candidates(source_root, target_root):
        target_path = target_root / candidate["target_path"]
        source_path = source_root / candidate["source_path"]
        if not target_path.exists() and not target_path.is_symlink():
            continue
        if sha256(target_path) != sha256(source_path):
            continue
        files.append(manifest_entry(source_root, target_root, candidate))

    manifest = {
        "schema_version": MANIFEST_VERSION,
        "source_root": str(source_root),
        "source_version": source_version(source_root),
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "files": files,
        "repo_owned": [
            "gradient.yaml",
            "backlog.d",
            ".gradient/sources.local.yaml",
            ".gradient/private",
            ".gradient/context",
            ".gradient/evidence",
            ".gradient/feedback",
            ".gradient/policy",
            ".gradient/runs",
        ],
    }
    path = target_root / MANIFEST_PATH
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def copy_candidate(source_root: pathlib.Path, target_root: pathlib.Path, candidate: dict) -> None:
    source_path = source_root / candidate["source_path"]
    target_path = target_root / candidate["target_path"]
    target_path.parent.mkdir(parents=True, exist_ok=True)
    if target_path.exists() or target_path.is_symlink():
        if target_path.is_dir():
            shutil.rmtree(target_path)
        else:
            target_path.unlink()
    if source_path.is_symlink():
        target_path.symlink_to(os.readlink(source_path))
    else:
        shutil.copy2(source_path, target_path)


def plan_upgrade(source_root: pathlib.Path, target_root: pathlib.Path) -> list[dict]:
    manifest = load_manifest(target_root)
    prior = {item["target_path"]: item for item in manifest.get("files", [])}
    plan = []
    for candidate in managed_candidates(source_root, target_root):
        source_path = source_root / candidate["source_path"]
        target_path = target_root / candidate["target_path"]
        prior_entry = prior.get(candidate["target_path"])
        source_hash = sha256(source_path)
        exists = target_path.exists() or target_path.is_symlink()
        target_hash = sha256(target_path) if exists else ""

        action = "add"
        reason = "missing managed target"
        if exists and prior_entry is None:
            if target_hash == source_hash:
                action = "preserve"
                reason = "matches source but was not in manifest"
            else:
                action = "preserve"
                reason = "target exists and is not managed"
        elif exists and target_hash != prior_entry.get("target_sha256"):
            action = "conflict"
            reason = "target changed since last managed manifest"
        elif exists and target_hash == source_hash:
            action = "preserve"
            reason = "already current"
        elif exists:
            action = "update"
            reason = "managed target unchanged; source changed"

        plan.append(
            {
                **candidate,
                "action": action,
                "reason": reason,
                "source_sha256": source_hash,
                "target_sha256": target_hash,
                "prior_target_sha256": prior_entry.get("target_sha256") if prior_entry else "",
            }
        )
    return plan


def print_plan(source_root: pathlib.Path, target_root: pathlib.Path, plan: list[dict], mode: str) -> None:
    counts = {action: sum(1 for item in plan if item["action"] == action) for action in ["add", "update", "preserve", "conflict"]}
    print(f"Gradient workspace upgrade ({mode})")
    print(f"source: {source_root}")
    print(f"target: {target_root}")
    print(
        "summary: "
        + ", ".join(f"{name}={counts[name]}" for name in ["add", "update", "preserve", "conflict"])
    )
    for action in ["conflict", "update", "add", "preserve"]:
        items = [item for item in plan if item["action"] == action]
        if not items:
            continue
        print(f"\n{action}:")
        for item in items:
            print(f"  {item['target_path']} <- {item['source_path']} ({item['reason']})")


def command_manifest(args: argparse.Namespace) -> int:
    source_root = pathlib.Path(args.source_root).resolve()
    target_root = pathlib.Path(args.target_root).resolve()
    manifest = write_manifest(source_root, target_root)
    print(f"write {target_root / MANIFEST_PATH} ({len(manifest['files'])} files)")
    return 0


def command_upgrade(args: argparse.Namespace) -> int:
    source_root = pathlib.Path(args.source_root).resolve()
    target_root = pathlib.Path(args.target_root).resolve()
    plan = plan_upgrade(source_root, target_root)
    mode = "apply" if args.apply else "dry-run"
    print_plan(source_root, target_root, plan, mode)
    conflicts = [item for item in plan if item["action"] == "conflict"]
    if args.apply and conflicts:
        print("\nrefusing to apply with conflicts", file=sys.stderr)
        return 2
    if args.apply:
        for item in plan:
            if item["action"] in {"add", "update"}:
                copy_candidate(source_root, target_root, item)
        manifest = write_manifest(source_root, target_root)
        print(f"\nwrite {target_root / MANIFEST_PATH} ({len(manifest['files'])} files)")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    manifest = sub.add_parser("write-manifest")
    manifest.add_argument("source_root")
    manifest.add_argument("target_root")
    manifest.set_defaults(func=command_manifest)

    upgrade = sub.add_parser("upgrade")
    upgrade.add_argument("--apply", action="store_true")
    upgrade.add_argument("source_root")
    upgrade.add_argument("target_root")
    upgrade.set_defaults(func=command_upgrade)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
