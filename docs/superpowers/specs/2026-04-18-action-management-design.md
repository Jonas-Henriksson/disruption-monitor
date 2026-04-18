# Action Management System — Design Spec

**Date:** 2026-04-18
**Status:** Draft
**Scope:** End-to-end action lifecycle — from AI-generated recommendations through assignment, completion, and audit trail, with MS365 directory integration and Teams notifications.

---

## Problem

The monitor detects disruptions and generates recommended actions, but the workflow stops there. There is no way to:
- Assign actions to specific people from the organization directory
- Track who is working on what across all disruptions
- Record what was actually done (completion notes, evidence)
- Distinguish AI suggestions from manually added tasks
- See a personal view of "my work" across all events
- Notify assignees via Teams when they receive work

The existing `actions` and `tickets` tables have partial infrastructure but are disconnected from each other and underutilized by the frontend.

---

## Core Model

```
Event (disruption)
  └── Actions (work items)
        ├── AI-generated (created during scan, labeled "AI Suggested")
        ├── Template-based (picked from predefined types, labeled "Added by {name}")
        └── Free-form (typed manually, labeled "Added by {name}")
              └── Assignment (person from MS365 directory)
                    └── Completion (note + optional evidence link)
```

**Event → Actions → Assignments.** An event is the disruption. Actions are the work items. Each action can be independently assigned to a person. The event has an overall owner (accountable), but individual actions can be delegated to different people.

---

## Three UI Surfaces

### 1. Event Action Tab (existing, upgraded)

The "Act" tab on ExpandedCard, redesigned to be the action management hub for a single event.

**Layout:**
- **Header:** Progress bar ("4 of 6 actions complete") + "Add Action" button
- **Action list:** Each action is a row with:
  - Source badge: "AI Suggested" (muted blue) or "Added by {name}" (muted green)
  - Title and description
  - Assignee: avatar/initials + name, or "Unassigned" (grayed)
  - Priority pill: Critical / High / Normal / Low
  - Due date (with overdue styling if past)
  - Status indicator: Pending / Assigned / In Progress / Done / Dismissed
- **Unassigned actions:** Visible but visually muted (reduced opacity). Full AI suggestion trail preserved.
- **Completed actions:** Green checkmark, completion note visible inline, evidence link if provided.
- **Dismissed actions:** Faded, strikethrough title, optional reason visible on hover/expand.

**"Add Action" flow:**
1. Click "Add Action" button
2. Modal/dropdown shows:
   - **Templates section:** 8 predefined types (Activate backup supplier, Increase safety stock, Reroute shipment, Contact supplier, Monitor situation, Escalate to leadership, File insurance claim, Activate BCP). Each pre-fills title and description which the user can edit.
   - **Free-form section:** Empty title + description fields
3. Set assignee (people picker), priority, due date (all optional at creation)
4. Submit → action created, appears in list

**Assignment flow:**
1. Click assignee area on any action
2. People picker autocomplete searches MS365 directory
3. Select person → name, email, profile photo cached
4. Optionally set/update due date and priority
5. Action status transitions to "Assigned"
6. Teams chat notification sent to assignee (see Teams Integration section)

**Completion flow:**
1. Click "Mark Done" on an action (from Action Tab or My Work Panel)
2. Required: completion note text field (e.g., "Spoke to Tata Steel, 6-week lead time confirmed, new PO #4521 raised")
3. Optional: evidence link URL (email, Teams message, SharePoint doc, etc.)
4. Submit → status transitions to "Done", timestamp + completer identity recorded
5. Other team members see the completed action with note and evidence on the event

**Dismiss flow:**
1. Click "Dismiss" on an action
2. Optional: reason text field (e.g., "Already handled by Munich office" or "Not applicable — supplier relationship ended Q1")
3. Action fades but remains visible in the list for audit trail

### 2. My Work Panel (new slide-out)

A right-side slide-out panel showing all actions assigned to the current user across all events. Personal command center.

**Trigger:** Persistent icon in TopBar with badge count of open actions. Badge shows overdue count in red if any.

**Layout:**
- **Summary header:** "3 of 7 complete, 1 overdue"
- **Grouped action list:**
  - **Overdue** (red section header, sorted by how overdue)
  - **Due Today** (amber section header)
  - **This Week** (default section header)
  - **Later / No Due Date** (muted section header)
- **Each row shows:**
  - Action title (truncated)
  - Parent event name + severity badge (so you know which disruption this belongs to)
  - Priority pill
  - Due date
  - Status
- **Interactions:**
  - Click action → navigates to that event's expanded card in the feed, scrolls to the action
  - Quick-complete: "Done" button directly on the row → opens completion note modal inline (no navigation required)
  - Quick-dismiss: "Dismiss" button → same inline flow

**Empty state:** "No actions assigned to you. Actions appear here when a team member assigns you work on a disruption."

### 3. My Items Feed Filter (existing, wired up)

The existing "My Items" button on FeedList. Currently filters by `status === 'active'`.

**Change:** Filter to events where the current user has at least one assigned action (matched by Azure SSO email).

**Feed card enhancement:** When My Items filter is active, show action progress inline on each feed card — e.g., small text below the event title: "2/4 actions complete" with a mini progress bar.

---

## Action Lifecycle

```
                    ┌─────────────────────────────────────┐
                    │                                     │
  AI Scan ──► [Pending]                                   │
  Manual  ──►    │                                        │
                 │ assign                                  │
                 ▼                                        │
            [Assigned] ──────────────────────► [Dismissed] │
                 │                             (+ optional │
                 │ start work                    reason)   │
                 ▼                                        │
           [In Progress] ─────────────────────────────────┘
                 │
                 │ complete (+ required note,
                 │           + optional evidence URL)
                 ▼
              [Done]
```

- Any action can be dismissed from any state except Done
- Transition from Pending → In Progress is allowed (skipping Assigned for self-service)
- Done is terminal — cannot be reopened (create a new action instead)
- Dismissed actions remain visible but faded, with reason in audit trail

---

## Event-Level Visibility

What everyone on the team sees on an event:

- **Action progress bar:** "4 of 6 actions complete" (dismissed actions excluded from denominator)
- **Assignee avatars:** Row of small profile photos/initials showing who is working on this event
- **Completed actions:** Show completion note and evidence link inline
- **Dismissed actions:** Faded, with reason on hover
- **Soft archive gate:** When archiving an event, if open actions remain, show a confirmation: "2 actions are still open. Archive anyway?" Override available — this is advisory, not blocking.

---

## Teams Integration

When an action is assigned, send a 1:1 Teams chat message to the assignee.

**Message format:**
```
🔴 Action assigned to you — SC Hub Disruption Monitor

Event: {event title} ({severity})
Action: {action title}
Priority: {priority}
Due: {due date or "No due date"}
Assigned by: {assigner name}

Open in SC Hub: {deep link URL to event}
```

**Implementation:**
- Use MS Graph `POST /chats` (delegated, `Chat.ReadWrite` permission — already granted) to create/find a 1:1 chat with the assignee
- Then `POST /chats/{chatId}/messages` to send the message
- The assigner's Graph token is used (delegated flow), so the message appears "from" the person who assigned it
- Fire-and-forget: if Teams send fails, log the error but don't block the assignment. The action is still assigned regardless.

**Future extensions (not in this spec):**
- Channel-level notifications (post to a team channel when Critical events get new actions) — needs `ChannelMessage.Send` permission or Incoming Webhook
- Notification when an action is completed (notify the event owner)
- Daily digest of overdue actions via Teams

---

## MS365 People Picker

**Endpoint:** `GET /api/v1/users/search?q={query}`

**Backend:** Proxies to MS Graph using the user's delegated token:
- Primary: `GET /me/people?$search="{query}"&$top=8` (People API — returns frequent contacts first, requires `People.Read`)
- Fallback: `GET /users?$search="displayName:{query}"&$top=8` (Directory search — requires `User.ReadBasic.All`)

**Note:** `People.Read` is not yet granted on the Azure app. Needs to be added by Nilangsu. `User.ReadBasic.All` is also not yet granted. Either one is sufficient — `People.Read` is preferred as it ranks results by relevance to the current user.

**Response shape:**
```json
[
  {
    "id": "azure-user-id",
    "displayName": "Maria Lindberg",
    "email": "maria.lindberg@skf.com",
    "photo": "base64 or URL (cached)"
  }
]
```

**Frontend:** Debounced input (300ms) with dropdown showing name + email + photo. Click to select. Selected person cached in component state until save.

---

## Backend Changes

### Database

**Extend `actions` table:**
```sql
ALTER TABLE actions ADD COLUMN assignee_email TEXT;
ALTER TABLE actions ADD COLUMN assignee_name TEXT;
ALTER TABLE actions ADD COLUMN assignee_photo TEXT;
ALTER TABLE actions ADD COLUMN source TEXT NOT NULL DEFAULT 'ai'
    CHECK (source IN ('ai', 'manual', 'template'));
ALTER TABLE actions ADD COLUMN created_by_email TEXT;
ALTER TABLE actions ADD COLUMN created_by_name TEXT;
ALTER TABLE actions ADD COLUMN completion_note TEXT;
ALTER TABLE actions ADD COLUMN evidence_url TEXT;
ALTER TABLE actions ADD COLUMN completed_at TEXT;
ALTER TABLE actions ADD COLUMN completed_by_email TEXT;
ALTER TABLE actions ADD COLUMN completed_by_name TEXT;
ALTER TABLE actions ADD COLUMN dismissed_reason TEXT;
ALTER TABLE actions ADD COLUMN dismissed_at TEXT;
ALTER TABLE actions ADD COLUMN dismissed_by_email TEXT;
```

**No new tables needed.** The existing `actions` table is extended. The existing `tickets` table retains its role as the "event-level owner" record (one per event, tracks who is accountable for the overall disruption response), while `actions` are the individual work items. The `tickets.owner` field represents event accountability; `actions.assignee_email` represents task-level delegation. Both can differ — the event owner delegates specific actions to specialists.

### New API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /api/v1/actions/mine` | GET | Actions assigned to current user (from auth token email) |
| `GET /api/v1/users/search?q=` | GET | MS Graph people search proxy |
| `PATCH /api/v1/actions/{id}/assign` | PATCH | Assign action to person + optional due/priority |
| `PATCH /api/v1/actions/{id}/complete` | PATCH | Mark done with note + optional evidence |
| `PATCH /api/v1/actions/{id}/dismiss` | PATCH | Dismiss with optional reason |

### Modified Endpoints

| Endpoint | Change |
|----------|--------|
| `POST /events/{id}/actions` | Add `source`, `created_by_email`, `created_by_name` fields |
| `POST /events/{id}/actions/generate` | Set `source: 'ai'` on generated actions |
| `GET /events/{id}/actions` | Return enriched action objects with assignee and completion data |

### Teams Notification Service

New module `backend/app/services/teams_notify.py`:
- `send_action_assignment_chat(assigner_token, assignee_email, event, action)` → sends 1:1 Teams chat
- Called from the assign endpoint, fire-and-forget (asyncio.create_task)
- Logs success/failure, does not block assignment

---

## Frontend Changes

### Components

| Component | Change |
|-----------|--------|
| `ExpandedCard.tsx` — Act tab | Redesign with action list, people picker, add action flow, completion/dismiss modals |
| `MyWorkPanel.tsx` (new) | Slide-out panel with grouped action list, quick-complete |
| `TopBar.tsx` | Add My Work icon + badge count |
| `FeedCard.tsx` | Show action progress when My Items filter active |
| `FeedList.tsx` | Wire My Items filter to assigned-actions check |
| `PeoplePicker.tsx` (new) | Reusable MS Graph people search autocomplete |

### API Client

New functions in `api.ts`:
- `fetchMyActions()` → `GET /actions/mine`
- `searchUsers(query)` → `GET /users/search?q=`
- `assignAction(actionId, assignee, options?)` → `PATCH /actions/{id}/assign`
- `completeAction(actionId, note, evidenceUrl?)` → `PATCH /actions/{id}/complete`
- `dismissAction(actionId, reason?)` → `PATCH /actions/{id}/dismiss`

---

## What This Spec Does NOT Include

- **Email notifications** — Teams chat only for now. Email digest is a future extension.
- **SLA escalation** — overdue actions are visually flagged but don't auto-escalate. Future: configurable escalation rules.
- **Jira/ServiceNow sync** — the ITSM bridge stub exists but is not wired. Future: when actions are created, optionally sync to external ticketing.
- **Action dependencies** — no "action B blocked by action A" modeling. Keep it flat for now.
- **Recurring actions** — no "check in weekly on this supplier" pattern. Future consideration.
- **Mobile responsive** — My Work Panel designed for desktop. Mobile layout is a future pass.
- **Offline support** — requires backend connectivity for people search and Teams notifications.

---

## Permission Requirements

| Permission | Type | Status | Needed For |
|------------|------|--------|------------|
| `Chat.ReadWrite` | Delegated | Granted | Teams 1:1 chat notifications |
| `Channel.ReadBasic.All` | Application | Granted | Future: channel discovery for channel notifications |
| `People.Read` | Delegated | **Needs adding** | People picker (preferred — relevance-ranked) |
| `User.ReadBasic.All` | Delegated | **Needs adding** (fallback) | People picker (directory search fallback) |

**Action item:** Request `People.Read` delegated permission from Nilangsu. One of `People.Read` or `User.ReadBasic.All` is sufficient.
