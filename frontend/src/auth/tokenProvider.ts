/**
 * Module-level token provider for non-React contexts (e.g., api.ts).
 *
 * The AuthProvider sets this function on mount so that api.ts can call it
 * to get a Bearer token without needing React hooks.
 */

import { msalInstance, graphScopes } from "./msalConfig";

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

/**
 * Acquire a token with MS Graph API scopes (incremental consent).
 * Tries silent acquisition first, falls back to popup for consent prompt.
 * Returns the access token string or null on failure.
 */
export async function getGraphToken(): Promise<string | null> {
  try {
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length === 0) return null;
    const response = await msalInstance.acquireTokenSilent({
      ...graphScopes,
      account: accounts[0],
    });
    return response.accessToken;
  } catch {
    // Silent failed — need incremental consent via popup
    try {
      const response = await msalInstance.acquireTokenPopup(graphScopes);
      return response.accessToken;
    } catch (err) {
      console.error("[SC Hub] Graph token acquisition failed:", err);
      return null;
    }
  }
}
