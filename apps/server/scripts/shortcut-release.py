#!/usr/bin/env python3
"""Package the native Shortcut source; optionally ask Apple's macOS CLI to sign it.

From the repository root, on Linux or macOS (Python 3, no dependencies):
  python3 apps/server/scripts/shortcut-release.py --output-dir /tmp/sploot-shortcut

On a Mac with Shortcuts and Apple's signing service available:
  python3 apps/server/scripts/shortcut-release.py --output-dir /tmp/sploot-shortcut-signed --sign

Equivalent signing step after unsigned generation:
  shortcuts sign --mode anyone --input '/tmp/sploot-shortcut/Save to Sploot.unsigned.shortcut' --output '/tmp/Save to Sploot.shortcut'

Unsigned plist files are SOURCE, not installable distribution. Signing sends the
workflow to Apple for validation. This script never imports a shortcut, opens the
library, reads a personal token, or claims device verification. Open the signed
file in Shortcuts on a Mac/iPhone, inspect its actions and permissions, then run
real save/duplicate/error cases before publishing it. An iCloud sharing link is
created in Apple's Shortcuts app after import; it is not generated here.

Apple signing/distribution:
https://support.apple.com/guide/shortcuts-mac/run-shortcuts-from-the-command-line-apd455c82f02/mac
https://support.apple.com/guide/shortcuts-mac/share-shortcuts-apdf01f8c054/mac
"""

import argparse
import hashlib
import json
import platform
import plistlib
import re
import shutil
import subprocess
from pathlib import Path


SOURCE = (
    Path(__file__).resolve().parents[1]
    / "internal/web/static/shortcuts/save-to-sploot.unsigned.shortcut"
)


def main():
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument(
        "--sign",
        action="store_true",
        help="Send the token-free workflow to Apple's macOS shortcuts signer (mode anyone).",
    )
    args = parser.parse_args()
    signer = shutil.which("shortcuts") if platform.system() == "Darwin" else None
    if args.sign and signer is None:
        parser.error("Apple signing requires a Mac with the shortcuts CLI. Unsigned source is not installable.")

    source_bytes = SOURCE.read_bytes()
    if re.search(rb"splt_[A-Za-z0-9_-]{43}(?![A-Za-z0-9_-])", source_bytes):
        parser.error("Refusing to package source containing a personal API token.")
    workflow = plistlib.loads(source_bytes)
    if not workflow.get("WFWorkflowActions"):
        parser.error("Source has no executable actions.")

    output_dir = args.output_dir.resolve()
    unsigned = output_dir / "Save to Sploot.unsigned.shortcut"
    signed = output_dir / "Save to Sploot.shortcut"
    receipt = output_dir / "distribution.json"
    if any(path.exists() for path in (unsigned, signed, receipt)):
        parser.error("Output artifacts already exist; choose a new output directory.")
    output_dir.mkdir(parents=True, exist_ok=True)
    with unsigned.open("xb") as output:
        output.write(plistlib.dumps(workflow, fmt=plistlib.FMT_BINARY, sort_keys=False))

    if args.sign:
        subprocess.run(
            [signer, "sign", "--mode", "anyone", "--input", str(unsigned), "--output", str(signed)],
            check=True,
        )
        if not signed.is_file() or signed.stat().st_size == 0:
            raise RuntimeError("Apple's signer did not produce a signed artifact.")

    distribution = {
        "name": "Save to Sploot",
        "sourceSHA256": hashlib.sha256(source_bytes).hexdigest(),
        "actionCount": len(workflow["WFWorkflowActions"]),
        "unsignedArtifact": unsigned.name,
        "signedArtifact": signed.name if args.sign else None,
        "status": "apple-signed-device-verification-required" if args.sign else "unsigned-source",
        "deviceVerified": False,
        "icloudImportURL": None,
    }
    if args.sign:
        distribution["signedSHA256"] = hashlib.sha256(signed.read_bytes()).hexdigest()
    with receipt.open("x", encoding="utf-8") as output:
        json.dump(distribution, output, indent=2)
        output.write("\n")
    print(json.dumps(distribution, indent=2))
    if not args.sign:
        print("Unsigned artifact created. Apple hardware/signing and iPhone verification remain required.")
    else:
        print("Apple-signed artifact created. Import and exercise it on iPhone before publishing an install link.")


if __name__ == "__main__":
    main()
