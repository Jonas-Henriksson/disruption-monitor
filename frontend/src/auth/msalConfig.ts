/**
 * MSAL (Microsoft Authentication Library) configuration for Azure Entra ID SSO.
 *
 * Client ID and Tenant ID are hardcoded for the SC Hub Disruption Monitor
 * Azure app registration. Override via VITE_MSAL_CLIENT_ID / VITE_MSAL_TENANT_ID
 * environment variables if needed.
 */

import { PublicClientApplication, type Configuration, LogLevel } from "@azure/msal-browser";

const clientId =
  (import.meta.env.VITE_MSAL_CLIENT_ID as string) || "6b72bb18-c3ae-4fc1-a2ed-ae335e43c2a0";

const tenantId =
  (import.meta.env.VITE_MSAL_TENANT_ID as string) || "41875f2b-33e8-4670-92a8-f643afbb243a";

const authority = `https://login.microsoftonline.com/${tenantId}`;

const CLOUDFRONT_ORIGIN = "https://d2rbfnbkfx00z5.cloudfront.net";
const redirectUri =
  (import.meta.env.VITE_MSAL_REDIRECT_URI as string) || `${CLOUDFRONT_ORIGIN}/callback`;
const postLogoutRedirectUri = redirectUri.replace(/\/callback$/, "");

const msalConfig: Configuration = {
  auth: {
    clientId,
    authority,
    redirectUri,
    postLogoutRedirectUri,
  },
  cache: {
    cacheLocation: "localStorage",
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
      piiLoggingEnabled: false,
    },
  },
};

/** Scopes requested during login */
export const loginRequest = {
  scopes: ["openid", "profile", "email"],
};

/** Scopes for MS Graph API (email, Teams, calendar) */
export const graphScopes = {
  scopes: ["Mail.Send", "Calendars.ReadWrite", "Chat.ReadWrite", "User.Read"],
};

/** Singleton MSAL instance — shared across the app */
export const msalInstance = new PublicClientApplication(msalConfig);

/** Whether MSAL auth is enabled (has a valid client ID configured) */
export const isMsalEnabled = (): boolean => {
  return clientId.length > 0 && clientId !== "disabled";
};
