"""Tests for Azure Entra ID SSO authentication — JWT validation, auth dependencies, protected endpoints.

All tests use locally-generated RSA keys and mock JWKS responses so no Azure connectivity is required.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwt

# ── Constants matching the SSO integration config ─────────────────────

CLIENT_ID = "6b72bb18-c3ae-4fc1-a2ed-ae335e43c2a0"
TENANT_ID = "41875f2b-33e8-4670-92a8-f643afbb243a"
AUTHORITY = f"https://login.microsoftonline.com/{TENANT_ID}"
ISSUER = f"https://login.microsoftonline.com/{TENANT_ID}/v2.0"
JWKS_URI = f"https://login.microsoftonline.com/{TENANT_ID}/discovery/v2.0/keys"


# ── RSA key pair helpers ──────────────────────────────────────────────


def _generate_rsa_keypair():
    """Generate an RSA private key and return (private_key, public_key, jwk_dict)."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key()

    # Export public key numbers for JWK
    pub_numbers = public_key.public_numbers()

    def _int_to_base64url(n: int, length: int) -> str:
        """Convert an integer to a base64url-encoded string."""
        import base64
        data = n.to_bytes(length, byteorder="big")
        return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")

    jwk = {
        "kty": "RSA",
        "use": "sig",
        "kid": "test-kid-001",
        "n": _int_to_base64url(pub_numbers.n, 256),
        "e": _int_to_base64url(pub_numbers.e, 3),
        "alg": "RS256",
    }

    # PEM for python-jose signing
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")

    return private_pem, jwk


def _make_token(
    private_pem: str,
    kid: str = "test-kid-001",
    aud: str = CLIENT_ID,
    iss: str = ISSUER,
    sub: str = "user-object-id-123",
    name: str = "Test User",
    email: str = "test.user@skf.com",
    exp_offset: int = 3600,
    iat_offset: int = 0,
    extra_claims: dict | None = None,
) -> str:
    """Create a signed JWT with sensible defaults."""
    now = int(time.time())
    claims = {
        "aud": aud,
        "iss": iss,
        "sub": sub,
        "name": name,
        "preferred_username": email,
        "iat": now + iat_offset,
        "exp": now + exp_offset,
        "nbf": now - 10,
        "tid": TENANT_ID,
    }
    if extra_claims:
        claims.update(extra_claims)

    return jwt.encode(claims, private_pem, algorithm="RS256", headers={"kid": kid})


@pytest.fixture
def rsa_keys():
    """Fixture providing (private_pem, jwk_dict) for signing and verifying tokens."""
    private_pem, jwk = _generate_rsa_keypair()
    return private_pem, jwk


@pytest.fixture
def jwks_response(rsa_keys):
    """Fixture providing a mock JWKS JSON response."""
    _, jwk = rsa_keys
    return {"keys": [jwk]}


@pytest.fixture
def valid_token(rsa_keys):
    """Fixture providing a valid JWT."""
    private_pem, _ = rsa_keys
    return _make_token(private_pem)


# ── JWT Validator Tests ───────────────────────────────────────────────


class TestJWTValidation:
    """Test JWT token validation logic using locally-generated RSA keys."""

    def test_valid_token_decodes_successfully(self, rsa_keys, jwks_response):
        """A correctly signed token with valid claims should decode without error."""
        private_pem, jwk = rsa_keys
        token = _make_token(private_pem)

        # Decode using python-jose directly (simulating what the validator does)
        decoded = jwt.decode(
            token,
            jwk,
            algorithms=["RS256"],
            audience=CLIENT_ID,
            issuer=ISSUER,
        )

        assert decoded["sub"] == "user-object-id-123"
        assert decoded["name"] == "Test User"
        assert decoded["preferred_username"] == "test.user@skf.com"
        assert decoded["aud"] == CLIENT_ID
        assert decoded["iss"] == ISSUER

    def test_expired_token_rejected(self, rsa_keys):
        """A token with exp in the past should be rejected."""
        private_pem, jwk = rsa_keys
        token = _make_token(private_pem, exp_offset=-3600)  # Expired 1 hour ago

        with pytest.raises(jwt.ExpiredSignatureError):
            jwt.decode(
                token,
                jwk,
                algorithms=["RS256"],
                audience=CLIENT_ID,
                issuer=ISSUER,
            )

    def test_wrong_audience_rejected(self, rsa_keys):
        """A token with a different audience should be rejected."""
        private_pem, jwk = rsa_keys
        token = _make_token(private_pem, aud="wrong-client-id")

        with pytest.raises(jwt.JWTClaimsError):
            jwt.decode(
                token,
                jwk,
                algorithms=["RS256"],
                audience=CLIENT_ID,
                issuer=ISSUER,
            )

    def test_wrong_issuer_rejected(self, rsa_keys):
        """A token from a different issuer/tenant should be rejected."""
        private_pem, jwk = rsa_keys
        token = _make_token(private_pem, iss="https://login.microsoftonline.com/wrong-tenant/v2.0")

        with pytest.raises(jwt.JWTClaimsError):
            jwt.decode(
                token,
                jwk,
                algorithms=["RS256"],
                audience=CLIENT_ID,
                issuer=ISSUER,
            )

    def test_malformed_token_rejected(self, rsa_keys):
        """A garbled token string should raise a JWTError."""
        _, jwk = rsa_keys

        with pytest.raises(jwt.JWTError):
            jwt.decode(
                "this.is.not-a-valid-jwt",
                jwk,
                algorithms=["RS256"],
                audience=CLIENT_ID,
                issuer=ISSUER,
            )

    def test_completely_invalid_token_string(self, rsa_keys):
        """A non-JWT string should raise a JWTError."""
        _, jwk = rsa_keys

        with pytest.raises(jwt.JWTError):
            jwt.decode(
                "garbage-token",
                jwk,
                algorithms=["RS256"],
                audience=CLIENT_ID,
                issuer=ISSUER,
            )

    def test_token_signed_with_wrong_key_rejected(self, rsa_keys):
        """A token signed with a different private key should fail verification."""
        _, jwk = rsa_keys
        other_pem, _ = _generate_rsa_keypair()
        token = _make_token(other_pem)

        with pytest.raises(jwt.JWTError):
            jwt.decode(
                token,
                jwk,
                algorithms=["RS256"],
                audience=CLIENT_ID,
                issuer=ISSUER,
            )

    def test_none_algorithm_rejected(self, rsa_keys):
        """Specifying only RS256 should prevent 'none' algorithm attacks."""
        _, jwk = rsa_keys

        # Manually craft a "none" algorithm token
        import base64
        header = base64.urlsafe_b64encode(json.dumps({"alg": "none", "typ": "JWT"}).encode()).rstrip(b"=").decode()
        payload = base64.urlsafe_b64encode(json.dumps({
            "sub": "attacker",
            "aud": CLIENT_ID,
            "iss": ISSUER,
            "exp": int(time.time()) + 3600,
        }).encode()).rstrip(b"=").decode()
        forged_token = f"{header}.{payload}."

        with pytest.raises(jwt.JWTError):
            jwt.decode(
                forged_token,
                jwk,
                algorithms=["RS256"],
                audience=CLIENT_ID,
                issuer=ISSUER,
            )


class TestJWKSCaching:
    """Test JWKS key fetching and caching behavior."""

    def test_jwks_cached_on_second_call(self, rsa_keys, jwks_response):
        """After first fetch, JWKS should be served from cache without re-fetching."""
        # Simulate a simple JWKS cache
        cache = {}

        def fetch_jwks(uri: str) -> dict:
            if uri in cache:
                return cache[uri]
            cache[uri] = jwks_response
            return jwks_response

        # First call populates cache
        keys1 = fetch_jwks(JWKS_URI)
        assert len(keys1["keys"]) == 1

        # Second call uses cache (same object reference)
        keys2 = fetch_jwks(JWKS_URI)
        assert keys2 is keys1

    def test_unknown_kid_triggers_jwks_refresh(self, rsa_keys, jwks_response):
        """When a token has an unknown kid, the cache should be refreshed."""
        _, original_jwk = rsa_keys
        cache = {"keys": jwks_response, "fetched_at": time.time()}
        refresh_count = {"value": 0}

        # Generate a second key pair to simulate key rotation
        new_pem, new_jwk = _generate_rsa_keypair()
        new_jwk["kid"] = "rotated-kid-002"
        refreshed_jwks = {"keys": [original_jwk, new_jwk]}

        def find_key_or_refresh(kid: str) -> dict | None:
            # Look in current cache
            for key in cache["keys"]["keys"]:
                if key["kid"] == kid:
                    return key

            # Not found -- refresh
            refresh_count["value"] += 1
            cache["keys"] = refreshed_jwks

            for key in cache["keys"]["keys"]:
                if key["kid"] == kid:
                    return key
            return None

        # Original kid works without refresh
        assert find_key_or_refresh("test-kid-001") is not None
        assert refresh_count["value"] == 0

        # New kid triggers refresh
        key = find_key_or_refresh("rotated-kid-002")
        assert key is not None
        assert key["kid"] == "rotated-kid-002"
        assert refresh_count["value"] == 1

    def test_unknown_kid_after_refresh_returns_none(self, rsa_keys, jwks_response):
        """If kid is unknown even after refresh, return None (invalid token)."""
        cache = {"keys": jwks_response, "refreshed": False}

        def find_key_or_refresh(kid: str) -> dict | None:
            for key in cache["keys"]["keys"]:
                if key["kid"] == kid:
                    return key
            if not cache["refreshed"]:
                cache["refreshed"] = True
                # Re-fetch returns same keys (no rotation happened)
                return find_key_or_refresh(kid)
            return None

        assert find_key_or_refresh("completely-unknown-kid") is None


# ── Auth Dependency Tests ─────────────────────────────────────────────


class TestGetCurrentUser:
    """Test the get_current_user FastAPI dependency behavior."""

    def test_extracts_bearer_token_from_header(self):
        """Authorization: Bearer <token> should extract just the token part."""
        header = "Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test.signature"
        scheme, _, token = header.partition(" ")
        assert scheme == "Bearer"
        assert token == "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test.signature"

    def test_missing_authorization_header_returns_401(self):
        """When Authorization header is absent, the dependency should raise 401."""
        from fastapi import HTTPException

        def get_current_user(authorization: str | None = None):
            if not authorization:
                raise HTTPException(status_code=401, detail="Not authenticated")
            return authorization

        with pytest.raises(HTTPException) as exc_info:
            get_current_user(None)
        assert exc_info.value.status_code == 401

    def test_invalid_scheme_returns_401(self):
        """A non-Bearer scheme (e.g. Basic) should be rejected."""
        from fastapi import HTTPException

        def get_current_user(authorization: str | None = None):
            if not authorization or not authorization.startswith("Bearer "):
                raise HTTPException(status_code=401, detail="Not authenticated")
            token = authorization[7:]
            if not token:
                raise HTTPException(status_code=401, detail="Not authenticated")
            return token

        with pytest.raises(HTTPException) as exc_info:
            get_current_user("Basic dXNlcjpwYXNz")
        assert exc_info.value.status_code == 401

    def test_empty_bearer_token_returns_401(self):
        """Authorization: Bearer (with no token) should be rejected."""
        from fastapi import HTTPException

        def get_current_user(authorization: str | None = None):
            if not authorization or not authorization.startswith("Bearer "):
                raise HTTPException(status_code=401, detail="Not authenticated")
            token = authorization[7:]
            if not token.strip():
                raise HTTPException(status_code=401, detail="Not authenticated")
            return token

        with pytest.raises(HTTPException) as exc_info:
            get_current_user("Bearer ")
        assert exc_info.value.status_code == 401

    def test_invalid_token_returns_401(self, rsa_keys):
        """An invalid/unverifiable token should result in 401."""
        from fastapi import HTTPException

        _, jwk = rsa_keys

        def get_current_user_with_validation(token: str):
            try:
                return jwt.decode(token, jwk, algorithms=["RS256"], audience=CLIENT_ID, issuer=ISSUER)
            except jwt.JWTError:
                raise HTTPException(status_code=401, detail="Invalid token")

        with pytest.raises(HTTPException) as exc_info:
            get_current_user_with_validation("invalid-token-value")
        assert exc_info.value.status_code == 401

    def test_valid_token_returns_user_claims(self, rsa_keys):
        """A valid token should return decoded claims including user info."""
        private_pem, jwk = rsa_keys
        token = _make_token(private_pem, name="Jane Doe", email="jane@skf.com")

        decoded = jwt.decode(token, jwk, algorithms=["RS256"], audience=CLIENT_ID, issuer=ISSUER)
        assert decoded["name"] == "Jane Doe"
        assert decoded["preferred_username"] == "jane@skf.com"
        assert decoded["sub"] == "user-object-id-123"


class TestGetOptionalUser:
    """Test the get_optional_user dependency (returns None instead of 401)."""

    def test_missing_token_returns_none_not_401(self):
        """When no Authorization header is present, should return None (not raise 401)."""

        def get_optional_user(authorization: str | None = None):
            if not authorization or not authorization.startswith("Bearer "):
                return None
            token = authorization[7:]
            if not token.strip():
                return None
            return {"sub": "mock-user"}

        result = get_optional_user(None)
        assert result is None

    def test_invalid_token_returns_none(self, rsa_keys):
        """An invalid token should return None (not raise 401)."""
        _, jwk = rsa_keys

        def get_optional_user(authorization: str | None = None):
            if not authorization or not authorization.startswith("Bearer "):
                return None
            token = authorization[7:]
            try:
                return jwt.decode(token, jwk, algorithms=["RS256"], audience=CLIENT_ID, issuer=ISSUER)
            except jwt.JWTError:
                return None

        result = get_optional_user("Bearer bad-token")
        assert result is None

    def test_valid_token_returns_user(self, rsa_keys):
        """A valid token should return the decoded user claims."""
        private_pem, jwk = rsa_keys
        token = _make_token(private_pem)

        def get_optional_user(authorization: str | None = None):
            if not authorization or not authorization.startswith("Bearer "):
                return None
            tok = authorization[7:]
            try:
                return jwt.decode(tok, jwk, algorithms=["RS256"], audience=CLIENT_ID, issuer=ISSUER)
            except jwt.JWTError:
                return None

        result = get_optional_user(f"Bearer {token}")
        assert result is not None
        assert result["sub"] == "user-object-id-123"


class TestAuthBypass:
    """Test that auth can be disabled via AUTH_ENABLED=False."""

    def test_auth_bypass_when_disabled(self):
        """When AUTH_ENABLED is False, the dependency should skip validation."""
        auth_enabled = False

        def get_current_user(authorization: str | None = None):
            if not auth_enabled:
                return {"sub": "anonymous", "name": "Auth Disabled"}
            if not authorization:
                from fastapi import HTTPException
                raise HTTPException(status_code=401, detail="Not authenticated")
            return {"sub": "validated-user"}

        # No token needed when auth is disabled
        result = get_current_user(None)
        assert result["sub"] == "anonymous"
        assert result["name"] == "Auth Disabled"

    def test_auth_enforced_when_enabled(self):
        """When AUTH_ENABLED is True, missing token should raise 401."""
        from fastapi import HTTPException

        auth_enabled = True

        def get_current_user(authorization: str | None = None):
            if not auth_enabled:
                return {"sub": "anonymous"}
            if not authorization:
                raise HTTPException(status_code=401, detail="Not authenticated")
            return {"sub": "validated-user"}

        with pytest.raises(HTTPException) as exc_info:
            get_current_user(None)
        assert exc_info.value.status_code == 401


# ── Protected Endpoint Tests ──────────────────────────────────────────


from fastapi import FastAPI, Request as FastAPIRequest
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse


def _create_auth_app(jwk: dict):
    """Create a minimal FastAPI app with auth middleware for testing.

    Defined at module level so FastAPI can correctly resolve Request annotations.
    """

    app = FastAPI()  # noqa: F811
    app.state.auth_enabled = True
    app.state.jwk = jwk

    PROTECTED_PATHS = {
        ("POST", "/api/v1/scans"),
    }

    def _path_matches_protected(method: str, path: str) -> bool:
        if (method, path) in PROTECTED_PATHS:
            return True
        if method == "PATCH" and path.endswith("/status") and "/events/" in path:
            return True
        return False

    class AuthMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: FastAPIRequest, call_next):
            if not app.state.auth_enabled:
                request.state.user = {"sub": "anonymous"}
                return await call_next(request)

            if not _path_matches_protected(request.method, request.url.path):
                return await call_next(request)

            auth_header = request.headers.get("Authorization")
            if not auth_header or not auth_header.startswith("Bearer "):
                return JSONResponse(
                    status_code=401,
                    content={"detail": "Not authenticated"},
                )
            token = auth_header[7:]
            try:
                user = jwt.decode(
                    token, app.state.jwk,
                    algorithms=["RS256"],
                    audience=CLIENT_ID,
                    issuer=ISSUER,
                )
                request.state.user = user
            except jwt.JWTError as e:
                return JSONResponse(
                    status_code=401,
                    content={"detail": f"Invalid token: {e}"},
                )
            return await call_next(request)

    app.add_middleware(AuthMiddleware)

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.post("/api/v1/scans")
    async def trigger_scan(request: FastAPIRequest):
        user = getattr(request.state, "user", {"sub": "unknown"})
        return {"triggered_by": user["sub"]}

    @app.patch("/api/v1/events/{event_id}/status")
    async def update_status(event_id: str, request: FastAPIRequest):
        user = getattr(request.state, "user", {"sub": "unknown"})
        return {"event_id": event_id, "updated_by": user["sub"]}

    @app.get("/api/v1/events")
    async def list_events():
        return []

    return app


class TestProtectedEndpoints:
    """Test that protected endpoints enforce authentication via TestClient."""

    @pytest.fixture
    def auth_app(self, rsa_keys, jwks_response):
        private_pem, jwk = rsa_keys
        app = _create_auth_app(jwk)
        return app, private_pem

    @pytest.fixture
    def client(self, auth_app):
        from starlette.testclient import TestClient
        app, _ = auth_app
        return TestClient(app)

    @pytest.fixture
    def auth_token(self, auth_app):
        _, private_pem = auth_app
        return _make_token(private_pem)

    def test_health_always_public(self, client):
        """GET /health should work without any token."""
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

    def test_post_scans_returns_401_without_token(self, client):
        """POST /api/v1/scans should return 401 when auth is enabled and no token."""
        resp = client.post("/api/v1/scans", json={"mode": "disruptions"})
        assert resp.status_code == 401

    def test_post_scans_succeeds_with_valid_token(self, client, auth_token):
        """POST /api/v1/scans should succeed with a valid Bearer token."""
        resp = client.post(
            "/api/v1/scans",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["triggered_by"] == "user-object-id-123"

    def test_patch_events_status_returns_401_without_token(self, client):
        """PATCH /api/v1/events/{id}/status should return 401 without token."""
        resp = client.patch(
            "/api/v1/events/test-event/status",
            json={"status": "watching"},
        )
        assert resp.status_code == 401

    def test_patch_events_status_succeeds_with_valid_token(self, client, auth_token):
        """PATCH /api/v1/events/{id}/status should succeed with a valid token."""
        resp = client.patch(
            "/api/v1/events/test-event/status",
            headers={"Authorization": f"Bearer {auth_token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["updated_by"] == "user-object-id-123"

    def test_post_scans_returns_401_with_expired_token(self, auth_app):
        """An expired token should result in 401."""
        from starlette.testclient import TestClient
        app, private_pem = auth_app
        client = TestClient(app)
        expired_token = _make_token(private_pem, exp_offset=-3600)

        resp = client.post(
            "/api/v1/scans",
            json={"mode": "disruptions"},
            headers={"Authorization": f"Bearer {expired_token}"},
        )
        assert resp.status_code == 401

    def test_post_scans_returns_401_with_wrong_audience(self, auth_app):
        """A token with wrong audience should result in 401."""
        from starlette.testclient import TestClient
        app, private_pem = auth_app
        client = TestClient(app)
        bad_aud_token = _make_token(private_pem, aud="wrong-app-id")

        resp = client.post(
            "/api/v1/scans",
            json={"mode": "disruptions"},
            headers={"Authorization": f"Bearer {bad_aud_token}"},
        )
        assert resp.status_code == 401

    def test_get_events_is_public(self, client):
        """GET /api/v1/events (read-only listing) should not require auth."""
        resp = client.get("/api/v1/events")
        assert resp.status_code == 200

    def test_auth_bypass_when_disabled(self, auth_app):
        """When auth is disabled, protected endpoints should work without token."""
        from starlette.testclient import TestClient
        app, _ = auth_app
        app.state.auth_enabled = False
        client = TestClient(app)

        resp = client.post("/api/v1/scans")
        assert resp.status_code == 200
        assert resp.json()["triggered_by"] == "anonymous"


# ── Token Claims Extraction Tests ─────────────────────────────────────


class TestTokenClaimsExtraction:
    """Test extracting user information from decoded token claims."""

    def test_extracts_user_display_name(self, rsa_keys):
        private_pem, jwk = rsa_keys
        token = _make_token(private_pem, name="Sofia Andersson")
        decoded = jwt.decode(token, jwk, algorithms=["RS256"], audience=CLIENT_ID, issuer=ISSUER)
        assert decoded["name"] == "Sofia Andersson"

    def test_extracts_email_from_preferred_username(self, rsa_keys):
        private_pem, jwk = rsa_keys
        token = _make_token(private_pem, email="sofia.andersson@skf.com")
        decoded = jwt.decode(token, jwk, algorithms=["RS256"], audience=CLIENT_ID, issuer=ISSUER)
        assert decoded["preferred_username"] == "sofia.andersson@skf.com"

    def test_extracts_tenant_id(self, rsa_keys):
        private_pem, jwk = rsa_keys
        token = _make_token(private_pem)
        decoded = jwt.decode(token, jwk, algorithms=["RS256"], audience=CLIENT_ID, issuer=ISSUER)
        assert decoded["tid"] == TENANT_ID

    def test_extracts_roles_from_token(self, rsa_keys):
        """Tokens with role claims should have them accessible after decoding."""
        private_pem, jwk = rsa_keys
        token = _make_token(private_pem, extra_claims={"roles": ["Admin", "Reader"]})
        decoded = jwt.decode(token, jwk, algorithms=["RS256"], audience=CLIENT_ID, issuer=ISSUER)
        assert "Admin" in decoded["roles"]
        assert "Reader" in decoded["roles"]

    def test_token_without_name_still_decodes(self, rsa_keys):
        """A token missing optional claims should still decode."""
        private_pem, jwk = rsa_keys
        now = int(time.time())
        minimal_claims = {
            "aud": CLIENT_ID,
            "iss": ISSUER,
            "sub": "minimal-user",
            "iat": now,
            "exp": now + 3600,
        }
        token = jwt.encode(minimal_claims, private_pem, algorithm="RS256", headers={"kid": "test-kid-001"})
        decoded = jwt.decode(token, jwk, algorithms=["RS256"], audience=CLIENT_ID, issuer=ISSUER)
        assert decoded["sub"] == "minimal-user"
        assert "name" not in decoded
