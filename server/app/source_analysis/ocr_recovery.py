"""Durable, budget-external OCR crop recovery; callbacks fence and reserve every send."""

import hashlib
import json
import random
import re
import time

from app.ai.source_analysis import ExtractionError
from app.ai.source_ocr import OCR_MODEL, OCR_PROMPT, Transcription
from app.source_analysis.preprocess import scrub

VERSION = "ocr-recovery-v1"
MAX_ATTEMPTS = 3


def successful_checkpoints(diagnostics):
    """Explicit acknowledged retries carry successes, never uncertain in-flight work."""
    return {
        k: v
        for k, v in diagnostics.get("ocrRecovery", {}).items()
        if v.get("status") == "SUCCEEDED"
    }


class Recovery:
    def __init__(self, binding, load, save, *, sleep=time.sleep, jitter=random.random):
        self.binding, self.load, self.save = binding, load, save
        self.sleep, self.jitter = sleep, jitter

    def __call__(self, call, stage, model, chunk, targets, images, send, tokens):
        base = re.sub(r"-retry$", "", stage)
        key = hashlib.sha256(
            json.dumps(
                [VERSION, self.binding, base, model, OCR_MODEL, OCR_PROMPT, images], sort_keys=True
            ).encode()
        ).hexdigest()
        state = self.load(key) or {"status": "PENDING", "attempts": 0, "history": []}
        if state["status"] == "SUCCEEDED":
            return Transcription(state["lines"], {"cost": 0}, None)
        if state["status"] == "IN_FLIGHT":
            raise ExtractionError(
                "REQUEST_UNCERTAIN",
                details={"errorCategory": "INTERRUPTED_IN_FLIGHT", "automaticRetry": False},
            )
        while state["attempts"] < MAX_ATTEMPTS:
            state = {**state, "status": "IN_FLIGHT", "attempts": state["attempts"] + 1}
            self.save(key, state)
            attempt = state["attempts"]
            suffix = "" if attempt == 1 else f"-recovery-{attempt}"
            try:
                response = call(stage + suffix, model, chunk, targets, images, send, tokens)
            except ExtractionError as exc:
                retryable = exc.details.get("automaticRetry") is True and exc.code in {
                    "REQUEST_UNCERTAIN",
                    "RATE_LIMITED",
                }
                delay = max(2**attempt + self.jitter(), exc.details.get("retryAfterSeconds", 0))
                event = {
                    "attempt": attempt,
                    "code": exc.code,
                    "category": exc.details.get("errorCategory", "UNCLASSIFIED"),
                    "httpStatus": exc.details.get("httpStatus"),
                    "retryable": retryable,
                }
                state = {**state, "status": "FAILED", "history": [*state["history"], event]}
                self.save(key, state)
                if not retryable or attempt >= MAX_ATTEMPTS or delay > 30:
                    raise
                self.sleep(delay)
            else:
                if response.skipped:
                    self.save(key, {**state, "status": "NOT_SENT"})
                    return response
                state = {
                    **state,
                    "status": "SUCCEEDED",
                    "lines": [scrub(line) for line in response.lines],
                    "requestId": response.request_id,
                }
                self.save(key, state)
                return response
        raise ExtractionError("OCR_RETRIES_EXHAUSTED")
