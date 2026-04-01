/**
 * Custom hook wrapping MSAL for clean consumption in React components.
 *
 * Provides: isAuthenticated, user info, login(), logout(), getAccessToken().
 */

import { useMsal, useIsAuthenticated, useAccount } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { loginRequest } from "./msalConfig";

export interface AuthUser {
  name: string;
  email: string;
}

export function useAuth() {
  const { instance, accounts, inProgress } = useMsal();
  const isAuthenticated = useIsAuthenticated();
  const account = useAccount(accounts[0] ?? null);

  const user: AuthUser | null = account
    ? {
        name: account.name || account.username || "User",
        email: account.username || "",
      }
    : null;

  const login = async () => {
    try {
      await instance.loginRedirect(loginRequest);
    } catch (err) {
      console.error("[SC Hub] Login failed:", err);
    }
  };

  const logout = async () => {
    try {
      await instance.logoutRedirect({
        postLogoutRedirectUri: window.location.origin,
      });
    } catch (err) {
      console.error("[SC Hub] Logout failed:", err);
    }
  };

  const getAccessToken = async (): Promise<string | null> => {
    if (!account) return null;
    try {
      const response = await instance.acquireTokenSilent({
        ...loginRequest,
        account,
      });
      return response.accessToken;
    } catch {
      // Silent token acquisition failed — fall back to redirect
      try {
        await instance.acquireTokenRedirect(loginRequest);
      } catch (err) {
        console.error("[SC Hub] Token acquisition failed:", err);
      }
      return null;
    }
  };

  const isLoading = inProgress !== InteractionStatus.None;

  return {
    isAuthenticated,
    isLoading,
    user,
    login,
    logout,
    getAccessToken,
  };
}
