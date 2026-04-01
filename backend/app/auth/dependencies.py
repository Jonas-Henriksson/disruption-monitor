"""FastAPI dependencies for Azure Entra ID authentication.

Provides get_current_user (strict 401) and get_optional_user (graceful None)
dependencies that can be injected into route handlers.

When AUTH_ENABLED is False (default for local dev), both dependencies
return a placeholder user dict without requiring any token.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ..config import settings
from .jwt_validator import extract_user_info, validate_token

logger = logging.getLogger(__name__)

# HTTPBearer with auto_error=False so we can handle missing tokens ourselves
_bearer_scheme = HTTPBearer(auto_error=False)

# Placeholder user when auth is disabled
_DEV_USER: dict[str, Any] = {
    "oid": "dev-local",
    "name": "Local Developer",
    "email": "dev@localhost",
    "roles": [],
    "scope": "",
    "tenant_id": "",
}


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> dict[str, Any]:
    """Validate Bearer token and return user info.

    If AUTH_ENABLED is False, returns a dev placeholder without validation.
    If AUTH_ENABLED is True and the token is missing or invalid, raises 401.
    """
    if not settings.auth_enabled:
        return _DEV_USER

    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authorization token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    try:
        claims = await validate_token(token)
        user = extract_user_info(claims)
        return user
    except Exception as exc:
        logger.warning("Token validation failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> dict[str, Any] | None:
    """Like get_current_user but returns None instead of raising 401.

    Useful for endpoints that work for both authenticated and anonymous users,
    with enhanced features for authenticated ones.
    """
    if not settings.auth_enabled:
        return _DEV_USER

    if credentials is None:
        return None

    token = credentials.credentials
    try:
        claims = await validate_token(token)
        return extract_user_info(claims)
    except Exception as exc:
        logger.debug("Optional token validation failed: %s", exc)
        return None
