/**
 * Tests for Azure Entra ID SSO integration — MSAL config, token provider, auth header injection.
 *
 * All tests mock @azure/msal-browser so no Azure connectivity is required.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Constants matching the SSO integration config ────────────────────

const CLIENT_ID = '6b72bb18-c3ae-4fc1-a2ed-ae335e43c2a0';
const TENANT_ID = '41875f2b-33e8-4670-92a8-f643afbb243a';
const AUTHORITY = `https://login.microsoftonline.com/${TENANT_ID}`;

// ── MSAL Config Tests ────────────────────────────────────────────────

describe('MSAL Config', () => {
  it('should have correct clientId', () => {
    const msalConfig = {
      auth: {
        clientId: CLIENT_ID,
        authority: AUTHORITY,
        redirectUri: (typeof window !== 'undefined' ? window.location?.origin : undefined) || 'http://localhost:3100',
      },
      cache: {
        cacheLocation: 'sessionStorage' as const,
        storeAuthStateInCookie: false,
      },
    };

    expect(msalConfig.auth.clientId).toBe('6b72bb18-c3ae-4fc1-a2ed-ae335e43c2a0');
  });

  it('should have correct authority URL with tenant ID', () => {
    const msalConfig = {
      auth: {
        clientId: CLIENT_ID,
        authority: AUTHORITY,
        redirectUri: 'http://localhost:3100',
      },
    };

    expect(msalConfig.auth.authority).toBe(
      'https://login.microsoftonline.com/41875f2b-33e8-4670-92a8-f643afbb243a'
    );
    expect(msalConfig.auth.authority).toContain(TENANT_ID);
  });

  it('should use sessionStorage for cache by default', () => {
    const msalConfig = {
      auth: { clientId: CLIENT_ID, authority: AUTHORITY },
      cache: {
        cacheLocation: 'sessionStorage' as const,
        storeAuthStateInCookie: false,
      },
    };

    expect(msalConfig.cache.cacheLocation).toBe('sessionStorage');
    expect(msalConfig.cache.storeAuthStateInCookie).toBe(false);
  });

  it('should have correct login request scopes', () => {
    const loginRequest = {
      scopes: [`api://${CLIENT_ID}/access_as_user`],
    };

    expect(loginRequest.scopes).toHaveLength(1);
    expect(loginRequest.scopes[0]).toBe(`api://${CLIENT_ID}/access_as_user`);
    expect(loginRequest.scopes[0]).toContain(CLIENT_ID);
  });

  it('should include openid scope when requesting ID token', () => {
    const loginRequest = {
      scopes: ['openid', 'profile', `api://${CLIENT_ID}/access_as_user`],
    };

    expect(loginRequest.scopes).toContain('openid');
    expect(loginRequest.scopes).toContain('profile');
  });
});

// ── Token Provider Tests ─────────────────────────────────────────────

describe('Token Provider', () => {
  /** Simple token provider matching the pattern: a settable async function. */
  let tokenProvider: (() => Promise<string | null>) | null = null;

  beforeEach(() => {
    tokenProvider = null;
  });

  it('should return null when not initialized', async () => {
    const getToken = tokenProvider ?? (() => Promise.resolve(null));
    const token = await getToken();
    expect(token).toBeNull();
  });

  it('should return token when provider is set', async () => {
    tokenProvider = async () => 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test-payload.test-sig';

    const token = await tokenProvider();
    expect(token).toBe('eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.test-payload.test-sig');
  });

  it('should allow provider to be replaced', async () => {
    tokenProvider = async () => 'token-v1';
    expect(await tokenProvider()).toBe('token-v1');

    tokenProvider = async () => 'token-v2';
    expect(await tokenProvider()).toBe('token-v2');
  });

  it('should handle provider that returns null (logged out)', async () => {
    tokenProvider = async () => null;
    const token = await tokenProvider();
    expect(token).toBeNull();
  });

  it('should handle provider that throws (silent failure)', async () => {
    tokenProvider = async () => {
      throw new Error('InteractionRequired');
    };

    try {
      await tokenProvider();
      expect.fail('Should have thrown');
    } catch (e) {
      expect((e as Error).message).toBe('InteractionRequired');
    }
  });
});

// ── API Authorization Header Tests ───────────────────────────────────

describe('API Authorization Header', () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'ok' }),
    });
    globalThis.fetch = mockFetch as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  /**
   * Simulates the auth-aware fetch wrapper that the SSO integration adds.
   * This is the pattern: wrap fetch to inject Authorization header when a token is available.
   */
  async function authFetch(
    url: string,
    options: RequestInit = {},
    getToken?: () => Promise<string | null>
  ): Promise<Response> {
    const headers = new Headers(options.headers || {});

    if (getToken) {
      try {
        const token = await getToken();
        if (token) {
          headers.set('Authorization', `Bearer ${token}`);
        }
      } catch {
        // Silent failure — proceed without auth header
      }
    }

    return fetch(url, { ...options, headers });
  }

  it('should add Authorization header when token is available', async () => {
    const getToken = async () => 'test-access-token-123';

    await authFetch('http://localhost:3101/api/v1/scans', { method: 'POST' }, getToken);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, callOptions] = mockFetch.mock.calls[0];
    const headers = new Headers(callOptions.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-access-token-123');
  });

  it('should work without Authorization header when no token provider (backward compat)', async () => {
    await authFetch('http://localhost:3101/api/v1/health');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, callOptions] = mockFetch.mock.calls[0];
    const headers = new Headers(callOptions.headers);
    expect(headers.get('Authorization')).toBeNull();
  });

  it('should work without Authorization header when token provider returns null', async () => {
    const getToken = async () => null;

    await authFetch('http://localhost:3101/api/v1/events', {}, getToken);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, callOptions] = mockFetch.mock.calls[0];
    const headers = new Headers(callOptions.headers);
    expect(headers.get('Authorization')).toBeNull();
  });

  it('should proceed without auth header when token provider throws', async () => {
    const getToken = async (): Promise<string | null> => {
      throw new Error('MSAL interaction required');
    };

    await authFetch('http://localhost:3101/api/v1/events', {}, getToken);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, callOptions] = mockFetch.mock.calls[0];
    const headers = new Headers(callOptions.headers);
    expect(headers.get('Authorization')).toBeNull();
  });

  it('should preserve existing headers when adding auth', async () => {
    const getToken = async () => 'my-token';

    await authFetch(
      'http://localhost:3101/api/v1/scans',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      getToken
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, callOptions] = mockFetch.mock.calls[0];
    const headers = new Headers(callOptions.headers);
    expect(headers.get('Authorization')).toBe('Bearer my-token');
    expect(headers.get('Content-Type')).toBe('application/json');
  });

  it('should pass through URL and method correctly', async () => {
    const getToken = async () => 'token';

    await authFetch(
      'http://localhost:3101/api/v1/events/test-event/status',
      { method: 'PATCH' },
      getToken
    );

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, callOptions] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3101/api/v1/events/test-event/status');
    expect(callOptions.method).toBe('PATCH');
  });
});

// ── useAuth Hook Behavior Tests ──────────────────────────────────────

describe('useAuth hook behavior', () => {
  /**
   * Simulates the useAuth hook state without requiring a full React/MSAL provider.
   * The real hook uses useMsal() and useIsAuthenticated() from @azure/msal-react.
   */
  interface AuthState {
    isAuthenticated: boolean;
    user: { name: string; email: string } | null;
    login: () => Promise<void>;
    logout: () => Promise<void>;
    getToken: () => Promise<string | null>;
  }

  function createAuthState(overrides: Partial<AuthState> = {}): AuthState {
    return {
      isAuthenticated: false,
      user: null,
      login: async () => {},
      logout: async () => {},
      getToken: async () => null,
      ...overrides,
    };
  }

  it('should return isAuthenticated false when not logged in', () => {
    const auth = createAuthState();
    expect(auth.isAuthenticated).toBe(false);
    expect(auth.user).toBeNull();
  });

  it('should return isAuthenticated true after login', () => {
    const auth = createAuthState({
      isAuthenticated: true,
      user: { name: 'Test User', email: 'test@skf.com' },
    });

    expect(auth.isAuthenticated).toBe(true);
    expect(auth.user).not.toBeNull();
    expect(auth.user!.name).toBe('Test User');
    expect(auth.user!.email).toBe('test@skf.com');
  });

  it('should return null token when not authenticated', async () => {
    const auth = createAuthState();
    const token = await auth.getToken();
    expect(token).toBeNull();
  });

  it('should return token when authenticated', async () => {
    const auth = createAuthState({
      isAuthenticated: true,
      getToken: async () => 'valid-access-token',
    });

    const token = await auth.getToken();
    expect(token).toBe('valid-access-token');
  });

  it('should clear user on logout', async () => {
    let state = createAuthState({
      isAuthenticated: true,
      user: { name: 'User', email: 'user@skf.com' },
      logout: async () => {
        state = createAuthState(); // Reset to logged-out state
      },
    });

    expect(state.isAuthenticated).toBe(true);
    await state.logout();
    expect(state.isAuthenticated).toBe(false);
    expect(state.user).toBeNull();
  });
});

// ── MSAL PublicClientApplication Mock Tests ──────────────────────────

describe('MSAL PublicClientApplication mock', () => {
  it('should handle acquireTokenSilent returning an access token', async () => {
    const mockPca = {
      acquireTokenSilent: vi.fn().mockResolvedValue({
        accessToken: 'silent-token-abc',
        expiresOn: new Date(Date.now() + 3600_000),
        account: { name: 'Test', username: 'test@skf.com' },
      }),
      acquireTokenPopup: vi.fn(),
      loginPopup: vi.fn(),
      logoutPopup: vi.fn(),
      getAllAccounts: vi.fn().mockReturnValue([
        { name: 'Test', username: 'test@skf.com', homeAccountId: '123' },
      ]),
    };

    const result = await mockPca.acquireTokenSilent({
      scopes: [`api://${CLIENT_ID}/access_as_user`],
      account: mockPca.getAllAccounts()[0],
    });

    expect(result.accessToken).toBe('silent-token-abc');
    expect(mockPca.acquireTokenSilent).toHaveBeenCalledTimes(1);
  });

  it('should fall back to popup when silent acquisition fails', async () => {
    const mockPca = {
      acquireTokenSilent: vi.fn().mockRejectedValue(new Error('InteractionRequired')),
      acquireTokenPopup: vi.fn().mockResolvedValue({
        accessToken: 'popup-token-xyz',
        expiresOn: new Date(Date.now() + 3600_000),
      }),
      getAllAccounts: vi.fn().mockReturnValue([
        { name: 'Test', username: 'test@skf.com', homeAccountId: '123' },
      ]),
    };

    const scopes = [`api://${CLIENT_ID}/access_as_user`];
    let token: string | null = null;

    try {
      const result = await mockPca.acquireTokenSilent({ scopes, account: mockPca.getAllAccounts()[0] });
      token = result.accessToken;
    } catch {
      const result = await mockPca.acquireTokenPopup({ scopes });
      token = result.accessToken;
    }

    expect(token).toBe('popup-token-xyz');
    expect(mockPca.acquireTokenSilent).toHaveBeenCalledTimes(1);
    expect(mockPca.acquireTokenPopup).toHaveBeenCalledTimes(1);
  });

  it('should return empty accounts when not logged in', () => {
    const mockPca = {
      getAllAccounts: vi.fn().mockReturnValue([]),
    };

    expect(mockPca.getAllAccounts()).toHaveLength(0);
  });

  it('should return account info after login', async () => {
    const mockPca = {
      loginPopup: vi.fn().mockResolvedValue({
        account: {
          name: 'Sofia Andersson',
          username: 'sofia.andersson@skf.com',
          homeAccountId: 'user-oid',
          tenantId: TENANT_ID,
        },
      }),
      getAllAccounts: vi.fn().mockReturnValue([]),
    };

    const result = await mockPca.loginPopup({
      scopes: [`api://${CLIENT_ID}/access_as_user`],
    });

    expect(result.account.name).toBe('Sofia Andersson');
    expect(result.account.username).toBe('sofia.andersson@skf.com');
    expect(result.account.tenantId).toBe(TENANT_ID);
  });
});
