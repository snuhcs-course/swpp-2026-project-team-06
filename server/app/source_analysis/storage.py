"""Private storage. Keys are server-generated; never serve this directory statically."""

import re
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import boto3
from botocore.config import Config

from app.core.config import get_settings

KEY = re.compile(r"^[a-f0-9]{32}/[a-f0-9]{32}$")


class Storage:
    def __init__(self):
        self.settings = get_settings()
        self.root = Path(self.settings.source_storage_dir).resolve()
        self.client = None
        if self.settings.source_storage == "r2":
            self.client = boto3.client(
                "s3",
                endpoint_url=self.settings.source_r2_endpoint,
                aws_access_key_id=self.settings.source_r2_access_key,
                aws_secret_access_key=self.settings.source_r2_secret_key,
                config=Config(connect_timeout=10, read_timeout=30, retries={"max_attempts": 2}),
            )

    def path(self, key):
        if not KEY.fullmatch(key):
            raise ValueError("Invalid private storage key")
        path = (self.root / key).resolve()
        if self.root not in path.parents:
            raise ValueError("Invalid private storage path")
        return path

    def put(self, data: bytes, prefix: str | None = None):
        key = (prefix or uuid4().hex) + "/" + uuid4().hex
        self.put_at(key, data)
        return key

    def put_at(self, key: str, data: bytes):
        """Write a server-derived key (e.g. a display variant of another key, DEV-341)."""
        path = self.path(key)
        if self.client:
            self.client.put_object(Bucket=self.settings.source_r2_bucket, Key=key, Body=data)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            # Write then rename so a concurrent reader never sees a half-written file.
            temp = path.with_name(f".{path.name}.{uuid4().hex}")
            try:
                temp.write_bytes(data)
                temp.replace(path)
            finally:
                temp.unlink(missing_ok=True)  # only left behind when writing failed

    def get(self, key):
        path = self.path(key)
        if self.client:
            return self.client.get_object(Bucket=self.settings.source_r2_bucket, Key=key)[
                "Body"
            ].read()
        return path.read_bytes()

    def get_optional(self, key):
        """Bytes, or None when the key was never written or was already cleaned up."""
        path = self.path(key)
        if self.client:
            from botocore.exceptions import ClientError

            try:
                return self.get(key)
            except ClientError as exc:
                if exc.response.get("Error", {}).get("Code") in ("NoSuchKey", "404"):
                    return None
                raise
        return path.read_bytes() if path.is_file() else None

    def delete(self, key):
        path = self.path(key)
        if self.client:
            self.client.delete_object(Bucket=self.settings.source_r2_bucket, Key=key)
        else:
            path.unlink(missing_ok=True)

    def expired(self):
        cutoff = datetime.now(UTC) - timedelta(hours=24)
        if self.client:
            pages = self.client.get_paginator("list_objects_v2").paginate(
                Bucket=self.settings.source_r2_bucket
            )
            for page in pages:
                for obj in page.get("Contents", []):
                    if KEY.fullmatch(obj["Key"]) and obj["LastModified"] < cutoff:
                        yield obj["Key"]
        elif self.root.exists():
            for path in self.root.glob("*/*"):
                if path.is_file() and path.stat().st_mtime < cutoff.timestamp():
                    key = path.relative_to(self.root).as_posix()
                    if KEY.fullmatch(key):
                        yield key
