/**
 * Small user profile badge for the header area.
 * Shows logged-in user's name/initials and a logout button.
 * Theme-aware: works with both V3 dark and light themes.
 */

import { useAuth } from "./useAuth";

interface UserBadgeProps {
  /** Override styles for theme integration */
  theme?: {
    bg: string;
    border: string;
    avatarBg: string;
    avatarBorder: string;
    avatarColor: string;
    nameColor: string;
    emailColor: string;
    btnBorder: string;
    btnColor: string;
    font: string;
  };
}

const FM = "'JetBrains Mono', monospace";

export function UserBadge({ theme }: UserBadgeProps = {}) {
  const { isAuthenticated, user, logout } = useAuth();

  if (!isAuthenticated || !user) return null;

  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const t = theme || {
    bg: "#0a1220",
    border: "#162040",
    avatarBg: "#1e3a5c",
    avatarBorder: "#2563eb44",
    avatarColor: "#60a5fa",
    nameColor: "#c8d6e5",
    emailColor: "#4a6080",
    btnBorder: "#14243e",
    btnColor: "#4a6080",
    font: FM,
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: t.bg,
        border: `1px solid ${t.border}`,
        borderRadius: 6,
        padding: "3px 8px",
        fontFamily: t.font,
        fontSize: 10,
      }}
    >
      <div
        style={{
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: t.avatarBg,
          border: `1px solid ${t.avatarBorder}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 8,
          fontWeight: 700,
          color: t.avatarColor,
          letterSpacing: 0.5,
          flexShrink: 0,
        }}
      >
        {initials}
      </div>
      <span
        style={{
          color: t.nameColor,
          fontWeight: 600,
          fontSize: 10,
          lineHeight: 1.1,
          maxWidth: 100,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {user.name}
      </span>
      <button
        onClick={() => logout()}
        title="Sign out of Microsoft"
        style={{
          marginLeft: 2,
          padding: "2px 6px",
          border: `1px solid ${t.btnBorder}`,
          borderRadius: 3,
          background: "transparent",
          color: t.btnColor,
          fontSize: 9,
          cursor: "pointer",
          fontFamily: t.font,
          fontWeight: 600,
          transition: "color .15s, border-color .15s",
        }}
        onMouseEnter={(e) => {
          (e.target as HTMLElement).style.color = "#ef4444";
          (e.target as HTMLElement).style.borderColor = "#ef444444";
        }}
        onMouseLeave={(e) => {
          (e.target as HTMLElement).style.color = t.btnColor;
          (e.target as HTMLElement).style.borderColor = t.btnBorder;
        }}
      >
        Sign out
      </button>
    </div>
  );
}
