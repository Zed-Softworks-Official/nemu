#!/usr/bin/env bash
# Download CSA production PAA and CD signing roots (.der) from connectedhomeip.
# Certified retail devices will not attest without these.
#
# Files are fetched from an immutable commit and checked against
# scripts/matter-roots.sha256 before they are written into the trust dirs.
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
DATA="${MATTER_DATA_DIR:-${ROOT}/infra/matter/controller}"
PAA_DIR="${MATTER_PAA_DIR:-${DATA}/paa-roots}"
CD_DIR="${MATTER_CD_DIR:-${DATA}/cd-roots}"
MANIFEST="${MATTER_ROOTS_MANIFEST:-${SCRIPT_DIR}/matter-roots.sha256}"
# Audited connectedhomeip snapshot of production PAA/CD DER roots (July 2026).
CHIP_COMMIT="${MATTER_CHIP_COMMIT:-2c17085ba821e58865480bd0bdbbd0c0706cbeb7}"

if [ ! -f "${MANIFEST}" ]; then
  echo "error: missing SHA-256 manifest ${MANIFEST}" >&2
  exit 1
fi

python3 - "${PAA_DIR}" "${CD_DIR}" "${MANIFEST}" "${CHIP_COMMIT}" <<'PY'
import hashlib
import json
import shutil
import ssl
import sys
import tempfile
import urllib.request
from pathlib import Path

paa_dir = Path(sys.argv[1])
cd_dir = Path(sys.argv[2])
manifest_path = Path(sys.argv[3])
chip_commit = sys.argv[4]
ctx = ssl.create_default_context()
headers = {"User-Agent": "nemu-fetch-matter-roots"}
timeout = 30

def load_manifest(path: Path) -> dict[str, str]:
    expected: dict[str, str] = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        digest, name = line.split(None, 1)
        expected[name] = digest.lower()
    if not expected:
        sys.exit(f"empty SHA-256 manifest: {path}")
    return expected

def list_ders(api_url: str) -> list[tuple[str, str]]:
    req = urllib.request.Request(api_url, headers=headers)
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as response:
        items = json.load(response)
    files: list[tuple[str, str]] = []
    for item in items:
        name = item.get("name", "")
        url = item.get("download_url")
        if name.endswith(".der") and url:
            files.append((name, url))
    return files

def download_verified(files: list[tuple[str, str]], dest: Path, prefix: str, expected: dict[str, str]) -> int:
    dest.mkdir(parents=True, exist_ok=True)
    count = 0
    for name, url in files:
        key = f"{prefix}/{name}"
        digest = expected.get(key)
        if digest is None:
            sys.exit(f"unlisted Matter root {key}; refusing to write")
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=ctx, timeout=timeout) as response:
            payload = response.read()
        actual = hashlib.sha256(payload).hexdigest()
        if actual != digest:
            sys.exit(f"SHA-256 mismatch for {key}: got {actual}, expected {digest}")
        target = dest / name
        with tempfile.NamedTemporaryFile(dir=dest, delete=False) as tmp:
            tmp.write(payload)
            tmp.flush()
            tmp_path = Path(tmp.name)
        tmp_path.replace(target)
        count += 1
    return count

def activate_dir(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    incoming = dest.with_name(f".{dest.name}.new")
    previous = dest.with_name(f".{dest.name}.old")
    if incoming.exists():
        shutil.rmtree(incoming)
    shutil.copytree(src, incoming)
    if previous.exists():
        shutil.rmtree(previous)
    if dest.exists():
        dest.replace(previous)
    incoming.replace(dest)
    if previous.exists():
        shutil.rmtree(previous)

def local_roots_ok(paa: Path, cd: Path, expected: dict[str, str]) -> bool:
    for name, digest in expected.items():
        if name.startswith("paa/"):
            path = paa / name.removeprefix("paa/")
        elif name.startswith("cd/"):
            path = cd / name.removeprefix("cd/")
        else:
            return False
        if not path.is_file():
            return False
        if hashlib.sha256(path.read_bytes()).hexdigest() != digest:
            return False
    return True

expected = load_manifest(manifest_path)
if local_roots_ok(paa_dir, cd_dir, expected):
    print(f"Matter attestation roots already present ({len(expected)} files), skipping download")
    raise SystemExit(0)
base = f"https://api.github.com/repos/project-chip/connectedhomeip/contents/credentials/production"
with tempfile.TemporaryDirectory(prefix="matter-roots-") as tmp:
    work = Path(tmp)
    paa_staging = work / "paa-roots"
    cd_staging = work / "cd-roots"
    paa = download_verified(
        list_ders(f"{base}/paa-root-certs?ref={chip_commit}"),
        paa_staging,
        "paa",
        expected,
    )
    cd = download_verified(
        list_ders(f"{base}/cd-certs?ref={chip_commit}"),
        cd_staging,
        "cd",
        expected,
    )
    missing = [
        name
        for name in expected
        if (name.startswith("paa/") and not (paa_staging / name.removeprefix("paa/")).exists())
        or (name.startswith("cd/") and not (cd_staging / name.removeprefix("cd/")).exists())
    ]
    if missing:
        sys.exit("missing verified Matter roots: " + ", ".join(missing))
    if paa == 0 or cd == 0:
        sys.exit("failed to download Matter production trust roots")
    activate_dir(paa_staging, paa_dir)
    activate_dir(cd_staging, cd_dir)
    print(f"Matter attestation roots: {paa} PAA, {cd} CD (commit {chip_commit[:12]})")
PY
