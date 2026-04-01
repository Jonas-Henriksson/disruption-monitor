"""Azure Entra ID JWT token validation with JWKS key caching.

Fetches signing keys from Azure's JWKS endpoint, caches them in memory,
and validates JWT tokens for signature, expiry, audience, and issuer.
"""

from __future__ import annotations

import logging
import time
from typing import Any

import httpx
from jose import JWTError, jwt

from ..config import settings

logger = logging.getLogger(__name__)

# ── JWKS key cache ───────────────────────────────────────────────
_jwks_cache: dict[str, Any] = {}
_jwks_cache_time: float = 0.0
_JWKS_TTL_SECONDS: float = 3600.0  # 1 hour


def _build_jwks_url() -> str:
    tenant_id = settings.azure_tenant_id
    return f"https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys"


def _build_issuer() -> str:
    tenant_id = settings.azure_tenant_id
    return f"https://login.microsoftonline.com/{tenant_id}/v2.0"


async def _fetch_jwks() -> dict[str, Any]:
    """Fetch JWKS keys from Azure Entra ID, with in-memory caching."""
    global _jwks_cache, _jwks_cache_time

    now = time.monotonic()
    if _jwks_cache and (now - _jwks_cache_time) < _JWKS_TTL_SECONDS:
        return _jwks_cache

    url = _build_jwks_url()
    logger.info("Fetching JWKS keys from %s", url)

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        _jwks_cache_time = now

    logger.info("Cached %d JWKS keys", len(_jwks_cache.get("keys", [])))
    return _jwks_cache


def _find_signing_key(jwks: dict[str, Any], kid: str) -> dict[str, Any] | None:
    """Find the key matching the token's kid header."""
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    return None


async def validate_token(token: str) -> dict[str, Any]:
    """Validate an Azure Entra ID JWT token and return its claims.

    Checks:
    - Signature against Azure JWKS keys
    - Token expiry (exp claim)
    - Audience matches AZURE_CLIENT_ID
    - Issuer matches the tenant's v2.0 issuer URL

    Returns the decoded token claims dict on success.
    Raises JWTError or ValueError on failure.
    """
    # Decode header without verification to get the key ID
    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError as e:
        raise ValueError(f"Invalid token header: {e}") from e

    kid = unverified_header.get("kid")
    if not kid:
        raise ValueError("Token header missing 'kid' claim")

    # Fetch JWKS and find the matching key
    jwks = await _fetch_jwks()
    signing_key = _find_signing_key(jwks, kid)

    if signing_key is None:
        # Key not found -- force refresh cache in case keys were rotated
        global _jwks_cache_time
        _jwks_cache_time = 0.0
        jwks = await _fetch_jwks()
        signing_key = _find_signing_key(jwks, kid)

        if signing_key is None:
            raise ValueError(f"Unable to find signing key for kid: {kid}")

    # Validate and decode
    audience = settings.azure_client_id
    issuer = _build_issuer()

    claims = jwt.decode(
        token,
        signing_key,
        algorithms=["RS256"],
        audience=audience,
        issuer=issuer,
        options={
            "verify_aud": True,
            "verify_iss": True,
            "verify_exp": True,
        },
    )

    return claims


def extract_user_info(claims: dict[str, Any]) -> dict[str, Any]:
    """Extract user-friendly info from validated token claims."""
    return {
        "oid": claims.get("oid", ""),
        "name": claims.get("name", ""),
        "email": claims.get("preferred_username", "") or claims.get("email", ""),
        "roles": claims.get("roles", []),
        "scope": claims.get("scp", ""),
        "tenant_id": claims.get("tid", ""),
    }
