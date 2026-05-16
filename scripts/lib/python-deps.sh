#!/usr/bin/env bash

gradient_python_deps_preflight() {
  python3 - <<'PY'
missing = []
for module, package in [("yaml", "PyYAML"), ("jsonschema", "jsonschema")]:
    try:
        __import__(module)
    except ModuleNotFoundError:
        missing.append(package)

if missing:
    print("Gradient requires Python packages: " + ", ".join(missing) + ".", file=__import__("sys").stderr)
    print("Run: python3 -m pip install -r requirements.txt", file=__import__("sys").stderr)
    raise SystemExit(66)
PY
}
