"""Explicit offline-model provisioning; runtime workers never download models."""

import argparse
import hashlib
import io
import json
import tarfile
import urllib.request
from pathlib import Path


def provision(directory):
    manifest_bytes = Path(__file__).with_name("ocr-manifest.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    directory.mkdir(parents=True, exist_ok=True)
    for kind, url in manifest["sources"].items():
        if not url.startswith("https://paddleocr.bj.bcebos.com/"):
            raise ValueError("Untrusted model source")
        with urllib.request.urlopen(url, timeout=60) as response:
            data = response.read(100 * 1024 * 1024 + 1)
        if len(data) > 100 * 1024 * 1024:
            raise ValueError("Model archive too large")
        with tarfile.open(fileobj=io.BytesIO(data)) as archive:
            for member in archive.getmembers():
                name = kind + "/" + Path(member.name).name
                if name not in manifest["files"] or not member.isfile():
                    continue
                if member.size > 100 * 1024 * 1024:
                    raise ValueError("Model file too large")
                data = archive.extractfile(member).read()
                if hashlib.sha256(data).hexdigest() != manifest["files"][name]:
                    raise ValueError("Model checksum mismatch")
                target = directory / name
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
    for name, digest in manifest["files"].items():
        if hashlib.sha256((directory / name).read_bytes()).hexdigest() != digest:
            raise ValueError("Incomplete model installation")
    (directory / "manifest.json").write_bytes(manifest_bytes)
    return hashlib.sha256(manifest_bytes).hexdigest()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    print("SOURCE_OCR_MODEL_SHA256=" + provision(args.directory.resolve()))
