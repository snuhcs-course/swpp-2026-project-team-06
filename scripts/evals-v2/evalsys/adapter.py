"""Local-only bridge to an independently maintained legacy run_trial harness.

One cohort per process: the legacy fixture module binds app/database imports at load time.
"""

from __future__ import annotations

import inspect
import json
import os
import runpy
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

from .gates import EvalGateError, digest


def source_digest(root):
    files = sorted((root / "server/app").rglob("*.py"))
    return digest(
        b"\n".join(str(p.relative_to(root)).encode() + b":" + p.read_bytes() for p in files)
    )


def _elapsed(text):
    days, remainder = text.split("-", 1) if "-" in text else ("0", text)
    parts = [int(n) for n in remainder.split(":")]
    return int(days) * 86400 + sum(n * 60**i for i, n in enumerate(reversed(parts)))


def verify_runtime(root, api):
    parsed = urlparse(api)
    if parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise EvalGateError("NONLOCAL_API")
    port = parsed.port
    if not port:
        raise EvalGateError("EXPLICIT_API_PORT_REQUIRED")
    pids = subprocess.check_output(
        ["lsof", "-nP", f"-iTCP:{port}", "-sTCP:LISTEN", "-t"], text=True
    ).split()
    candidates = []
    for pid in set(pids):
        cwd = subprocess.check_output(["lsof", "-a", "-p", pid, "-d", "cwd", "-Fn"], text=True)
        if f"n{root / 'server'}" not in cwd.splitlines():
            continue
        elapsed = subprocess.check_output(["ps", "-p", pid, "-o", "etime="], text=True).strip()
        command = subprocess.check_output(["ps", "-p", pid, "-o", "command="], text=True)
        if "uvicorn" not in command or "--reload" in command:
            continue
        started = time.time() - _elapsed(elapsed)
        if any(p.stat().st_mtime > started for p in (root / "server/app").rglob("*.py")):
            raise EvalGateError("SOURCE_CHANGED_AFTER_API_START")
        candidates.append({"api_pid": int(pid), "runtime_source_verified": True})
    if len(candidates) != 1:
        raise EvalGateError("API_PROCESS_CHECKOUT_NOT_VERIFIED")
    return candidates[0]


class LegacyAdapter:
    def __init__(self, runner, api, proxy):
        self.runner = Path(runner).resolve()
        self.root = self.runner.parents[2]
        for url in (api, proxy):
            if urlparse(url).hostname not in {"localhost", "127.0.0.1", "::1"}:
                raise EvalGateError("NONLOCAL_ENDPOINT")
        database = os.environ.get("DATABASE_URL", "")
        host = urlparse(database.replace("postgresql+psycopg", "postgresql")).hostname
        if host not in {"localhost", "127.0.0.1", "::1"}:
            raise EvalGateError("LOCAL_DATABASE_REQUIRED")
        self.attestation = verify_runtime(self.root, api)
        sys.path.insert(0, str(self.root / "server"))
        sys.path.insert(0, str(self.runner.parent))
        self.namespace = runpy.run_path(str(self.runner), run_name="evals_v2_bridge")
        self.fn = self.namespace["run_trial"]
        self.fn.__globals__.update(API=api, PROXY=proxy)
        timeout = self.fn.__globals__["client"].timeout
        if any(getattr(timeout, key) != 60 for key in ("connect", "read", "write", "pool")):
            raise EvalGateError("RUNNER_HTTP_TIMEOUT_NOT_ATTESTED")
        self.fixtures = self.fn.__globals__["fixtures"]
        self.fixture_sha256 = digest(Path(inspect.getfile(self.fixtures)).read_bytes())
        self.fixtures.require_local_database()
        self.initial_source = source_digest(self.root)
        self.host = host
        self.api, self.proxy = api, proxy

    def fidelity(self, cases, cohort):
        return [
            {
                "case_id": c["id"],
                "diff": self.fixtures.prepare(c, 0, f"-v2-fidelity-{cohort}").fidelity_diff,
            }
            for c in cases
        ]

    def run(self, case, number, suffix):
        if source_digest(self.root) != self.initial_source:
            raise EvalGateError("SOURCE_DRIFT")
        trace = self.fn(case, number, suffix=suffix)
        # Never trust the old scorer's booleans. Record trace bytes before applying v2 graders.
        return json.loads(json.dumps(trace, ensure_ascii=False, default=str))

    def manifest_environment(self):
        return {
            "database_host": self.host,
            "fixed_now": os.environ.get("FIXED_NOW"),
            **self.attestation,
        }

    def commit(self):
        return subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=self.root, text=True
        ).strip()
