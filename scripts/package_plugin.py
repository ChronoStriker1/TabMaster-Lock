"""Package only the runtime files Decky needs; never bundle settings or credentials."""
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / "package.json").read_text())["version"]
files = ["plugin.json", "package.json", "main.py", "dist/index.js", "README.md", "LICENSE", "docs/DEVICE-TESTING.md"]
for name in files:
    if not (root / name).is_file():
        raise SystemExit(f"Missing {name}; build the frontend first.")
output = root / "artifacts" / f"TabMaster-Lock_v{version}.zip"
output.parent.mkdir(exist_ok=True)
with ZipFile(output, "w", ZIP_DEFLATED) as archive:
    for name in files:
        archive.write(root / name, f"TabMaster-Lock/{name}")
print(output)
