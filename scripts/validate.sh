#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT"

# shellcheck source=scripts/lib/python-deps.sh
source "$ROOT/scripts/lib/python-deps.sh"
gradient_python_deps_preflight

python3 - <<'PY'
from __future__ import annotations

import json
import pathlib
import re
import subprocess
import sys

import jsonschema
import yaml

ROOT = pathlib.Path.cwd()
TRACE_BACKENDS = {"local", "raindrop", "langfuse", "helicone", "otlp"}
SAFE_TRACE_REDACTIONS = {"synthetic", "redacted", "redacted-export", "public-safe"}
RAW_TRACE_SUFFIXES = {".db", ".sqlite", ".sqlite3"}


def rel(path: pathlib.Path) -> str:
    return str(path.relative_to(ROOT))


def load_json(path: pathlib.Path) -> object:
    with path.open() as fh:
        return json.load(fh)


def load_schema(name: str) -> dict:
    return load_json(ROOT / "schemas" / name)  # type: ignore[return-value]


def validate_json(path: pathlib.Path, schema_name: str) -> dict:
    data = load_json(path)
    schema = load_schema(schema_name)
    validation_data = dict(data)
    validation_data.pop("$schema", None)
    jsonschema.Draft202012Validator(schema).validate(validation_data)
    print(f"ok schema {rel(path)}")
    return data  # type: ignore[return-value]


def deep_merge(base: dict, overlay: dict) -> dict:
    merged = dict(base)
    for key, value in overlay.items():
        if key == "extends":
            continue
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = value
    return merged


def load_profile(path: pathlib.Path) -> dict:
    with path.open() as fh:
        data = yaml.safe_load(fh)
    parent_name = data.get("extends")
    if parent_name:
        parent_path = ROOT / "profiles" / f"{parent_name}.yaml"
        if not parent_path.exists():
            raise AssertionError(f"{rel(path)} extends missing profile {parent_name}")
        parent = load_profile(parent_path)
        data = deep_merge(parent, data)
        data["extends"] = parent_name
    return data


def validate_yaml_profile(path: pathlib.Path) -> None:
    data = load_profile(path)
    schema = load_schema("gradient.schema.json")
    jsonschema.Draft202012Validator(schema).validate(data)
    print(f"ok profile {rel(path)}")


def validate_standards_manifest(path: pathlib.Path) -> dict:
    with path.open() as fh:
        data = yaml.safe_load(fh)
    schema = load_schema("standards-manifest.schema.json")
    jsonschema.Draft202012Validator(schema).validate(data)
    print(f"ok standards-manifest {rel(path)}")
    return data


def validate_profile_standards(path: pathlib.Path, manifests: dict[str, dict]) -> None:
    data = load_profile(path)
    standards = data.get("standards")
    if not standards:
        return

    selected_manifests = []
    for manifest_path in standards["manifests"]:
        full_path = ROOT / manifest_path
        if not full_path.exists():
            raise AssertionError(f"{rel(path)} references missing standards manifest {manifest_path}")
        manifest = manifests.get(manifest_path)
        if manifest is None:
            raise AssertionError(f"{rel(path)} references unvalidated standards manifest {manifest_path}")
        selected_manifests.append(manifest)

    known_policy_packs = {pack for manifest in selected_manifests for pack in manifest["policy_packs"]}
    known_harness_packs = {pack for manifest in selected_manifests for pack in manifest["harness_packs"]}
    missing_policy = sorted(set(standards["policy_packs"]) - known_policy_packs)
    missing_harness = sorted(set(standards["harness_packs"]) - known_harness_packs)
    if missing_policy:
        raise AssertionError(f"{rel(path)} selects unknown policy packs {missing_policy}")
    if missing_harness:
        raise AssertionError(f"{rel(path)} selects unknown harness packs {missing_harness}")

    manifest_exception_fields = {
        field
        for manifest in selected_manifests
        for field in manifest["exception_policy"]["required_fields"]
    }
    selected_exception_fields = set(standards["exception_policy"]["required_fields"])
    if not selected_exception_fields >= manifest_exception_fields:
        missing_fields = sorted(manifest_exception_fields - selected_exception_fields)
        raise AssertionError(f"{rel(path)} exception policy omits required fields {missing_fields}")

    print(
        "ok standards "
        f"{rel(path)} baseline={standards['baseline']} "
        f"policy_packs={','.join(standards['policy_packs'])} "
        f"harness_packs={','.join(standards['harness_packs'])}"
    )


def parse_work_item(path: pathlib.Path) -> dict:
    text = path.read_text()
    if not text.startswith("---\n"):
        raise AssertionError(f"{rel(path)} missing YAML frontmatter")
    _, frontmatter, _body = text.split("---", 2)
    data = yaml.safe_load(frontmatter)
    schema = load_schema("work-item.schema.json")
    jsonschema.Draft202012Validator(schema).validate(data)
    print(f"ok work {rel(path)}")
    return data


def parse_work_items() -> dict[str, dict]:
    items: dict[str, dict] = {}
    for path in sorted((ROOT / "backlog.d").glob("[0-9][0-9][0-9]-*.md")) + sorted((ROOT / "backlog.d" / "_done").glob("[0-9][0-9][0-9]-*.md")):
        data = parse_work_item(path)
        if data["id"] in items:
            raise AssertionError(f"duplicate work item id: {data['id']}")
        items[data["id"]] = data
    return items


def assert_exists(path_text: str) -> None:
    path = ROOT / path_text
    if not path.exists():
        raise AssertionError(f"referenced artifact missing: {path_text}")


def local_ref_exists(ref: str) -> bool:
    if "://" in ref:
        return True
    path_text = ref.split("#", 1)[0]
    if not path_text:
        return True
    return (ROOT / path_text).exists()


def validate_context_citations(context: dict) -> None:
    for item in context["items"]:
        for field in ["source_uri", "citation"]:
            ref = item.get(field, "")
            if not local_ref_exists(ref):
                raise AssertionError(f"{context['id']} item {item['id']} has missing {field}: {ref}")


def extract_text_claims(path: pathlib.Path) -> dict[str, str]:
    if not path.exists():
        return {}
    text = path.read_text(errors="ignore")
    claims: dict[str, str] = {}
    if re.search(r"source of truth for work tracking is\s+GitHub Issues", text, re.IGNORECASE):
        claims["work_tracker"] = "github-issues"
    if re.search(r"source of truth for work tracking is\s+`?backlog\.d`?", text, re.IGNORECASE):
        claims["work_tracker"] = "backlog.d"
    gate = re.search(r"load-bearing ship gate is\s+`([^`]+)`", text, re.IGNORECASE)
    if gate:
        claims["gate_command"] = gate.group(1)
    base = re.search(r"Base branch is\s+`([^`]+)`", text, re.IGNORECASE)
    if base:
        claims["base_branch"] = base.group(1)
    package = re.search(r"Package manager is\s+`([^`]+)`", text, re.IGNORECASE)
    if package:
        claims["package_manager"] = package.group(1)
    closure = re.search(r"Closure rule is\s+`([^`]+)`", text, re.IGNORECASE)
    if closure:
        claims["closure_rule"] = closure.group(1)
    if re.search(r"public-safe", text, re.IGNORECASE):
        claims["evidence_boundary"] = "public-safe"
    return claims


def validate_truth_claims(profile: dict) -> None:
    sources: dict[str, dict[str, str]] = {}
    work_source = profile.get("work", {}).get("source")
    if work_source:
        sources["gradient.yaml"] = {"work_tracker": str(work_source)}
    for rel_path in ["AGENTS.md", ".spellbook/repo-brief.md"]:
        claims = extract_text_claims(ROOT / rel_path)
        if claims:
            sources[rel_path] = claims
    for skill_root in [ROOT / ".agent" / "skills", ROOT / ".agents" / "skills"]:
        if not skill_root.exists():
            continue
        for skill_path in sorted(skill_root.glob("*/SKILL.md")):
            claims = extract_text_claims(skill_path)
            if claims:
                sources[rel(skill_path)] = claims
    if (ROOT / "pnpm-lock.yaml").exists():
        sources.setdefault("filesystem", {})["package_manager"] = "pnpm"
    elif (ROOT / "package-lock.json").exists():
        sources.setdefault("filesystem", {})["package_manager"] = "npm"

    severities = {
        "work_tracker": "blocking",
        "gate_command": "warning",
        "base_branch": "warning",
        "package_manager": "warning",
        "closure_rule": "blocking",
        "evidence_boundary": "blocking",
    }
    for claim, severity in severities.items():
        values: dict[str, list[str]] = {}
        for source, claims in sources.items():
            if claim in claims:
                values.setdefault(claims[claim], []).append(source)
        if len(values) <= 1:
            continue
        parts = [f"{value} from {', '.join(paths)}" for value, paths in sorted(values.items())]
        message = (
            f"truth claim drift ({claim}, {severity}): "
            + "; ".join(parts)
            + ". authority order: gradient.yaml > AGENTS.md > .spellbook/repo-brief.md > skills"
        )
        if severity == "blocking":
            raise AssertionError(message)
        print(f"warn {message}")
    print("ok truth claims")


def scan_public_safe() -> None:
    scanned_roots = [
        ROOT / "backlog.d",
        ROOT / ".gradient",
        ROOT / "examples",
        ROOT / "schemas",
        ROOT / "docs",
        ROOT / "profiles",
        ROOT / "evals",
    ]
    forbidden = [
        re.compile(r"sk-[A-Za-z0-9_-]{20,}"),
        re.compile(r"sk-proj-[A-Za-z0-9_-]{20,}"),
        re.compile(r"ghp_[A-Za-z0-9_]{20,}"),
        re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
        re.compile(r"BEGIN (?:RSA |OPENSSH )?PRIVATE KEY"),
        re.compile(r"aws_secret_access_key\s*=", re.IGNORECASE),
    ]
    for root in scanned_roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if not path.is_file():
                continue
            if ".gradient/private" in str(path.relative_to(ROOT)):
                continue
            text = path.read_text(errors="ignore")
            for pattern in forbidden:
                if pattern.search(text):
                    raise AssertionError(f"public-safe scan failed: {rel(path)} matched {pattern.pattern}")
    print("ok public-safe scan")


def assert_public_safe_trace_ref(evidence_id: str, trace_ref: dict) -> None:
    redaction = trace_ref["redaction"]
    if redaction not in SAFE_TRACE_REDACTIONS:
        raise AssertionError(f"{evidence_id} has unsafe trace redaction: {redaction}")

    uri = trace_ref.get("uri", "")
    if uri and uri.startswith("file:"):
        raise AssertionError(f"{evidence_id} trace URI must not point at local raw files")

    artifact_path = trace_ref.get("artifact_path")
    if not artifact_path:
        return

    path = ROOT / artifact_path
    assert_exists(artifact_path)
    rel_text = str(path.relative_to(ROOT))
    if ".gradient/private" in rel_text:
        raise AssertionError(f"{evidence_id} trace artifact must not point at private local state")
    if path.suffix.lower() in RAW_TRACE_SUFFIXES or path.name == "raindrop_workshop.db":
        raise AssertionError(f"{evidence_id} trace artifact looks like a raw trace store: {artifact_path}")


def validate_harness_links(harness: dict) -> None:
    shared = ROOT / harness["shared_skill_root"]
    if not shared.is_dir():
        raise AssertionError(f"shared skill root missing: {harness['shared_skill_root']}")
    for skill in harness["skills"]:
        marker = shared / skill / ".spellbook"
        if not marker.is_file():
            raise AssertionError(f"skill marker missing: {rel(marker)}")
    for bridge in harness["bridges"]:
        bridge_path = ROOT / bridge
        if not bridge_path.is_dir():
            raise AssertionError(f"harness bridge missing: {bridge}")
        for skill in harness["skills"]:
            link = bridge_path / skill
            if not link.exists():
                raise AssertionError(f"bridge skill missing or broken: {rel(link)}")
    print("ok harness links")


def expected_harness_resolution() -> dict | None:
    profile_path = ROOT / "gradient.yaml"
    if not profile_path.exists():
        return None
    with profile_path.open() as fh:
        profile = yaml.safe_load(fh)
    harness = profile["harness"]
    return {
        "id": f"harness-{profile['name']}-{profile['version']}",
        "profile": harness.get("profile", profile["name"]),
        "primitive_library": harness["primitive_library"],
        "shared_skill_root": harness["shared_skill_root"],
        "skills": harness["skills"],
        "agents": harness.get("agents", []),
        "bridges": harness["bridges"],
    }


def validate_resolved_harness(harness: dict) -> None:
    expected = expected_harness_resolution()
    if expected is None:
        print("ok resolved harness (no gradient.yaml)")
        return
    actual = dict(harness)
    actual.pop("$schema", None)
    if actual != expected:
        raise AssertionError("harness resolution is stale; run ./scripts/gradient.sh resolve")
    print("ok resolved harness")


def validate_gitignored_local_state() -> None:
    ignored = subprocess.run(
        ["git", "check-ignore", "-q", ".gradient/sources.local.yaml"],
        cwd=ROOT,
        check=False,
    )
    if ignored.returncode != 0:
        raise AssertionError(".gradient/sources.local.yaml must remain ignored")
    print("ok ignored local state")


def main() -> int:
    # Schemas are valid JSON and can be compiled.
    for schema_path in sorted((ROOT / "schemas").glob("*.schema.json")):
        schema = load_json(schema_path)
        jsonschema.Draft202012Validator.check_schema(schema)
        print(f"ok schema-document {rel(schema_path)}")

    profile_paths = sorted((ROOT / "profiles").glob("*.yaml")) + [ROOT / "gradient.yaml.example"]
    if (ROOT / "gradient.yaml").exists():
        profile_paths.append(ROOT / "gradient.yaml")
    for profile_path in profile_paths:
        validate_yaml_profile(profile_path)
    standards_manifests = {
        rel(path): validate_standards_manifest(path)
        for path in sorted((ROOT / "standards").glob("*.yaml"))
    }
    for profile_path in profile_paths:
        validate_profile_standards(profile_path, standards_manifests)

    work_items = parse_work_items()
    harness = validate_json(ROOT / ".gradient/harness/resolution.json", "harness-resolution.schema.json")

    contexts = {
        item["id"]: item
        for item in [
            validate_json(path, "context-bundle.schema.json")
            for path in sorted((ROOT / ".gradient/context").glob("*.json"))
        ]
    }
    fleets = {
        item["id"]: item
        for item in [
            validate_json(path, "fleet-run.schema.json")
            for path in sorted((ROOT / ".gradient/runs").glob("*/run.json"))
        ]
    }
    policies = {
        item["id"]: item
        for item in [
            validate_json(path, "policy-outcome.schema.json")
            for path in sorted((ROOT / ".gradient/policy").glob("*.json"))
        ]
    }
    feedback_items = [
        validate_json(path, "feedback-item.schema.json")
        for path in sorted((ROOT / ".gradient/feedback").glob("*.json"))
    ]
    evidences = [
        validate_json(path, "evidence-packet.schema.json")
        for path in sorted((ROOT / ".gradient/evidence").glob("*.json"))
    ]
    if (ROOT / ".gradient/managed-manifest.json").exists():
        validate_json(ROOT / ".gradient/managed-manifest.json", "managed-manifest.schema.json")

    validate_harness_links(harness)
    validate_resolved_harness(harness)
    validate_gitignored_local_state()
    if (ROOT / "gradient.yaml").exists():
        validate_truth_claims(load_profile(ROOT / "gradient.yaml"))
    scan_public_safe()

    for context in contexts.values():
        validate_context_citations(context)

    for fleet in fleets.values():
        for artifact_path in fleet.get("artifacts", []):
            assert_exists(artifact_path)
        for trace_ref in fleet.get("trace_refs", []):
            backend = trace_ref["backend"]
            if backend not in TRACE_BACKENDS:
                raise AssertionError(f"{fleet['id']} has unknown trace backend: {backend}")
            assert_public_safe_trace_ref(fleet["id"], trace_ref)

    if not evidences:
        print("ok artifact links (no evidence packets yet)")
        print("gradient validation passed")
        return 0

    if not feedback_items:
        raise AssertionError("at least one feedback item is required when evidence packets exist")

    for evidence in evidences:
        if evidence["work_item_id"] not in work_items:
            raise AssertionError(f"evidence references missing work item: {evidence['work_item_id']}")
        if evidence["harness_id"] != harness["id"]:
            raise AssertionError(f"evidence {evidence['id']} references wrong harness")
        fleet = fleets.get(evidence["fleet_run_id"])
        if not fleet:
            raise AssertionError(f"evidence references missing fleet run: {evidence['fleet_run_id']}")
        context = contexts.get(evidence["context_bundle_id"])
        if not context:
            raise AssertionError(f"evidence references missing context bundle: {evidence['context_bundle_id']}")
        policy = policies.get(evidence["policy_outcome_id"])
        if not policy:
            raise AssertionError(f"evidence references missing policy outcome: {evidence['policy_outcome_id']}")
        if evidence["work_item_id"] != policy["work_item_id"]:
            raise AssertionError(f"evidence/policy work mismatch: {evidence['id']}")
        if evidence["fleet_run_id"] != policy["fleet_run_id"]:
            raise AssertionError(f"evidence/policy fleet mismatch: {evidence['id']}")
        if evidence["work_item_id"] not in fleet["work_item_ids"]:
            raise AssertionError(f"fleet missing work id for evidence: {evidence['id']}")
        if fleet["harness_id"] != harness["id"]:
            raise AssertionError(f"fleet references wrong harness: {fleet['id']}")
        if fleet["context_bundle_id"] != context["id"]:
            raise AssertionError(f"fleet/context mismatch: {fleet['id']}")

        for artifact in evidence["artifacts"]:
            assert_exists(artifact["path"])

        artifact_kinds = {artifact["kind"] for artifact in evidence["artifacts"]}
        required_artifact_kinds = set(evidence.get("required_artifact_kinds", []))
        missing_artifact_kinds = sorted(required_artifact_kinds - artifact_kinds)
        if missing_artifact_kinds:
            raise AssertionError(f"{evidence['id']} missing required artifact kinds {missing_artifact_kinds}")

        for trace_ref in evidence.get("trace_refs", []):
            backend = trace_ref["backend"]
            if backend not in TRACE_BACKENDS:
                raise AssertionError(f"{evidence['id']} has unknown trace backend: {backend}")
            assert_public_safe_trace_ref(evidence["id"], trace_ref)

        missing_policy_evidence = set(policy.get("missing_evidence", []))
        if missing_policy_evidence and not missing_policy_evidence <= required_artifact_kinds:
            raise AssertionError(f"policy missing_evidence is not part of required evidence: {policy['id']}")

        validate_commands = {item["command"]: item["status"] for item in evidence["verification"]}
        if "./scripts/validate.sh" in validate_commands:
            assert validate_commands["./scripts/validate.sh"] in {"pass", "unverified"}

    print("ok artifact links")
    print("gradient validation passed")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"validation failed: {exc}", file=sys.stderr)
        raise
PY
