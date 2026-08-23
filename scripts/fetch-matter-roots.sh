#!/usr/bin/env bash
# Download CSA production PAA and CD signing roots (.der) from connectedhomeip.
# Certified retail devices will not attest without these.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA="${MATTER_DATA_DIR:-${ROOT}/infra/matter/controller}"
PAA_DIR="${MATTER_PAA_DIR:-${DATA}/paa-roots}"
CD_DIR="${MATTER_CD_DIR:-${DATA}/cd-roots}"

mkdir -p "${PAA_DIR}" "${CD_DIR}"

python3 - "${PAA_DIR}" "${CD_DIR}" <<'PY'
import json
import ssl
import sys
import urllib.request
from pathlib import Path

paa_dir = Path(sys.argv[1])
cd_dir = Path(sys.argv[2])
ctx = ssl.create_default_context()
headers = {"User-Agent": "nemu-fetch-matter-roots"}

def list_ders(api_url: str) -> list[tuple[str, str]]:
    req = urllib.request.Request(api_url, headers=headers)
    with urllib.request.urlopen(req, context=ctx) as response:
        items = json.load(response)
    files: list[tuple[str, str]] = []
    for item in items:
        name = item.get("name", "")
        url = item.get("download_url")
        if name.endswith(".der") and url:
            files.append((name, url))
    return files

def download(files: list[tuple[str, str]], dest: Path) -> int:
    dest.mkdir(parents=True, exist_ok=True)
    count = 0
    for name, url in files:
        path = dest / name
        if path.exists() and path.stat().st_size > 0:
            count += 1
            continue
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, context=ctx) as response:
            path.write_bytes(response.read())
        count += 1
    return count

base = "https://api.github.com/repos/project-chip/connectedhomeip/contents/credentials/production"
paa = download(list_ders(f"{base}/paa-root-certs?ref=master"), paa_dir)
cd = download(list_ders(f"{base}/cd-certs?ref=master"), cd_dir)
print(f"Matter attestation roots: {paa} PAA, {cd} CD")
if paa == 0 or cd == 0:
    sys.exit("failed to download Matter production trust roots")
PY
