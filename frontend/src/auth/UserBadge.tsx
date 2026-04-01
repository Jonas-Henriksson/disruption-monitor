/**
 * Small user profile badge for the header area.
 * Shows logged-in user's name/initials and a logout button.
 */

import { useAuth } from "./useAuth";

const FM = "'JetBrains Mono', monospace";

export function UserBadge() {
  const { isAuthenticated, user, logout } = useAuth();

  if (!isAuthenticated || !user) return null;

  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "#0a1220",
        border: "1px solid #162040",
        borderRadius: 6,
        padding: "4px 10px",
        fontFamily: FM,
        fontSize: 10,
      }}
    >
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          background: "#1e3a5c",
          border: "1px solid #2563eb44",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 9,
          fontWeight: 700,
          color: "#60a5fa",
          letterSpacing: 0.5,
          flexShrink: 0,
        }}
      >
        {initials}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
        <span
          style={{
            color: "#c8d6e5",
            fontWeight: 600,
            fontSize: 10,
            lineHeight: 1.1,
            maxWidth: 120,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {user.name}
        </span>
        <span
          style={{
            color: "#4a6080",
            fontSize: 8,
            lineHeight: 1.1,
            maxWidth: 120,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {user.email}
        </span>
      </div>
      <button
        onClick={() => logout()}
        title="Sign out"
        style={{
          marginLeft: 4,
          padding: "3px 7px",
          border: "1px solid #14243e",
          borderRadius: 4,
          background: "transparent",
          color: "#4a6080",
          fontSize: 9,
          cursor: "pointer",
          fontFamily: FM,
          fontWeight: 600,
          transition: "color .15s, border-color .15s",
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLElement).style.color = "#ef4444";
          (e.target as HTMLElement).style.borderColor = "#ef444444";
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLElement).style.color = "#4a6080";
          (e.target as HTMLElement).style.borderColor = "#14243e";
        }}
      >
        Sign out
      </button>
    </div>
  );
}
