"""Explicit offline-model provisioning; runtime workers never download models."""

import argparse
import hashlib
import http.client
import json
import os
import sys
import urllib.request
from pathlib import Path

UPSTREAM = "https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.10.0/"
# Unmodified Apache-2.0 copies (LICENSE/NOTICE in the release). Tried first because
# the upstream host has returned HTTP 500 for whole builds. The manifest stays the
# pinned source of truth, so its hash (SOURCE_OCR_MODEL_SHA256) does not change.
MIRROR = (
    "https://github.com/snuhcs-course/swpp-2026-project-team-06/"
    "releases/download/ocr-models-v3.10.0/"
)


def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read(30_000_001)


def provision(directory):
    manifest_bytes = Path(__file__).with_name("ocr-manifest.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    directory.mkdir(parents=True, exist_ok=True)
    for name, url in manifest["sources"].items():
        if not url.startswith(UPSTREAM):
            raise ValueError("Untrusted model source")
        target = directory / name
        expected = manifest["files"][name]
        if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == expected:
            continue
        data = None
        for candidate in (MIRROR + name, url):
            try:
                body = fetch(candidate)
            except (OSError, http.client.HTTPException) as error:
                print(f"OCR model {name}: {candidate} failed ({error!r})", file=sys.stderr)
                continue
            if len(body) <= 30_000_000 and hashlib.sha256(body).hexdigest() == expected:
                data = body
                break
            print(f"OCR model {name}: {candidate} checksum mismatch", file=sys.stderr)
        if data is None:
            raise ValueError("Model checksum mismatch or all sources unavailable")
        temporary = target.with_suffix(target.suffix + ".download")
        temporary.write_bytes(data)
        os.replace(temporary, target)
    (directory / "manifest.json").write_bytes(manifest_bytes)
    return hashlib.sha256(manifest_bytes).hexdigest()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    print("SOURCE_OCR_MODEL_SHA256=" + provision(args.directory.resolve()))
