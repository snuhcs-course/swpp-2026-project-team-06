"""Explicit offline-model provisioning; runtime workers never download models."""

import argparse
import hashlib
import json
import os
import urllib.request
from pathlib import Path


def provision(directory):
    manifest_bytes = Path(__file__).with_name("ocr-manifest.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    directory.mkdir(parents=True, exist_ok=True)
    for name, url in manifest["sources"].items():
        if not url.startswith("https://www.modelscope.cn/models/RapidAI/RapidOCR/resolve/v3.10.0/"):
            raise ValueError("Untrusted model source")
        target = directory / name
        if (
            target.exists()
            and hashlib.sha256(target.read_bytes()).hexdigest() == manifest["files"][name]
        ):
            continue
        with urllib.request.urlopen(url, timeout=60) as response:
            data = response.read(30_000_001)
        if len(data) > 30_000_000 or hashlib.sha256(data).hexdigest() != manifest["files"][name]:
            raise ValueError("Model checksum mismatch")
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
