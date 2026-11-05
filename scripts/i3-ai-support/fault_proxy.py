"""DEV-169: local fault proxy in front of the Anthropic Messages API (no product code changes).

The FastAPI server is started with ANTHROPIC_BASE_URL=http://127.0.0.1:8787 (the Anthropic SDK reads it),
so every AI answer call passes through here. The runner switches the mode per trial:

    GET /_control?mode=passthrough|hang|malformed|drop|pause
    GET /_control?release=1        # let a paused request continue (passthrough)
    GET /_stats                    # {"mode":..., "requests": n, "waiting": bool}

passthrough  forward to https://api.anthropic.com (the API key header is forwarded, never logged)
hang         hold the request 12 s (longer than the 8 s answer timeout), then answer
malformed    HTTP 200 with a valid Messages envelope whose text is not JSON
drop         close the connection without a response
pause        hold until released (change_during_generation), then forward
Local only: binds 127.0.0.1.
"""

from __future__ import annotations

import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

UPSTREAM = "https://api.anthropic.com"
FORWARD_HEADERS = ("x-api-key", "anthropic-version", "anthropic-beta", "content-type")
STATE = {
    "mode": "passthrough",
    "requests": 0,
    "waiting": False,
    "last_model": None,
    "upstream_requests": 0,
    "upstream_status": None,
    "usage": None,
    "response_id": None,
    "epoch": 0,
}
PROVIDER = os.environ.get("I3_AI_PROVIDER", "anthropic")
PORT = int(os.environ.get("I3_PROXY_PORT", "8787"))
if PROVIDER not in {"anthropic", "openrouter"}:
    raise ValueError("Unsupported evaluation provider")
RELEASE = threading.Event()
LOCK = threading.Lock()

MALFORMED = {
    "id": "msg_eval_malformed",
    "type": "message",
    "role": "assistant",
    "model": "claude-haiku-4-5",
    "content": [{"type": "text", "text": "죄송해요, 지금은 답을 정리하지 못했어요"}],
    "stop_reason": "end_turn",
    "stop_sequence": None,
    "usage": {"input_tokens": 0, "output_tokens": 0},
}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # keep request lines (and headers) out of the console
        pass

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/_control":
            query = parse_qs(url.query)
            with LOCK:
                if "mode" in query:
                    STATE["mode"] = query["mode"][0]
                    RELEASE.clear()
                    STATE.update(
                        last_model=None,
                        upstream_status=None,
                        usage=None,
                        response_id=None,
                        epoch=STATE["epoch"] + 1,
                    )
                if "release" in query:
                    RELEASE.set()
            return self._json(200, dict(STATE))
        if url.path == "/_stats":
            return self._json(200, dict(STATE))
        return self._json(404, {"error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("content-length") or 0)
        payload = self.rfile.read(length)
        with LOCK:
            STATE["requests"] += 1
            mode = STATE["mode"]
            epoch = STATE["epoch"]
        if mode == "drop":
            self.close_connection = True
            self.connection.shutdown(2)
            return
        if mode == "hang":
            time.sleep(12)
            return self._json(200, MALFORMED)
        if mode == "malformed":
            return self._json(200, MALFORMED)
        if mode == "pause":
            STATE["waiting"] = True
            RELEASE.wait(timeout=60)
            STATE["waiting"] = False
        self._forward(payload, epoch)

    def _forward(self, payload: bytes, epoch: int) -> None:
        with LOCK:
            stale = epoch != STATE["epoch"]
            if not stale:
                STATE["upstream_requests"] += 1
        if stale:
            return self._json(409, {"error": {"type": "stale_evaluation_trial"}})
        headers = {k: v for k, v in self.headers.items() if k.lower() in FORWARD_HEADERS}
        url = UPSTREAM + self.path
        if PROVIDER == "openrouter":
            sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "server"))
            from app.core.config import get_settings

            request_body = json.loads(payload)
            request_body["model"] = "anthropic/claude-haiku-4.5"
            request_body["provider"] = {
                "allow_fallbacks": False,
                "max_price": {"prompt": 1, "completion": 5},
            }
            headers = {
                "Authorization": "Bearer " + get_settings().openrouter_api_key,
                "Content-Type": "application/json",
                "X-OpenRouter-Metadata": "enabled",
            }
            url = "https://openrouter.ai/api/v1/messages"
            payload = json.dumps(request_body).encode()
        request = urllib.request.Request(url, data=payload, headers=headers, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                status, body, ctype = (
                    response.status,
                    response.read(),
                    response.headers.get("content-type"),
                )
        except urllib.error.HTTPError as error:
            status, body, ctype = error.code, error.read(), error.headers.get("content-type")
        try:
            decoded = json.loads(body)
            with LOCK:
                if epoch == STATE["epoch"]:
                    STATE.update(
                        last_model=decoded.get("model"),
                        upstream_status=status,
                        usage=decoded.get("usage"),
                        response_id=decoded.get("id"),
                        provider=PROVIDER,
                    )
        except ValueError:
            pass
        self.send_response(status)
        self.send_header("content-type", ctype or "application/json")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"fault proxy on http://127.0.0.1:{PORT} provider={PROVIDER}", flush=True)
    server.serve_forever()
