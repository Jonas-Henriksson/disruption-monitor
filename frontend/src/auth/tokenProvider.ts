/**
 * Module-level token provider for non-React contexts (e.g., api.ts).
 *
 * The AuthProvider sets this function on mount so that api.ts can call it
 * to get a Bearer token without needing React hooks.
 */

type TokenProviderFn = () => Promise<string | null>;

let _tokenProvider: TokenProviderFn | null = null;

/** Called by AuthProvider to register the token acquisition function. */
export function setTokenProvider(fn: TokenProviderFn): void {
  _tokenProvider = fn;
}

/** Called by api.ts before each request. Returns null if auth is not active. */
export async function getToken(): Promise<string | null> {
  if (!_tokenProvider) return null;
  try {
    return await _tokenProvider();
  } catch {
    return null;
  }
}
