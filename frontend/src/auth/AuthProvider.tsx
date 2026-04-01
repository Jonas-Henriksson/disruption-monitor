/**
 * Authentication provider and gate for the SC Hub Disruption Monitor.
 *
 * Wraps the app in MsalProvider and gates access behind Azure Entra ID SSO.
 * If MSAL is not enabled (no client ID), the app renders without auth.
 */

import { type ReactNode, useEffect, useState } from "react";
import {
  MsalProvider,
  useIsAuthenticated,
  useMsal,
  useAccount,
} from "@azure/msal-react";
import {
  InteractionStatus,
  EventType,
  type EventMessage,
  type AuthenticationResult,
} from "@azure/msal-browser";
import { msalInstance, loginRequest, isMsalEnabled } from "./msalConfig";
import { setTokenProvider } from "./tokenProvider";

const FM = "'JetBrains Mono', monospace";
const F = "'DM Sans', sans-serif";

/* ---------- Login Screen ---------- */

function LoginScreen({ onLogin, isLoading }: { onLogin: () => void; isLoading: boolean }) {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#0a0f1a",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: F,
      }}
    >
      <div
        style={{
          width: 380,
          background: "#0d1424",
          border: "1px solid #14243e",
          borderRadius: 12,
          padding: "48px 40px 40px",
          boxShadow: "0 24px 80px rgba(0,0,0,.6)",
          textAlign: "center",
        }}
      >
        {/* Status indicator */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#2563eb",
              boxShadow: "0 0 12px #2563eb66",
            }}
          />
          <span
            style={{
              fontSize: 16,
              fontWeight: 700,
              color: "#e2e8f0",
              letterSpacing: "-0.01em",
            }}
          >
            SC Hub
          </span>
          <span
            style={{
              fontSize: 9,
              color: "#4a6080",
              letterSpacing: 2.5,
              textTransform: "uppercase",
              fontWeight: 600,
              fontFamily: FM,
            }}
          >
            DISRUPTION MONITOR
          </span>
        </div>

        {/* Title */}
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "#e2e8f0",
            margin: "0 0 8px",
            letterSpacing: "-0.02em",
          }}
        >
          Supply Chain Intelligence
        </h1>
        <p
          style={{
            fontSize: 13,
            color: "#4a6080",
            margin: "0 0 36px",
            lineHeight: 1.5,
          }}
        >
          Real-time disruption monitoring and risk assessment
        </p>

        {/* Separator */}
        <div
          style={{
            height: 1,
            background: "linear-gradient(90deg, transparent, #14243e, transparent)",
            marginBottom: 32,
          }}
        />

        {/* Login button */}
        <button
          onClick={onLogin}
          disabled={isLoading}
          style={{
            width: "100%",
            padding: "14px 20px",
            border: "1px solid #2563eb44",
            borderRadius: 8,
            background: isLoading ? "#0d1830" : "linear-gradient(180deg, #1e3a5c 0%, #162d4a 100%)",
            color: isLoading ? "#4a6080" : "#e2e8f0",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: F,
            cursor: isLoading ? "wait" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            transition: "all .2s",
            boxShadow: isLoading ? "none" : "0 4px 16px rgba(37,99,235,.15)",
          }}
          onMouseEnter={(e) => {
            if (!isLoading) {
              (e.currentTarget as HTMLElement).style.borderColor = "#2563eb88";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 24px rgba(37,99,235,.25)";
            }
          }}
          onMouseLeave={(e) => {
            if (!isLoading) {
              (e.currentTarget as HTMLElement).style.borderColor = "#2563eb44";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(37,99,235,.15)";
            }
          }}
        >
          {isLoading ? (
            <>
              <span
                style={{
                  width: 16,
                  height: 16,
                  border: "2px solid #2563eb33",
                  borderTop: "2px solid #2563eb",
                  borderRadius: "50%",
                  display: "inline-block",
                  animation: "sc-spin .8s linear infinite",
                }}
              />
              Signing in...
            </>
          ) : (
            <>
              {/* Microsoft logo */}
              <svg width="16" height="16" viewBox="0 0 21 21" fill="none">
                <rect x="0" y="0" width="10" height="10" fill="#F25022" />
                <rect x="11" y="0" width="10" height="10" fill="#7FBA00" />
                <rect x="0" y="11" width="10" height="10" fill="#00A4EF" />
                <rect x="11" y="11" width="10" height="10" fill="#FFB900" />
              </svg>
              Sign in with Microsoft
            </>
          )}
        </button>

        {/* Footer */}
        <p
          style={{
            fontSize: 10,
            color: "#2a3d5c",
            margin: "24px 0 0",
            fontFamily: FM,
            letterSpacing: 0.5,
          }}
        >
          Azure Entra ID Single Sign-On
        </p>
      </div>
    </div>
  );
}

/* ---------- Auth Gate ---------- */

function AuthGate({ children }: { children: ReactNode }) {
  const isAuthenticated = useIsAuthenticated();
  const { instance, accounts, inProgress } = useMsal();
  const account = useAccount(accounts[0] ?? null);
  const isLoading = inProgress !== InteractionStatus.None;

  // Register the token provider so api.ts can acquire tokens
  useEffect(() => {
    if (account) {
      setTokenProvider(async () => {
        try {
          const response = await instance.acquireTokenSilent({
            ...loginRequest,
            account,
          });
          return response.accessToken;
        } catch {
          return null;
        }
      });
    }
  }, [account, instance]);

  const handleLogin = async () => {
    try {
      await instance.loginRedirect(loginRequest);
    } catch (err) {
      console.error("[SC Hub] Login redirect failed:", err);
    }
  };

  // Show loading spinner during redirect handling
  if (isLoading) {
    return <LoginScreen onLogin={handleLogin} isLoading={true} />;
  }

  // Not authenticated — show login screen
  if (!isAuthenticated) {
    return <LoginScreen onLogin={handleLogin} isLoading={false} />;
  }

  // Authenticated — render children
  return <>{children}</>;
}

/* ---------- Root Auth Provider ---------- */

/**
 * Top-level auth wrapper. If MSAL is not configured, renders children directly
 * (no auth gating). If configured, wraps in MsalProvider + AuthGate.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!isMsalEnabled()) {
      setInitialized(true);
      return;
    }

    // Initialize MSAL and handle redirect promise
    msalInstance
      .initialize()
      .then(() => {
        // Handle redirect response after login
        return msalInstance.handleRedirectPromise();
      })
      .then((response: AuthenticationResult | null) => {
        if (response) {
          msalInstance.setActiveAccount(response.account);
        } else {
          // Set active account if one exists in cache
          const accounts = msalInstance.getAllAccounts();
          if (accounts.length > 0) {
            msalInstance.setActiveAccount(accounts[0]);
          }
        }

        // Listen for login success events
        msalInstance.addEventCallback((event: EventMessage) => {
          if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
            const result = event.payload as AuthenticationResult;
            msalInstance.setActiveAccount(result.account);
          }
        });

        setInitialized(true);
      })
      .catch((err) => {
        console.error("[SC Hub] MSAL initialization failed:", err);
        // Still allow app to render without auth on init failure
        setInitialized(true);
      });
  }, []);

  // Show nothing until MSAL is initialized (prevents flash)
  if (!initialized) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          background: "#0a0f1a",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 20,
            height: 20,
            border: "2px solid #2563eb33",
            borderTop: "2px solid #2563eb",
            borderRadius: "50%",
            animation: "sc-spin .8s linear infinite",
          }}
        />
      </div>
    );
  }

  // If MSAL is not enabled, render without auth
  if (!isMsalEnabled()) {
    return <>{children}</>;
  }

  return (
    <MsalProvider instance={msalInstance}>
      <AuthGate>{children}</AuthGate>
    </MsalProvider>
  );
}
