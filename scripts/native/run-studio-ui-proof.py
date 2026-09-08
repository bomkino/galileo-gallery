#!/usr/bin/env python3
"""Drive the exact packaged Galileo app using an external macOS XCUITest runner."""
import json
import pathlib
import plistlib
import re
import subprocess
import sys
import uuid

repo = pathlib.Path(__file__).resolve().parents[2]
if len(sys.argv) != 3:
    raise SystemExit("Usage: run-studio-ui-proof.py APP_BUNDLE EVIDENCE_DIRECTORY")
app = pathlib.Path(sys.argv[1]).resolve()
evidence = pathlib.Path(sys.argv[2]).resolve()
evidence.mkdir(parents=True, exist_ok=False)
source = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=repo, text=True).strip()
identity = json.loads((app / "Contents/Resources/build.json").read_text())
if identity.get("sourceSha") != source:
    raise SystemExit("The packaged application does not match the checked-out source.")

def signature() -> str:
    subprocess.run(["codesign", "--verify", "--deep", "--strict", str(app)], check=True)
    output = subprocess.run(["codesign", "-dv", "--verbose=4", str(app)], capture_output=True, text=True, check=True).stderr
    match = re.search(r"^CDHash=([0-9a-f]+)$", output, re.M)
    if not match:
        raise SystemExit("The application has no verified code-directory identity.")
    return match[1]

before = signature()
run = str(uuid.uuid4())
work = repo / "native-evidence" / "studio-ui-driver" / run
work.mkdir(parents=True)
root = evidence / "outputs"
spec = {
    "name": "GalileoStudioAcceptance",
    "options": {"bundleIdPrefix": "dog.pitch.galileo.acceptance", "projectFormat": "xcode16_0"},
    "settings": {"SWIFT_VERSION": "5.0", "CODE_SIGN_IDENTITY": "-", "ENABLE_APP_SANDBOX": "NO"},
    "targets": {"StudioJourneyUITests": {
        "type": "bundle.ui-testing", "platform": "macOS", "deploymentTarget": "14.0",
        "sources": [str(repo / "native/AcceptanceUI")],
        "info": {"path": "DriverInfo.plist", "properties": {
            "ApplicationPath": str(app), "SourceRevision": source, "ProofPath": str(root)
        }}
    }},
    "schemes": {"GalileoStudioAcceptance": {
        "build": {"targets": {"StudioJourneyUITests": ["test"]}},
        "test": {"targets": [{"name": "StudioJourneyUITests", "parallelizable": False}]}
    }}
}
(work / "project.json").write_text(json.dumps(spec, indent=2))
subprocess.run(["xcodegen", "generate", "--spec", str(work / "project.json"), "--project", str(work)], check=True)
result_path = evidence / "StudioJourney.xcresult"
command = ["xcodebuild", "test", "-project", str(work / "GalileoStudioAcceptance.xcodeproj"),
           "-scheme", "GalileoStudioAcceptance", "-destination", "platform=macOS", "-derivedDataPath", str(work / "DerivedData"),
           "-resultBundlePath", str(result_path), "-parallel-testing-enabled", "NO"]
try:
    result = subprocess.run(command, timeout=600, check=False)
except subprocess.TimeoutExpired as error:
    raise SystemExit("The native UI acceptance deadline was exceeded.") from error
finally:
    if result_path.exists():
        subprocess.run(["xcrun", "xcresulttool", "export", "attachments", "--path", str(result_path),
                        "--output-path", str(evidence / "captures")], check=True)
value = json.loads((root / "RESULT.json").read_text()) if (root / "RESULT.json").is_file() else {}
print(json.dumps(value, indent=2), flush=True)
if result.returncode or value.get("result") != "passed" or value.get("source") != source:
    raise SystemExit(result.returncode or 1)
if signature() != before:
    raise SystemExit("The packaged application changed during the UI journey.")
receipt = dict(value, codeDirectoryHash=before, build=identity, run=run)
(evidence / "StudioJourneyReceipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
print("GALILEO_STUDIO_UI_PROOF_PASS " + source, flush=True)
