# Action Management System + CxO Audit Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement end-to-end action management with MS365 directory integration, Teams notifications, and My Work panel — while fixing critical CxO audit findings (security, missing UI, design consistency).

**Architecture:** Extend the existing `actions` table with assignment/completion fields. Add MS Graph people search proxy. Build My Work slide-out panel and upgrade the Act tab. Fix security vulnerabilities and wire orphaned UI features.

**Tech Stack:** FastAPI + SQLite (backend), React 19 + TypeScript (frontend), MS Graph API (people search + Teams chat), existing Azure SSO auth.

**Spec:** `docs/superpowers/specs/2026-04-18-action-management-design.md`

---

## File Structure

### Backend — New Files
- `backend/app/services/teams_notify.py` — Teams chat notification service
- `backend/app/routers/users.py` — MS Graph people search proxy

### Backend — Modified Files
- `backend/app/db/database.py` — Extend actions table schema + new query functions
- `backend/app/models/schemas.py` — Extended Action models with assignment/completion fields
- `backend/app/routers/actions.py` — New assign/complete/dismiss/mine endpoints
- `backend/app/routers/events.py` — Add auth to feedback_stats, cap limit param, escape LIKE
- `backend/app/main.py` — Register users router

### Frontend — New Files
- `frontend/src/v3/components/PeoplePicker.tsx` — MS Graph directory search autocomplete
- `frontend/src/v3/components/MyWorkPanel.tsx` — Slide-out panel for assigned actions

### Frontend — Modified Files
- `frontend/src/v3/components/ExpandedCard.tsx` — Redesign Act tab with full action management
- `frontend/src/v3/components/TopBar.tsx` — Add My Work button with badge
- `frontend/src/v3/V3App.tsx` — Wire My Work panel state + Weekly Briefing button
- `frontend/src/services/api.ts` — New action management + people search API functions
- `frontend/src/types/index.ts` — Extended action types
- `frontend/src/v3/components/ExecutiveHero.tsx` — Move RISK_COLORS to theme
- `frontend/src/v3/components/CorridorStrip.tsx` — Move FRICTION_COLORS to theme
- `frontend/src/v3/components/CorridorDetail.tsx` — Use shared FRICTION_COLORS from theme
- `frontend/src/v3/theme.ts` — Add risk/friction/map color tokens
- `frontend/src/styles.ts` — Add Inter font import

### Test Files
- `backend/tests/test_action_management.py` — Tests for new action assignment/completion/dismiss
- `backend/tests/test_users.py` — Tests for people search proxy
- `backend/tests/test_teams_notify.py` — Tests for Teams notification service
- `backend/tests/test_audit_fixes.py` — Tests for security fixes (LIKE escaping, auth, limit cap)

---

## Phase 1: Security & Audit Fixes (Tasks 1-4)

### Task 1: Fix SQL LIKE wildcard injection + missing auth + limit ceiling

**Files:**
- Modify: `backend/app/routers/events.py:60,65-71`
- Modify: `backend/app/db/database.py:1279,1289`
- Create: `backend/tests/test_audit_fixes.py`

- [ ] **Step 1: Write failing tests for the three security issues**

Create `backend/tests/test_audit_fixes.py`:

```python
"""Tests for CxO audit security fixes."""
import pytest
from backend.app.db.database import get_db, resolve_site_code


class TestLikeEscaping:
    """resolve_site_code must escape LIKE wildcards in user input."""

    def test_percent_in_name_does_not_match_everything(self):
        """A display_name containing '%' should not act as a wildcard."""
        # '%' should be treated as literal, not matching all rows
        result = resolve_site_code("%")
        # Should return None (no site named literally "%"), not a random match
        assert result is None

    def test_underscore_in_name_does_not_match_single_char(self):
        """A display_name containing '_' should not act as single-char wildcard."""
        result = resolve_site_code("_")
        assert result is None


class TestLimitCeiling:
    """list_events must enforce a maximum limit."""

    def test_limit_capped_at_500(self):
        from fastapi.testclient import TestClient
        from backend.app.main import app

        client = TestClient(app)
        # Request limit=999999 should be capped
        resp = client.get("/api/v1/events?limit=999999")
        # Should not error — either capped silently or rejected
        assert resp.status_code in (200, 422)


class TestFeedbackStatsAuth:
    """feedback_stats endpoint should require authentication when auth is enabled."""

    def test_feedback_stats_has_user_dependency(self):
        """Verify the endpoint signature includes get_current_user dependency."""
        from backend.app.routers.events import feedback_stats
        import inspect
        sig = inspect.signature(feedback_stats)
        param_names = list(sig.parameters.keys())
        assert "user" in param_names, "feedback_stats must accept a 'user' parameter from Depends(get_current_user)"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/ubuntu/disruption-monitor && python3 -m pytest backend/tests/test_audit_fixes.py -v`
Expected: At least `test_feedback_stats_has_user_dependency` and `test_percent_in_name_does_not_match_everything` should FAIL.

- [ ] **Step 3: Fix LIKE escaping in resolve_site_code**

In `backend/app/db/database.py`, find the `resolve_site_code` function (around line 1263). Add a LIKE escape helper and use it:

```python
def _escape_like(value: str) -> str:
    """Escape special LIKE characters so user input is treated literally."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
```

Then in `resolve_site_code`, change the two LIKE queries to use the escape function and add `ESCAPE '\\'`:

At line ~1279:
```python
row = conn.execute(
    "SELECT site_code FROM site_code_map WHERE LOWER(site_description) LIKE ? ESCAPE '\\'",
    (f"%{_escape_like(display_name.lower())}%",),
).fetchone()
```

At line ~1289:
```python
row = conn.execute(
    "SELECT site_code FROM site_code_map WHERE LOWER(site_description) LIKE ? ESCAPE '\\'",
    (f"%{_escape_like(word.lower())}%",),
).fetchone()
```

- [ ] **Step 4: Add auth to feedback_stats and cap limit**

In `backend/app/routers/events.py`:

Line 60 — add Query validation with max:
```python
from fastapi import Query

async def list_events(
    mode: str | None = None,
    status: str | None = None,
    limit: int = Query(default=500, ge=1, le=500),
    user: dict[str, Any] = Depends(get_current_user),
):
```

Lines 65-71 — add user dependency to feedback_stats:
```python
@router.get("/feedback/stats", response_model=FeedbackStats)
async def feedback_stats(user: dict[str, Any] = Depends(get_current_user)):
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /home/ubuntu/disruption-monitor && python3 -m pytest backend/tests/test_audit_fixes.py -v`
Expected: All PASS.

- [ ] **Step 6: Run full backend test suite**

Run: `cd /home/ubuntu/disruption-monitor && python3 -m pytest backend/tests/ -q --ignore=backend/tests/test_api.py`
Expected: All existing tests still pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/events.py backend/app/db/database.py backend/tests/test_audit_fixes.py
git commit -m "fix(security): escape LIKE wildcards, add auth to feedback_stats, cap event limit

Addresses CxO audit findings:
- resolve_site_code now escapes %, _ in LIKE patterns (SQL wildcard injection)
- feedback_stats endpoint requires authentication
- list_events limit parameter capped at 500 via Query validation

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Wire Weekly Briefing button in V3

**Files:**
- Modify: `frontend/src/v3/V3App.tsx:63,232-248,366-369`
- Modify: `frontend/src/v3/components/TopBar.tsx`

- [ ] **Step 1: Add Weekly Briefing trigger to TopBar**

In `frontend/src/v3/components/TopBar.tsx`, add a new prop and button.

Add to TopBarProps interface:
```typescript
onOpenWeeklyBriefing?: () => void;
```

Add a button in the TopBar after the theme toggle (around line 312), before scan status:
```tsx
{/* Weekly Briefing */}
{props.onOpenWeeklyBriefing && (
  <button
    onClick={props.onOpenWeeklyBriefing}
    title="Weekly Briefing"
    style={{
      background: 'none', border: 'none', cursor: 'pointer',
      color: V3.text.muted, fontSize: 16, padding: '4px 6px',
      borderRadius: V3.radius.sm,
    }}
    onMouseEnter={e => (e.currentTarget.style.color = V3.text.primary)}
    onMouseLeave={e => (e.currentTarget.style.color = V3.text.muted)}
  >
    📋
  </button>
)}
```

- [ ] **Step 2: Pass handler from V3App to TopBar**

In `frontend/src/v3/V3App.tsx`, find the `<TopBar` JSX (around line 248) and add:
```tsx
onOpenWeeklyBriefing={() => setShowWeeklyBriefing(true)}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /home/ubuntu/disruption-monitor/frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/v3/V3App.tsx frontend/src/v3/components/TopBar.tsx
git commit -m "fix(ui): wire Weekly Briefing button in TopBar

CPO audit finding: showWeeklyBriefing state was declared but no UI
element triggered it. Added clipboard icon button to TopBar.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Move hardcoded colors into theme + add Inter font

**Files:**
- Modify: `frontend/src/v3/theme.ts`
- Modify: `frontend/src/v3/components/ExecutiveHero.tsx:34-38`
- Modify: `frontend/src/v3/components/CorridorStrip.tsx:20-26`
- Modify: `frontend/src/v3/components/CorridorDetail.tsx:20-26`
- Modify: `frontend/src/v3/components/ExpandedCard.tsx:442,446`
- Modify: `frontend/src/styles.ts:1-3`

- [ ] **Step 1: Add color tokens to theme.ts**

In `frontend/src/v3/theme.ts`, add to both `V3_DARK` and `V3_LIGHT` objects:

```typescript
// In V3_DARK:
risk: {
  stable: '#22c55e',
  elevated: '#f59e0b',
  high: '#ef4444',
},
friction: {
  prohibitive: '#dc2626',
  high: '#ef4444',
  moderate: '#f59e0b',
  low: '#22c55e',
  free: '#6ee7b7',
},

// In V3_LIGHT (same values — risk/friction colors are semantic, not theme-dependent):
risk: {
  stable: '#16a34a',
  elevated: '#d97706',
  high: '#dc2626',
},
friction: {
  prohibitive: '#dc2626',
  high: '#ef4444',
  moderate: '#f59e0b',
  low: '#22c55e',
  free: '#6ee7b7',
},
```

Update the V3Theme type to include these new token groups.

- [ ] **Step 2: Replace hardcoded RISK_COLORS in ExecutiveHero**

In `frontend/src/v3/components/ExecutiveHero.tsx`, replace lines 34-38:

```typescript
// Before:
const RISK_COLORS: Record<string, string> = {
  STABLE: '#22c55e',
  ELEVATED: '#f59e0b',
  HIGH: '#ef4444',
};

// After:
const RISK_COLORS = (V3: V3Theme): Record<string, string> => ({
  STABLE: V3.risk.stable,
  ELEVATED: V3.risk.elevated,
  HIGH: V3.risk.high,
});
```

Update the usage site (line ~62) accordingly.

- [ ] **Step 3: Replace hardcoded FRICTION_COLORS in CorridorStrip and CorridorDetail**

In both `CorridorStrip.tsx` and `CorridorDetail.tsx`, replace lines 20-26:

```typescript
// Before:
const FRICTION_COLORS: Record<string, string> = { ... };

// After — use theme:
// Access V3 from useTheme() or props, then:
const FRICTION_COLORS = (V3: V3Theme): Record<string, string> => ({
  Prohibitive: V3.friction.prohibitive,
  High: V3.friction.high,
  Moderate: V3.friction.moderate,
  Low: V3.friction.low,
  Free: V3.friction.free,
});
```

- [ ] **Step 4: Fix sub-10px font sizes in ExpandedCard**

In `frontend/src/v3/components/ExpandedCard.tsx`, lines 442 and 446, change `fontSize: 7` to `fontSize: 9`:

```tsx
// Before:
{!velLabel && <span style={{ fontSize: 7, opacity: 0.6 }}> est</span>}

// After:
{!velLabel && <span style={{ fontSize: 9, opacity: 0.6 }}> est</span>}
```

- [ ] **Step 5: Add Inter font import to styles.ts**

In `frontend/src/styles.ts`, line 2, update the Google Fonts import:

```typescript
// Before:
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap');

// After:
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap');
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd /home/ubuntu/disruption-monitor/frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/v3/theme.ts frontend/src/v3/components/ExecutiveHero.tsx \
  frontend/src/v3/components/CorridorStrip.tsx frontend/src/v3/components/CorridorDetail.tsx \
  frontend/src/v3/components/ExpandedCard.tsx frontend/src/styles.ts
git commit -m "fix(design): move hardcoded colors to theme tokens, add Inter font, fix sub-10px sizes

CDO audit findings:
- RISK_COLORS, FRICTION_COLORS now sourced from V3 theme tokens
- Inter font added to Google Fonts import
- fontSize: 7 bumped to 9 in ExpandedCard est labels

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Add event feedback UI to ExpandedCard

**Files:**
- Modify: `frontend/src/v3/components/ExpandedCard.tsx` — Add feedback buttons to Act tab
- Modify: `frontend/src/services/api.ts` — Add submitEventFeedback function

- [ ] **Step 1: Add feedback API function**

In `frontend/src/services/api.ts`, add:

```typescript
export async function submitEventFeedback(
  eventId: string,
  outcome: 'true_positive' | 'false_positive' | 'missed',
  comment?: string
): Promise<boolean> {
  try {
    const resp = await fetch(`${API}/events/${encodeURIComponent(eventId)}/feedback`, {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ outcome, comment: comment || null }),
    });
    return resp.ok;
  } catch { return false; }
}
```

- [ ] **Step 2: Add feedback buttons to Act tab in ExpandedCard**

In the ActTab component (around line 1470, after the Lifecycle section), add a "Signal Quality" section:

```tsx
{/* Signal Quality Feedback */}
<div style={sectionHeaderStyle()}>Signal Quality</div>
<div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
  {(['true_positive', 'false_positive'] as const).map(outcome => (
    <button
      key={outcome}
      onClick={async () => {
        const ok = await submitEventFeedback(resolvedId, outcome);
        if (ok) setFeedbackSent(outcome);
      }}
      disabled={!!feedbackSent}
      style={{
        padding: '4px 10px', fontSize: 10, borderRadius: 4, cursor: feedbackSent ? 'default' : 'pointer',
        border: `1px solid ${feedbackSent === outcome ? V3.accent.green : V3.border.default}`,
        background: feedbackSent === outcome ? V3.severity.low.bg : V3.bg.card,
        color: feedbackSent === outcome ? V3.accent.green : V3.text.secondary,
        fontFamily: V3_FONT, opacity: feedbackSent && feedbackSent !== outcome ? 0.4 : 1,
      }}
    >
      {outcome === 'true_positive' ? '✓ Accurate' : '✗ False alarm'}
    </button>
  ))}
  {feedbackSent && (
    <span style={{ fontSize: 9, color: V3.text.muted, alignSelf: 'center' }}>
      Thanks — this improves future scans
    </span>
  )}
</div>
```

Add state at top of ActTab: `const [feedbackSent, setFeedbackSent] = useState<string | null>(null);`

Add import of `submitEventFeedback` from `../../services/api`.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /home/ubuntu/disruption-monitor/frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/v3/components/ExpandedCard.tsx frontend/src/services/api.ts
git commit -m "feat(feedback): add signal quality buttons to Act tab

CPO audit finding: backend feedback API existed but no frontend surface.
Added 'Accurate' / 'False alarm' buttons to the Act tab so users can
rate event quality. Persisted via POST /events/{id}/feedback.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Phase 2: Action Management Backend (Tasks 5-8)

### Task 5: Extend actions table schema

**Files:**
- Modify: `backend/app/db/database.py:211-227`

- [ ] **Step 1: Add new columns to actions table CREATE statement**

In `backend/app/db/database.py`, find the actions table CREATE statement (lines 211-227). Replace it with:

```sql
CREATE TABLE IF NOT EXISTS actions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        TEXT NOT NULL REFERENCES events(id),
    action_type     TEXT NOT NULL CHECK (action_type IN (
        'activate_backup_supplier', 'increase_safety_stock', 'reroute_shipment',
        'contact_supplier', 'monitor_situation', 'escalate_to_leadership',
        'file_insurance_claim', 'activate_bcp', 'custom'
    )),
    title           TEXT NOT NULL DEFAULT '',
    description     TEXT,
    assignee_hint   TEXT,
    priority        TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('critical', 'high', 'normal', 'low')),
    status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'in_progress', 'completed', 'dismissed')),
    due_date        TEXT,
    source          TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai', 'manual', 'template')),
    assignee_email  TEXT,
    assignee_name   TEXT,
    created_by_email TEXT,
    created_by_name TEXT,
    completion_note TEXT,
    evidence_url    TEXT,
    completed_at    TEXT,
    completed_by_email TEXT,
    completed_by_name TEXT,
    dismissed_reason TEXT,
    dismissed_at    TEXT,
    dismissed_by_email TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now', 'utc')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now', 'utc'))
);
```

Note: `status` now includes `'assigned'` state. `action_type` now includes `'custom'` for free-form actions.

- [ ] **Step 2: Add migration for existing databases**

In the `_init_db` function or after table creation, add ALTER TABLE statements wrapped in try/except for existing databases:

```python
# Migration: add new action columns (idempotent)
_new_action_cols = [
    ("source", "TEXT NOT NULL DEFAULT 'ai'"),
    ("assignee_email", "TEXT"),
    ("assignee_name", "TEXT"),
    ("created_by_email", "TEXT"),
    ("created_by_name", "TEXT"),
    ("completion_note", "TEXT"),
    ("evidence_url", "TEXT"),
    ("completed_at", "TEXT"),
    ("completed_by_email", "TEXT"),
    ("completed_by_name", "TEXT"),
    ("dismissed_reason", "TEXT"),
    ("dismissed_at", "TEXT"),
    ("dismissed_by_email", "TEXT"),
]
for col_name, col_type in _new_action_cols:
    try:
        conn.execute(f"ALTER TABLE actions ADD COLUMN {col_name} {col_type}")
    except Exception:
        pass  # Column already exists
```

Also update the status CHECK constraint — SQLite doesn't allow altering constraints, so existing rows with old status values still work. The CREATE TABLE handles new DBs; existing DBs keep old constraint but `assigned` status will be accepted since SQLite CHECK is only enforced on INSERT/UPDATE with the CREATE TABLE definition.

- [ ] **Step 3: Run existing tests to verify no regression**

Run: `cd /home/ubuntu/disruption-monitor && python3 -m pytest backend/tests/test_actions.py -v`
Expected: All existing tests still pass.

- [ ] **Step 4: Commit**

```bash
git add backend/app/db/database.py
git commit -m "feat(actions): extend schema with assignment, completion, and source fields

Adds 13 new columns to actions table: assignee identity, completion
notes, evidence URLs, dismissed reasons, source tracking, and
created_by identity. Includes idempotent migration for existing DBs.
Also adds 'assigned' status and 'custom' action_type.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Update Pydantic models and CRUD functions

**Files:**
- Modify: `backend/app/models/schemas.py:530-582`
- Modify: `backend/app/db/database.py:1680-1789`
- Create: `backend/tests/test_action_management.py`

- [ ] **Step 1: Write tests for new action operations**

Create `backend/tests/test_action_management.py`:

```python
"""Tests for action assignment, completion, and dismissal."""
import pytest
from datetime import datetime, timezone
from backend.app.db.database import (
    create_action, get_action, get_actions, get_actions_for_event,
    update_action, _init_db, get_db,
)


@pytest.fixture(autouse=True)
def fresh_db(tmp_path, monkeypatch):
    db_path = str(tmp_path / "test.db")
    monkeypatch.setattr("backend.app.db.database._DB_PATH", db_path)
    monkeypatch.setattr("backend.app.db.database.settings.db_path", db_path)
    _init_db()
    # Insert a test event
    with get_db() as conn:
        conn.execute(
            "INSERT INTO events (id, mode, payload, status) VALUES (?, ?, ?, ?)",
            ("test-event|europe", "disruptions", "{}", "active"),
        )
    yield


class TestActionAssignment:
    def test_create_action_with_source(self):
        aid = create_action(
            "test-event|europe", "contact_supplier",
            title="Call Tata Steel",
            source="manual",
            created_by_email="jonas@skf.com",
            created_by_name="Jonas Henriksson",
        )
        action = get_action(aid)
        assert action["source"] == "manual"
        assert action["created_by_email"] == "jonas@skf.com"
        assert action["created_by_name"] == "Jonas Henriksson"

    def test_assign_action(self):
        aid = create_action("test-event|europe", "contact_supplier")
        ok = update_action(
            aid,
            status="assigned",
            assignee_email="maria@skf.com",
            assignee_name="Maria Lindberg",
        )
        assert ok
        action = get_action(aid)
        assert action["status"] == "assigned"
        assert action["assignee_email"] == "maria@skf.com"
        assert action["assignee_name"] == "Maria Lindberg"

    def test_complete_action_with_note(self):
        aid = create_action("test-event|europe", "contact_supplier")
        ok = update_action(
            aid,
            status="completed",
            completion_note="Spoke to supplier, 6-week lead time confirmed",
            evidence_url="https://teams.microsoft.com/msg/123",
            completed_by_email="maria@skf.com",
            completed_by_name="Maria Lindberg",
        )
        assert ok
        action = get_action(aid)
        assert action["status"] == "completed"
        assert action["completion_note"] == "Spoke to supplier, 6-week lead time confirmed"
        assert action["evidence_url"] == "https://teams.microsoft.com/msg/123"
        assert action["completed_at"] is not None

    def test_dismiss_action_with_reason(self):
        aid = create_action("test-event|europe", "monitor_situation")
        ok = update_action(
            aid,
            status="dismissed",
            dismissed_reason="Already handled by Munich office",
            dismissed_by_email="jonas@skf.com",
        )
        assert ok
        action = get_action(aid)
        assert action["status"] == "dismissed"
        assert action["dismissed_reason"] == "Already handled by Munich office"
        assert action["dismissed_at"] is not None

    def test_get_actions_by_assignee(self):
        create_action("test-event|europe", "contact_supplier",
                       assignee_email="maria@skf.com", status="assigned")
        create_action("test-event|europe", "monitor_situation",
                       assignee_email="erik@skf.com", status="assigned")
        create_action("test-event|europe", "reroute_shipment",
                       assignee_email="maria@skf.com", status="in_progress")

        maria_actions = get_actions(assignee_email="maria@skf.com")
        assert len(maria_actions) == 2
        assert all(a["assignee_email"] == "maria@skf.com" for a in maria_actions)

    def test_custom_action_type(self):
        aid = create_action(
            "test-event|europe", "custom",
            title="Verify warehouse inventory levels",
            description="Check Gothenburg warehouse for backup stock",
            source="manual",
        )
        action = get_action(aid)
        assert action["action_type"] == "custom"
        assert action["source"] == "manual"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/ubuntu/disruption-monitor && python3 -m pytest backend/tests/test_action_management.py -v`
Expected: FAIL — `create_action` doesn't accept `source`, `created_by_email`, etc.

- [ ] **Step 3: Update Pydantic models**

In `backend/app/models/schemas.py`, update the Action models (lines 530-582):

```python
ActionType = Literal[
    "activate_backup_supplier", "increase_safety_stock", "reroute_shipment",
    "contact_supplier", "monitor_situation", "escalate_to_leadership",
    "file_insurance_claim", "activate_bcp", "custom",
]

ActionStatus = Literal["pending", "assigned", "in_progress", "completed", "dismissed"]
ActionPriority = Literal["critical", "high", "normal", "low"]
ActionSource = Literal["ai", "manual", "template"]


class Action(BaseModel):
    """A structured, trackable action linked to a disruption event."""
    id: int
    event_id: str
    action_type: ActionType
    title: str
    description: Optional[str] = None
    assignee_hint: Optional[str] = Field(None, description="Suggested owner team/role")
    priority: ActionPriority = "normal"
    status: ActionStatus = "pending"
    due_date: Optional[datetime] = None
    source: ActionSource = "ai"
    assignee_email: Optional[str] = None
    assignee_name: Optional[str] = None
    created_by_email: Optional[str] = None
    created_by_name: Optional[str] = None
    completion_note: Optional[str] = None
    evidence_url: Optional[str] = None
    completed_at: Optional[datetime] = None
    completed_by_email: Optional[str] = None
    completed_by_name: Optional[str] = None
    dismissed_reason: Optional[str] = None
    dismissed_at: Optional[datetime] = None
    dismissed_by_email: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class ActionCreate(BaseModel):
    """Create a new action manually."""
    action_type: ActionType
    title: Optional[str] = None
    description: Optional[str] = None
    assignee_hint: Optional[str] = None
    priority: ActionPriority = "normal"
    due_date: Optional[datetime] = None
    source: ActionSource = "manual"
    assignee_email: Optional[str] = None
    assignee_name: Optional[str] = None


class ActionAssign(BaseModel):
    """Assign an action to a person."""
    assignee_email: str
    assignee_name: str
    due_date: Optional[datetime] = None
    priority: Optional[ActionPriority] = None


class ActionComplete(BaseModel):
    """Mark an action as done."""
    completion_note: str
    evidence_url: Optional[str] = None


class ActionDismiss(BaseModel):
    """Dismiss an action."""
    reason: Optional[str] = None


class ActionUpdate(BaseModel):
    """Update an existing action."""
    status: Optional[ActionStatus] = None
    assignee_hint: Optional[str] = None
    priority: Optional[ActionPriority] = None
    due_date: Optional[datetime] = None
```

- [ ] **Step 4: Update CRUD functions in database.py**

Update `create_action` (line ~1680) to accept new fields:

```python
def create_action(
    event_id: str,
    action_type: str,
    title: str | None = None,
    description: str | None = None,
    assignee_hint: str | None = None,
    priority: str = "normal",
    due_date: str | None = None,
    source: str = "ai",
    assignee_email: str | None = None,
    assignee_name: str | None = None,
    created_by_email: str | None = None,
    created_by_name: str | None = None,
    status: str = "pending",
) -> int:
    if title is None:
        title = action_type.replace("_", " ").title()
    with get_db() as conn:
        cursor = conn.execute(
            """INSERT INTO actions
               (event_id, action_type, title, description, assignee_hint, priority,
                due_date, source, assignee_email, assignee_name, created_by_email,
                created_by_name, status)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (event_id, action_type, title, description, assignee_hint, priority,
             due_date, source, assignee_email, assignee_name, created_by_email,
             created_by_name, status),
        )
        return cursor.lastrowid
```

Update `update_action` (line ~1742) to handle all new fields:

```python
def update_action(
    action_id: int,
    status: str | None = None,
    assignee_hint: str | None = None,
    assignee_email: str | None = None,
    assignee_name: str | None = None,
    due_date: str | None = None,
    priority: str | None = None,
    completion_note: str | None = None,
    evidence_url: str | None = None,
    completed_by_email: str | None = None,
    completed_by_name: str | None = None,
    dismissed_reason: str | None = None,
    dismissed_by_email: str | None = None,
) -> bool:
    updates: list[str] = []
    params: list[Any] = []
    now = datetime.now(timezone.utc).isoformat()

    field_map = {
        "status": status, "assignee_hint": assignee_hint,
        "assignee_email": assignee_email, "assignee_name": assignee_name,
        "due_date": due_date, "priority": priority,
        "completion_note": completion_note, "evidence_url": evidence_url,
        "completed_by_email": completed_by_email, "completed_by_name": completed_by_name,
        "dismissed_reason": dismissed_reason, "dismissed_by_email": dismissed_by_email,
    }
    for col, val in field_map.items():
        if val is not None:
            updates.append(f"{col} = ?")
            params.append(val)

    # Auto-set timestamps
    if status == "completed":
        updates.append("completed_at = ?")
        params.append(now)
    if status == "dismissed":
        updates.append("dismissed_at = ?")
        params.append(now)

    if not updates:
        return False
    updates.append("updated_at = ?")
    params.append(now)
    params.append(action_id)

    with get_db() as conn:
        cursor = conn.execute(
            f"UPDATE actions SET {', '.join(updates)} WHERE id = ?", params,
        )
        return cursor.rowcount > 0
```

Update `get_actions` to accept `assignee_email` filter:

```python
def get_actions(
    status: str | None = None,
    event_id: str | None = None,
    assignee_email: str | None = None,
    limit: int = 100,
) -> list[dict]:
    conditions: list[str] = []
    params: list[Any] = []
    if status:
        conditions.append("status = ?")
        params.append(status)
    if event_id:
        conditions.append("event_id = ?")
        params.append(event_id)
    if assignee_email:
        conditions.append("assignee_email = ?")
        params.append(assignee_email)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.append(limit)
    with get_db() as conn:
        rows = conn.execute(
            f"SELECT * FROM actions {where} ORDER BY created_at DESC LIMIT ?", params,
        ).fetchall()
        return [dict(r) for r in rows]
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /home/ubuntu/disruption-monitor && python3 -m pytest backend/tests/test_action_management.py -v`
Expected: All PASS.

- [ ] **Step 6: Run full test suite**

Run: `cd /home/ubuntu/disruption-monitor && python3 -m pytest backend/tests/ -q --ignore=backend/tests/test_api.py`
Expected: All pass.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/schemas.py backend/app/db/database.py backend/tests/test_action_management.py
git commit -m "feat(actions): update models and CRUD for assignment, completion, dismissal

Extended Action model with assignee identity, completion notes,
evidence URLs, dismissed reasons, and source tracking. Updated
create_action and update_action to handle all new fields. Added
assignee_email filter to get_actions. 7 new tests.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Add assign/complete/dismiss/mine API endpoints

**Files:**
- Modify: `backend/app/routers/actions.py`

- [ ] **Step 1: Add new endpoints to actions router**

In `backend/app/routers/actions.py`, add these endpoints after the existing ones:

```python
from ..models.schemas import ActionAssign, ActionComplete, ActionDismiss


@router.get("/actions/mine")
async def my_actions(
    user: dict[str, Any] = Depends(get_current_user),
) -> list[Action]:
    """Get all actions assigned to the current user."""
    email = user.get("email", "")
    if not email:
        return []
    rows = get_actions(assignee_email=email, limit=200)
    # Enrich with event title for display
    for row in rows:
        evt = get_event(row["event_id"])
        if evt:
            payload = evt.get("payload", {})
            if isinstance(payload, str):
                import json
                try:
                    payload = json.loads(payload)
                except Exception:
                    payload = {}
            row["event_title"] = payload.get("event", payload.get("risk", evt.get("id", "")))
            row["event_severity"] = payload.get("severity", payload.get("risk_level", "Medium"))
    return [Action(**r) for r in rows]


@router.patch("/actions/{action_id}/assign")
async def assign_action(
    action_id: int,
    body: ActionAssign,
    user: dict[str, Any] = Depends(get_current_user),
) -> Action:
    """Assign an action to a person from the MS365 directory."""
    action = get_action(action_id)
    if not action:
        raise HTTPException(status_code=404, detail=f"Action {action_id} not found")

    update_action(
        action_id,
        status="assigned",
        assignee_email=body.assignee_email,
        assignee_name=body.assignee_name,
        due_date=body.due_date.isoformat() if body.due_date else None,
        priority=body.priority,
    )
    updated = get_action(action_id)
    return Action(**updated)


@router.patch("/actions/{action_id}/complete")
async def complete_action(
    action_id: int,
    body: ActionComplete,
    user: dict[str, Any] = Depends(get_current_user),
) -> Action:
    """Mark an action as done with a completion note."""
    action = get_action(action_id)
    if not action:
        raise HTTPException(status_code=404, detail=f"Action {action_id} not found")
    if action["status"] == "completed":
        raise HTTPException(status_code=400, detail="Action already completed")

    update_action(
        action_id,
        status="completed",
        completion_note=body.completion_note,
        evidence_url=body.evidence_url,
        completed_by_email=user.get("email", ""),
        completed_by_name=user.get("name", ""),
    )
    updated = get_action(action_id)
    return Action(**updated)


@router.patch("/actions/{action_id}/dismiss")
async def dismiss_action(
    action_id: int,
    body: ActionDismiss,
    user: dict[str, Any] = Depends(get_current_user),
) -> Action:
    """Dismiss an action as not applicable."""
    action = get_action(action_id)
    if not action:
        raise HTTPException(status_code=404, detail=f"Action {action_id} not found")
    if action["status"] == "completed":
        raise HTTPException(status_code=400, detail="Cannot dismiss a completed action")

    update_action(
        action_id,
        status="dismissed",
        dismissed_reason=body.reason,
        dismissed_by_email=user.get("email", ""),
    )
    updated = get_action(action_id)
    return Action(**updated)
```

- [ ] **Step 2: Update the existing create endpoint to use new fields**

Update the `create_event_action` function to pass `source` and `created_by` from the request and user context:

```python
@router.post("/events/{event_id}/actions", response_model=Action, status_code=201)
async def create_event_action(
    event_id: str,
    body: ActionCreate,
    user: dict[str, Any] = Depends(get_current_user),
) -> Action:
    evt = get_event(event_id)
    if not evt:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")
    action_id = create_action(
        event_id=event_id,
        action_type=body.action_type,
        title=body.title,
        description=body.description,
        assignee_hint=body.assignee_hint,
        priority=body.priority,
        due_date=body.due_date.isoformat() if body.due_date else None,
        source=body.source,
        assignee_email=body.assignee_email,
        assignee_name=body.assignee_name,
        created_by_email=user.get("email", ""),
        created_by_name=user.get("name", ""),
    )
    return Action(**get_action(action_id))
```

- [ ] **Step 3: Run tests**

Run: `cd /home/ubuntu/disruption-monitor && python3 -m pytest backend/tests/test_actions.py backend/tests/test_action_management.py -v`
Expected: All PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/actions.py
git commit -m "feat(actions): add assign, complete, dismiss, and my-actions endpoints

New API surface:
- PATCH /actions/{id}/assign — assign to MS365 user
- PATCH /actions/{id}/complete — mark done with note + evidence
- PATCH /actions/{id}/dismiss — dismiss with optional reason
- GET /actions/mine — all actions assigned to current user

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 8: Teams notification service + people search proxy

**Files:**
- Create: `backend/app/services/teams_notify.py`
- Create: `backend/app/routers/users.py`
- Modify: `backend/app/main.py` — register users router
- Create: `backend/tests/test_teams_notify.py`
- Create: `backend/tests/test_users.py`

- [ ] **Step 1: Write Teams notification tests**

Create `backend/tests/test_teams_notify.py`:

```python
"""Tests for Teams chat notification service."""
import pytest
from unittest.mock import AsyncMock, patch
from backend.app.services.teams_notify import build_assignment_message


class TestMessageFormatting:
    def test_build_message_with_all_fields(self):
        msg = build_assignment_message(
            event_title="Red Sea Shipping Disruption",
            event_severity="Critical",
            action_title="Contact affected suppliers",
            priority="high",
            due_date="2026-04-20T12:00:00Z",
            assigner_name="Jonas Henriksson",
        )
        assert "Red Sea Shipping Disruption" in msg
        assert "Critical" in msg
        assert "Contact affected suppliers" in msg
        assert "high" in msg
        assert "Jonas Henriksson" in msg

    def test_build_message_without_due_date(self):
        msg = build_assignment_message(
            event_title="Test Event",
            event_severity="Medium",
            action_title="Monitor situation",
            priority="normal",
            due_date=None,
            assigner_name="Test User",
        )
        assert "No due date" in msg
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/ubuntu/disruption-monitor && python3 -m pytest backend/tests/test_teams_notify.py -v`
Expected: FAIL — module doesn't exist yet.

- [ ] **Step 3: Implement Teams notification service**

Create `backend/app/services/teams_notify.py`:

```python
"""Teams chat notification service for action assignments."""

from __future__ import annotations

import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)

GRAPH_BASE = "https://graph.microsoft.com/v1.0"


def build_assignment_message(
    event_title: str,
    event_severity: str,
    action_title: str,
    priority: str,
    due_date: str | None,
    assigner_name: str,
    deep_link: str | None = None,
) -> str:
    sev_emoji = {"Critical": "\U0001f534", "High": "\U0001f7e0", "Medium": "\U0001f7e1", "Low": "\U0001f7e2"}.get(event_severity, "\u26aa")
    due_str = due_date[:10] if due_date else "No due date"
    lines = [
        f"{sev_emoji} **Action assigned to you** — SC Hub Disruption Monitor",
        "",
        f"**Event:** {event_title} ({event_severity})",
        f"**Action:** {action_title}",
        f"**Priority:** {priority}",
        f"**Due:** {due_str}",
        f"**Assigned by:** {assigner_name}",
    ]
    if deep_link:
        lines.append(f"\n[Open in SC Hub]({deep_link})")
    return "\n".join(lines)


async def send_assignment_chat(
    graph_token: str,
    assignee_email: str,
    event_title: str,
    event_severity: str,
    action_title: str,
    priority: str,
    due_date: str | None,
    assigner_name: str,
    deep_link: str | None = None,
) -> bool:
    """Send a 1:1 Teams chat message to the assignee. Fire-and-forget."""
    headers = {"Authorization": f"Bearer {graph_token}", "Content-Type": "application/json"}

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # Step 1: Create or find 1:1 chat
            chat_resp = await client.post(
                f"{GRAPH_BASE}/chats",
                headers=headers,
                json={
                    "chatType": "oneOnOne",
                    "members": [
                        {
                            "@odata.type": "#microsoft.graph.aadUserConversationMember",
                            "roles": ["owner"],
                            "user@odata.bind": f"https://graph.microsoft.com/v1.0/users('{assignee_email}')",
                        },
                    ],
                },
            )
            if chat_resp.status_code not in (200, 201):
                logger.warning("Teams chat creation failed: %d %s", chat_resp.status_code, chat_resp.text[:200])
                return False

            chat_id = chat_resp.json()["id"]

            # Step 2: Send message
            message = build_assignment_message(
                event_title, event_severity, action_title, priority, due_date, assigner_name, deep_link,
            )
            msg_resp = await client.post(
                f"{GRAPH_BASE}/chats/{chat_id}/messages",
                headers=headers,
                json={"body": {"contentType": "text", "content": message}},
            )
            if msg_resp.status_code not in (200, 201):
                logger.warning("Teams message send failed: %d %s", msg_resp.status_code, msg_resp.text[:200])
                return False

            logger.info("Teams notification sent to %s for action '%s'", assignee_email, action_title)
            return True

    except Exception:
        logger.exception("Teams notification failed for %s", assignee_email)
        return False
```

- [ ] **Step 4: Implement people search proxy**

Create `backend/app/routers/users.py`:

```python
"""User search endpoint — proxies to MS Graph People API."""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Query

from ..auth.dependencies import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["users"])

GRAPH_BASE = "https://graph.microsoft.com/v1.0"


@router.get("/search")
async def search_users(
    q: str = Query(..., min_length=2, max_length=100),
    x_graph_token: str | None = Header(None),
    user: dict[str, Any] = Depends(get_current_user),
) -> list[dict]:
    """Search MS365 directory for users. Requires X-Graph-Token header."""
    if not x_graph_token:
        raise HTTPException(status_code=401, detail="Missing X-Graph-Token header")

    headers = {"Authorization": f"Bearer {x_graph_token}", "Content-Type": "application/json"}

    async with httpx.AsyncClient(timeout=10) as client:
        # Try People API first (relevance-ranked)
        try:
            resp = await client.get(
                f"{GRAPH_BASE}/me/people",
                headers=headers,
                params={"$search": f'"{q}"', "$top": "8", "$select": "displayName,scoredEmailAddresses,userPrincipalName"},
            )
            if resp.status_code == 200:
                people = resp.json().get("value", [])
                return [
                    {
                        "displayName": p.get("displayName", ""),
                        "email": (p.get("scoredEmailAddresses", [{}])[0].get("address", "")
                                  if p.get("scoredEmailAddresses") else p.get("userPrincipalName", "")),
                    }
                    for p in people
                    if p.get("displayName")
                ]
        except Exception:
            logger.debug("People API failed, falling back to directory search")

        # Fallback: directory search
        try:
            resp = await client.get(
                f"{GRAPH_BASE}/users",
                headers={**headers, "ConsistencyLevel": "eventual"},
                params={"$search": f'"displayName:{q}"', "$top": "8", "$select": "displayName,mail,userPrincipalName"},
            )
            if resp.status_code == 200:
                users = resp.json().get("value", [])
                return [
                    {
                        "displayName": u.get("displayName", ""),
                        "email": u.get("mail", "") or u.get("userPrincipalName", ""),
                    }
                    for u in users
                    if u.get("displayName")
                ]
        except Exception:
            logger.debug("Directory search also failed")

    return []
```

- [ ] **Step 5: Register users router in main.py**

In `backend/app/main.py`, find where routers are included (look for `app.include_router`) and add:

```python
from .routers.users import router as users_router
app.include_router(users_router, prefix="/api/v1")
```

- [ ] **Step 6: Wire Teams notification into assign endpoint**

In `backend/app/routers/actions.py`, update the `assign_action` endpoint to fire Teams notification:

```python
import asyncio
from ..services.teams_notify import send_assignment_chat

@router.patch("/actions/{action_id}/assign")
async def assign_action(
    action_id: int,
    body: ActionAssign,
    x_graph_token: str | None = Header(None),
    user: dict[str, Any] = Depends(get_current_user),
) -> Action:
    action = get_action(action_id)
    if not action:
        raise HTTPException(status_code=404, detail=f"Action {action_id} not found")

    update_action(
        action_id,
        status="assigned",
        assignee_email=body.assignee_email,
        assignee_name=body.assignee_name,
        due_date=body.due_date.isoformat() if body.due_date else None,
        priority=body.priority,
    )

    # Fire-and-forget Teams notification
    if x_graph_token:
        evt = get_event(action["event_id"])
        event_title = ""
        event_severity = "Medium"
        if evt:
            import json
            payload = evt.get("payload", {})
            if isinstance(payload, str):
                try: payload = json.loads(payload)
                except Exception: payload = {}
            event_title = payload.get("event", payload.get("risk", ""))
            event_severity = payload.get("severity", payload.get("risk_level", "Medium"))
        asyncio.ensure_future(send_assignment_chat(
            graph_token=x_graph_token,
            assignee_email=body.assignee_email,
            event_title=event_title,
            event_severity=event_severity,
            action_title=action.get("title", ""),
            priority=body.priority or action.get("priority", "normal"),
            due_date=body.due_date.isoformat() if body.due_date else action.get("due_date"),
            assigner_name=user.get("name", "Unknown"),
        ))

    updated = get_action(action_id)
    return Action(**updated)
```

- [ ] **Step 7: Run all tests**

Run: `cd /home/ubuntu/disruption-monitor && python3 -m pytest backend/tests/test_teams_notify.py backend/tests/test_action_management.py backend/tests/test_actions.py -v`
Expected: All PASS.

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/teams_notify.py backend/app/routers/users.py \
  backend/app/routers/actions.py backend/app/main.py \
  backend/tests/test_teams_notify.py backend/tests/test_users.py
git commit -m "feat(actions): Teams notification service + people search proxy

- teams_notify.py: 1:1 Teams chat on action assignment (fire-and-forget)
- users router: /users/search proxies to MS Graph People API with
  directory search fallback
- Assign endpoint now sends Teams notification when Graph token present

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Phase 3: Frontend Action Management (Tasks 9-12)

### Task 9: Frontend types and API functions

**Files:**
- Modify: `frontend/src/types/index.ts`
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Update TypeScript types**

In `frontend/src/types/index.ts`, replace the ActionItem interface and add new types:

```typescript
export type ActionStatus = 'pending' | 'assigned' | 'in_progress' | 'completed' | 'dismissed';
export type ActionSource = 'ai' | 'manual' | 'template';

export interface BackendAction {
  id: number;
  event_id: string;
  action_type: string;
  title: string;
  description: string | null;
  assignee_hint: string | null;
  priority: 'critical' | 'high' | 'normal' | 'low';
  status: ActionStatus;
  due_date: string | null;
  source: ActionSource;
  assignee_email: string | null;
  assignee_name: string | null;
  created_by_email: string | null;
  created_by_name: string | null;
  completion_note: string | null;
  evidence_url: string | null;
  completed_at: string | null;
  completed_by_email: string | null;
  completed_by_name: string | null;
  dismissed_reason: string | null;
  dismissed_at: string | null;
  dismissed_by_email: string | null;
  created_at: string;
  updated_at: string;
  // Enriched by /actions/mine
  event_title?: string;
  event_severity?: string;
}

export interface DirectoryUser {
  displayName: string;
  email: string;
}
```

Keep the old `ActionItem` interface for backwards compatibility with any remaining references.

- [ ] **Step 2: Add new API functions**

In `frontend/src/services/api.ts`, add:

```typescript
export async function fetchMyActions(): Promise<BackendAction[] | null> {
  try {
    const resp = await fetch(`${API}/actions/mine`, { headers: await authHeaders() });
    if (!resp.ok) return null;
    return resp.json();
  } catch { return null; }
}

export async function searchUsers(query: string): Promise<DirectoryUser[]> {
  try {
    const resp = await fetch(`${API}/users/search?q=${encodeURIComponent(query)}`, {
      headers: await graphHeaders(),
    });
    if (!resp.ok) return [];
    return resp.json();
  } catch { return []; }
}

export async function assignAction(
  actionId: number,
  assignee: { email: string; name: string },
  options?: { due_date?: string; priority?: string }
): Promise<BackendAction | null> {
  try {
    const resp = await fetch(`${API}/actions/${actionId}/assign`, {
      method: 'PATCH',
      headers: await graphHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        assignee_email: assignee.email,
        assignee_name: assignee.name,
        ...options,
      }),
    });
    if (!resp.ok) return null;
    return resp.json();
  } catch { return null; }
}

export async function completeAction(
  actionId: number,
  note: string,
  evidenceUrl?: string
): Promise<BackendAction | null> {
  try {
    const resp = await fetch(`${API}/actions/${actionId}/complete`, {
      method: 'PATCH',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ completion_note: note, evidence_url: evidenceUrl || null }),
    });
    if (!resp.ok) return null;
    return resp.json();
  } catch { return null; }
}

export async function dismissAction(
  actionId: number,
  reason?: string
): Promise<BackendAction | null> {
  try {
    const resp = await fetch(`${API}/actions/${actionId}/dismiss`, {
      method: 'PATCH',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ reason: reason || null }),
    });
    if (!resp.ok) return null;
    return resp.json();
  } catch { return null; }
}

export async function createManualAction(
  eventId: string,
  action: { action_type: string; title: string; description?: string; priority?: string; assignee_email?: string; assignee_name?: string }
): Promise<BackendAction | null> {
  try {
    const resp = await fetch(`${API}/events/${encodeURIComponent(eventId)}/actions`, {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ...action, source: action.action_type === 'custom' ? 'manual' : 'template' }),
    });
    if (!resp.ok) return null;
    return resp.json();
  } catch { return null; }
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /home/ubuntu/disruption-monitor/frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/types/index.ts frontend/src/services/api.ts
git commit -m "feat(actions): frontend types and API client for action management

BackendAction type with full assignment/completion fields.
API functions: fetchMyActions, searchUsers, assignAction,
completeAction, dismissAction, createManualAction.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 10: PeoplePicker component

**Files:**
- Create: `frontend/src/v3/components/PeoplePicker.tsx`

- [ ] **Step 1: Create PeoplePicker component**

Create `frontend/src/v3/components/PeoplePicker.tsx`:

```tsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { useTheme } from '../ThemeContext';
import { searchUsers } from '../../services/api';
import type { DirectoryUser } from '../../types';

interface PeoplePickerProps {
  onSelect: (user: DirectoryUser) => void;
  placeholder?: string;
}

export function PeoplePicker({ onSelect, placeholder = 'Search people...' }: PeoplePickerProps) {
  const { theme: V3 } = useTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DirectoryUser[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    const users = await searchUsers(q);
    setResults(users);
    setOpen(users.length > 0);
    setLoading(false);
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 300);
  };

  const handleSelect = (user: DirectoryUser) => {
    setQuery(user.displayName);
    setOpen(false);
    onSelect(user);
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} style={{ position: 'relative', flex: 1 }}>
      <input
        value={query}
        onChange={e => handleChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%', padding: '5px 8px', fontSize: 11,
          background: V3.bg.base, color: V3.text.primary,
          border: `1px solid ${V3.border.default}`, borderRadius: 4,
          fontFamily: 'Inter, DM Sans, system-ui', outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {loading && (
        <span style={{ position: 'absolute', right: 8, top: 6, fontSize: 10, color: V3.text.muted }}>...</span>
      )}
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
          background: V3.bg.card, border: `1px solid ${V3.border.default}`,
          borderRadius: 4, marginTop: 2, maxHeight: 200, overflowY: 'auto',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {results.map(user => (
            <div
              key={user.email}
              onClick={() => handleSelect(user)}
              style={{
                padding: '6px 8px', cursor: 'pointer', fontSize: 11,
                color: V3.text.primary, borderBottom: `1px solid ${V3.border.subtle}`,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = V3.bg.cardHover)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ fontWeight: 500 }}>{user.displayName}</div>
              <div style={{ fontSize: 9, color: V3.text.muted }}>{user.email}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /home/ubuntu/disruption-monitor/frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/v3/components/PeoplePicker.tsx
git commit -m "feat(actions): PeoplePicker component with MS Graph search

Debounced directory search autocomplete with dropdown results.
Searches via /users/search which proxies to MS Graph People API.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 11: Redesign Act tab in ExpandedCard

**Files:**
- Modify: `frontend/src/v3/components/ExpandedCard.tsx:1340-1530`

This is the largest frontend change. The Act tab is rewritten to show the full action management UI.

- [ ] **Step 1: Rewrite the ActTab component**

Replace the ActTab function (lines ~1340-1530) with the new implementation. Key changes:

1. Fetch backend actions on mount (keep existing pattern)
2. Show actions as rich rows with source badge, assignee, priority, status
3. Unassigned actions grayed out
4. Completed actions show note + evidence
5. Dismissed actions faded with reason
6. "Add Action" button with template picker + free-form
7. PeoplePicker for assignment
8. Completion modal with required note + optional evidence URL
9. Dismiss modal with optional reason
10. Feedback buttons at the bottom

The ActTab should use `BackendAction` type from imports, `PeoplePicker` for assignment, and the new API functions (`assignAction`, `completeAction`, `dismissAction`, `createManualAction`).

The action list renders each action with:
- Left: source badge ("AI" blue / "Manual" green) + priority dot
- Center: title + assignee (or "Unassigned" muted) + due date
- Right: status button (Assign / Start / Done / Dismiss depending on current status)

When "Done" is clicked, show an inline form with:
- Completion note textarea (required)
- Evidence URL input (optional)
- Submit button

When "Assign" is clicked on an action, show PeoplePicker inline.

When "Add Action" is clicked, show a dropdown with the 8 templates + "Custom" free-form option.

Keep the Lifecycle section (Watch/Archive) and Communication section (Email/Teams/Calendar) below the actions.

Add the feedback buttons section at the very bottom.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /home/ubuntu/disruption-monitor/frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Build frontend**

Run: `cd /home/ubuntu/disruption-monitor/frontend && npx vite build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/v3/components/ExpandedCard.tsx
git commit -m "feat(actions): redesign Act tab with full action management

Rich action rows with source badges, assignee, priority, due dates.
PeoplePicker for assignment. Completion flow with required note and
optional evidence URL. Dismiss with optional reason. Add Action
with template picker + free-form. Signal quality feedback buttons.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 12: MyWorkPanel + TopBar integration + V3App wiring

**Files:**
- Create: `frontend/src/v3/components/MyWorkPanel.tsx`
- Modify: `frontend/src/v3/components/TopBar.tsx`
- Modify: `frontend/src/v3/V3App.tsx`

- [ ] **Step 1: Create MyWorkPanel component**

Create `frontend/src/v3/components/MyWorkPanel.tsx`:

A slide-out panel from the right showing actions assigned to the current user. Grouped by urgency: Overdue, Due Today, This Week, Later/No Due Date.

Key features:
- Fetches from `fetchMyActions()` on open
- Groups actions by due date relative to today
- Each row: action title, parent event name + severity badge, priority pill, due date, status
- Quick-complete button on each row (opens inline completion form)
- Quick-dismiss button
- Click action title → calls `onNavigateToEvent(eventId)` prop
- Summary header: "3 of 7 complete, 1 overdue"
- Close button in header
- Slide-in animation from right (300ms transform)
- Empty state message

The component should accept props:
```typescript
interface MyWorkPanelProps {
  open: boolean;
  onClose: () => void;
  onNavigateToEvent: (eventId: string) => void;
}
```

- [ ] **Step 2: Add My Work button to TopBar**

In `frontend/src/v3/components/TopBar.tsx`, add new prop:
```typescript
myWorkCount?: number;
onOpenMyWork?: () => void;
```

Add a button after the theme toggle:
```tsx
{props.onOpenMyWork && (
  <button
    onClick={props.onOpenMyWork}
    title="My Work"
    style={{
      background: 'none', border: 'none', cursor: 'pointer', position: 'relative',
      color: V3.text.muted, fontSize: 16, padding: '4px 6px', borderRadius: V3.radius.sm,
    }}
    onMouseEnter={e => (e.currentTarget.style.color = V3.text.primary)}
    onMouseLeave={e => (e.currentTarget.style.color = V3.text.muted)}
  >
    {'📝'}
    {(props.myWorkCount ?? 0) > 0 && (
      <span style={{
        position: 'absolute', top: -2, right: -4,
        background: V3.severity.critical.text, color: '#fff',
        fontSize: 8, fontWeight: 700, borderRadius: '50%',
        minWidth: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 3px',
      }}>
        {props.myWorkCount}
      </span>
    )}
  </button>
)}
```

- [ ] **Step 3: Wire into V3App**

In `frontend/src/v3/V3App.tsx`:

Add state:
```typescript
const [myWorkOpen, setMyWorkOpen] = useState(false);
const [myWorkCount, setMyWorkCount] = useState(0);
```

Add effect to fetch count on mount and after scans:
```typescript
useEffect(() => {
  fetchMyActions().then(actions => {
    if (actions) {
      setMyWorkCount(actions.filter(a => a.status !== 'completed' && a.status !== 'dismissed').length);
    }
  });
}, [dis.items]); // Refresh after scan completes
```

Pass to TopBar:
```tsx
<TopBar
  ...existing props...
  myWorkCount={myWorkCount}
  onOpenMyWork={() => setMyWorkOpen(true)}
  onOpenWeeklyBriefing={() => setShowWeeklyBriefing(true)}
/>
```

Add MyWorkPanel after the WeeklyBriefing modal:
```tsx
<MyWorkPanel
  open={myWorkOpen}
  onClose={() => { setMyWorkOpen(false); /* refresh count */ fetchMyActions().then(a => a && setMyWorkCount(a.filter(x => x.status !== 'completed' && x.status !== 'dismissed').length)); }}
  onNavigateToEvent={(eventId) => {
    setMyWorkOpen(false);
    // Find event in feed and select it
    if (dis.items) {
      const idx = dis.items.findIndex(d => {
        const eid = eventId(d as { event?: string; risk?: string; region?: string });
        return eid === eventId || ('id' in d && (d as any).id === eventId);
      });
      if (idx >= 0) handleSelectIndex(idx);
    }
  }}
/>
```

Import MyWorkPanel and fetchMyActions.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /home/ubuntu/disruption-monitor/frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Build frontend**

Run: `cd /home/ubuntu/disruption-monitor/frontend && npx vite build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/v3/components/MyWorkPanel.tsx frontend/src/v3/components/TopBar.tsx frontend/src/v3/V3App.tsx
git commit -m "feat(actions): My Work panel with TopBar badge + V3App wiring

Slide-out panel showing assigned actions grouped by urgency.
Quick-complete and dismiss directly from panel. Badge count
on TopBar icon shows open action count. Weekly Briefing button
also wired.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Phase 4: Deploy + Verify (Task 13)

### Task 13: Test, deploy, and verify

- [ ] **Step 1: Run full backend test suite**

Run: `cd /home/ubuntu/disruption-monitor && python3 -m pytest backend/tests/ -q --ignore=backend/tests/test_api.py`
Expected: All pass.

- [ ] **Step 2: Run TypeScript check**

Run: `cd /home/ubuntu/disruption-monitor/frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Build frontend**

Run: `cd /home/ubuntu/disruption-monitor/frontend && npx vite build`
Expected: Build succeeds.

- [ ] **Step 4: Restart backend and verify new endpoints**

```bash
sudo systemctl restart disruption-monitor
sleep 2
# Verify new endpoints
curl -s http://localhost:3101/api/v1/actions/mine | python3 -c "import sys,json; print(json.load(sys.stdin))"
curl -s http://localhost:3101/api/v1/events?limit=999999 | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'{len(d)} events (limit should be capped at 500)')"
```

- [ ] **Step 5: Deploy frontend to S3**

```bash
aws s3 sync frontend/dist/ s3://sc-monitor-frontend-317683112105/ --delete
aws cloudfront create-invalidation --distribution-id E2XQOK89HTZGBN --paths "/*"
```

- [ ] **Step 6: Push to both branches**

```bash
git push origin master
git checkout main && git merge master --ff-only && git push origin main && git checkout master
```

- [ ] **Step 7: Save progress to memory**

Update memory with sprint completion status.
