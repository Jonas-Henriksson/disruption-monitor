"""Structured JSON logging and request-ID propagation middleware.

- Generates a UUID request_id per request, stored in a context var.
- Adds X-Request-ID to response headers.
- Logs request start/end with method, path, status, duration.
- Uses JSON format when running on Lambda (AWS_LAMBDA_FUNCTION_NAME set),
  human-readable format locally.
"""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from contextvars import ContextVar
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

# ── Context var for request ID ────────────────────────────────
request_id_ctx: ContextVar[str] = ContextVar("request_id", default="")


def get_request_id() -> str:
    """Return the current request ID (empty string outside a request)."""
    return request_id_ctx.get()


# ── JSON formatter for Lambda ─────────────────────────────────

class JsonFormatter(logging.Formatter):
    """Structured JSON log formatter with request_id injection."""

    def format(self, record: logging.LogRecord) -> str:
        log_entry: dict[str, Any] = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        # Inject request_id if available
        rid = request_id_ctx.get()
        if rid:
            log_entry["request_id"] = rid

        # Include exception info if present
        if record.exc_info and record.exc_info[0] is not None:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry, default=str)


class HumanFormatter(logging.Formatter):
    """Human-readable log formatter with optional request_id."""

    def __init__(self) -> None:
        super().__init__(
            fmt="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt=None,
        )

    def format(self, record: logging.LogRecord) -> str:
        rid = request_id_ctx.get()
        if rid:
            record.msg = f"[{rid[:8]}] {record.msg}"
        return super().format(record)


def configure_logging(*, debug: bool = False) -> None:
    """Configure root logger with the appropriate formatter.

    Uses JSON on Lambda, human-readable locally.
    """
    on_lambda = bool(os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))
    level = logging.DEBUG if debug else logging.INFO

    root = logging.getLogger()
    root.setLevel(level)

    # Remove existing handlers to avoid duplicates
    root.handlers.clear()

    handler = logging.StreamHandler()
    handler.setLevel(level)

    if on_lambda:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(HumanFormatter())

    root.addHandler(handler)


# ── FastAPI middleware ─────────────────────────────────────────

class RequestIdMiddleware(BaseHTTPMiddleware):
    """Assign a request ID, log request start/end, add X-Request-ID header."""

    async def dispatch(self, request: Request, call_next) -> Response:
        # Accept incoming request ID or generate a new one
        rid = request.headers.get("X-Request-ID") or uuid.uuid4().hex
        token = request_id_ctx.set(rid)

        logger = logging.getLogger("backend.app.middleware")
        path = request.url.path
        method = request.method

        # Skip noisy health-check logging
        is_health = path.endswith("/health")

        if not is_health:
            logger.info("Request started: %s %s", method, path)

        t0 = time.monotonic()
        try:
            response = await call_next(request)
        except Exception:
            elapsed_ms = (time.monotonic() - t0) * 1000
            logger.error(
                "Request failed: %s %s (%.0fms)",
                method, path, elapsed_ms,
            )
            raise
        finally:
            request_id_ctx.reset(token)

        elapsed_ms = (time.monotonic() - t0) * 1000
        response.headers["X-Request-ID"] = rid

        if not is_health:
            logger.info(
                "Request completed: %s %s -> %d (%.0fms)",
                method, path, response.status_code, elapsed_ms,
            )

        return response
