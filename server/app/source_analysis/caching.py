"""Shared HTTP cache helpers for source photos (DEV-328 public copies, DEV-341 private previews)."""

import hashlib

# DEV-341: private previews. Only the producer's own browser may keep them (`private`), and the
# routes add `Vary: Authorization` so another login in the same browser refetches.
PREVIEW_CACHE = "private, max-age=86400"
PREVIEW_REVALIDATE = "private, no-cache"
# The only Cache-Control values SourceRequestMiddleware lets through; everything else is no-store.
PREVIEW_CACHE_VALUES = frozenset({PREVIEW_CACHE, PREVIEW_REVALIDATE})


def tag_for(key: str) -> str:
    """ETag from a storage key: changes with the stored bytes, never exposes the private key."""
    return '"' + hashlib.sha256(key.encode()).hexdigest()[:32] + '"'


def not_modified(tag: str, if_none_match: str | None) -> bool:
    """True when If-None-Match names `tag` (weak or strong) or `*`."""
    tags = [t.strip().removeprefix("W/") for t in (if_none_match or "").split(",")]
    return "*" in tags or tag in tags
