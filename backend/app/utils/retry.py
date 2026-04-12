"""Lightweight async retry with exponential backoff and jitter.

No external dependencies (no tenacity). Retries only on transient errors
(5xx, connection errors) — never on 4xx client errors.
"""

from __future__ import annotations

import asyncio
import logging
import random
from typing import Any, Awaitable, Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


def _is_retryable(exc: Exception) -> bool:
    """Return True if the exception is transient and worth retrying.

    Retries on: connection errors, timeouts, 5xx server errors, rate-limits (429).
    Does NOT retry on: 4xx client errors (except 429).
    """
    # httpx HTTP status errors
    if hasattr(exc, "response") and hasattr(exc.response, "status_code"):
        code = exc.response.status_code
        return code == 429 or code >= 500

    # Anthropic API errors expose status_code directly
    if hasattr(exc, "status_code"):
        code = exc.status_code
        return code == 429 or code >= 500

    # Connection / timeout errors are always retryable
    exc_name = type(exc).__name__.lower()
    retryable_names = ("connect", "timeout", "eof", "reset", "broken", "unavailable")
    if any(name in exc_name for name in retryable_names):
        return True

    # OSError / ConnectionError family
    if isinstance(exc, (ConnectionError, TimeoutError, OSError)):
        return True

    return False


async def retry_async(
    fn: Callable[[], Awaitable[T]],
    *,
    max_retries: int = 3,
    base_delay: float = 1.0,
    operation: str = "operation",
) -> T:
    """Execute an async callable with exponential backoff and jitter.

    Args:
        fn: Zero-arg async callable to retry.
        max_retries: Maximum number of retries (total attempts = max_retries + 1).
        base_delay: Base delay in seconds before first retry.
        operation: Human-readable label for log messages.

    Raises:
        The last exception if all retries are exhausted, or immediately
        if the error is non-retryable (4xx client error).
    """
    last_exc: Exception | None = None
    for attempt in range(max_retries + 1):
        try:
            return await fn()
        except Exception as exc:
            last_exc = exc
            if attempt == max_retries or not _is_retryable(exc):
                if attempt > 0 and not _is_retryable(exc):
                    logger.warning(
                        "Non-retryable error on %s (attempt %d): %s",
                        operation, attempt + 1, exc,
                    )
                raise
            delay = base_delay * (2 ** attempt) + random.uniform(0, 0.5)
            logger.warning(
                "Retry %d/%d for %s after %.1fs: %s",
                attempt + 1, max_retries, operation, delay, exc,
            )
            await asyncio.sleep(delay)

    # Should never reach here, but satisfy the type checker
    raise last_exc  # type: ignore[misc]
