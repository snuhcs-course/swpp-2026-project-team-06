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
        path = self.path(key)
        if self.client:
            self.client.put_object(Bucket=self.settings.source_r2_bucket, Key=key, Body=data)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        return key

    def get(self, key):
        path = self.path(key)
        if self.client:
            return self.client.get_object(Bucket=self.settings.source_r2_bucket, Key=key)[
                "Body"
            ].read()
        return path.read_bytes()

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
