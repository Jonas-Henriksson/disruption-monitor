"""CloudWatch custom metrics for operational observability.

Emits metrics to CloudWatch when running on AWS Lambda. Locally, just logs.
All metric calls are wrapped in try/except so they never break the main flow.

Namespace: SCHub/DisruptionMonitor
"""

from __future__ import annotations

import logging
import os
import time
from contextlib import contextmanager
from typing import Any

logger = logging.getLogger(__name__)

_NAMESPACE = "SCHub/DisruptionMonitor"
_ON_LAMBDA = bool(os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))

# Lazy-init CloudWatch client
_cw_client = None


def _get_cw_client():
    """Lazy-init boto3 CloudWatch client."""
    global _cw_client
    if _cw_client is None:
        import boto3
        _cw_client = boto3.client("cloudwatch", region_name=os.environ.get("AWS_REGION", "eu-west-1"))
    return _cw_client


def emit_metric(
    name: str,
    value: float,
    unit: str = "Count",
    dimensions: dict[str, str] | None = None,
) -> None:
    """Emit a single CloudWatch metric.

    On Lambda: puts metric data to CloudWatch.
    Locally: logs at DEBUG level.

    Args:
        name: Metric name (e.g. "scan.duration_ms").
        value: Metric value.
        unit: CloudWatch unit — Count, Milliseconds, None, etc.
        dimensions: Key-value dimension pairs (e.g. {"mode": "disruptions"}).
    """
    try:
        dim_str = ", ".join(f"{k}={v}" for k, v in (dimensions or {}).items())
        if _ON_LAMBDA:
            cw_dims = [{"Name": k, "Value": v} for k, v in (dimensions or {}).items()]
            metric_data: dict[str, Any] = {
                "MetricName": name,
                "Value": value,
                "Unit": unit,
            }
            if cw_dims:
                metric_data["Dimensions"] = cw_dims

            _get_cw_client().put_metric_data(
                Namespace=_NAMESPACE,
                MetricData=[metric_data],
            )
            logger.debug("CW metric: %s=%s %s [%s]", name, value, unit, dim_str)
        else:
            logger.debug("Metric (local): %s=%s %s [%s]", name, value, unit, dim_str)
    except Exception:
        logger.debug("Failed to emit metric %s (non-fatal)", name, exc_info=True)


def emit_count(
    name: str,
    count: float = 1,
    dimensions: dict[str, str] | None = None,
) -> None:
    """Convenience: emit a Count metric."""
    emit_metric(name, count, unit="Count", dimensions=dimensions)


@contextmanager
def emit_timer(name: str, dimensions: dict[str, str] | None = None):
    """Context manager that emits duration in milliseconds.

    Usage:
        with emit_timer("scan.duration_ms", {"mode": "disruptions"}):
            await run_scan(...)
    """
    start = time.monotonic()
    try:
        yield
    finally:
        elapsed_ms = (time.monotonic() - start) * 1000
        emit_metric(name, round(elapsed_ms, 1), unit="Milliseconds", dimensions=dimensions)
