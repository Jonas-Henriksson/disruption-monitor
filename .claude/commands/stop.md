# SESSION STOP - CONTROLLED WIND-DOWN

Begin a controlled wind-down. **Finish what you are currently working on** but do not start any new tasks. Once your current task is complete:

## 1. Commit

Commit all work with clear, descriptive commit messages. Each commit should describe what was done and why - not just "WIP" or "updates."

## 2. Verify

- Run the build. Does it compile clean?
- Run tests. Are they passing? If something broke, note it explicitly.
- Run performance budget checks. Log any violations.
- Start services. Do they come up correctly?

If anything is broken, fix it before proceeding. Do not hand off a broken build.

## 3. Dismiss Specialists

For any specialists hired during this session:
- Review deliverables against the specialist brief
- Ensure handoff notes written to `.claude/specialists/[role]-handoff.md`
- Log hiring outcome in PROGRESS.md
- Formally dismiss

## 4. Update Living Documents

- **CLAUDE.md** - new conventions, port/config changes, environment notes
- **The project brief** - update if scope, priorities, or direction evolved
- **DESIGN_SYSTEM.md** - Frontend: add any new patterns, components, or tokens
- **ARCHITECTURE.md** - Backend: add any new ADRs from this session
- **PROGRESS.md** - log completed work, decisions, deviations from brief

## 5. Write Handoff

Write `.claude/handoffs/session-summary.md`:

- **Completed**: what was finished (specific files, features, fixes)
- **In Progress**: what's mid-flight (exact file paths and function names)
- **Next Up**: what the next session should tackle first
- **Decisions Made**: architectural/design choices (reference ADR numbers)
- **Specialists Hired**: who, what they delivered, whether to re-hire
- **Escalations Pending**: unresolved disagreements awaiting human input
- **Blockers / Warnings**: environment issues, flaky tests, known bugs
- **Running Services**: list processes/ports so they can be shut down

## 6. Team Retrospective

Every agent contributes. Be honest. Write to `.claude/retros/latest.md` (overwrite):

```
# Session Retrospective

## What Went Well
[Specific things. Name the agent and contribution.]

## What Didn't Go Well
[Specific failures or shortfalls. Be blunt.]

## What We'd Do Differently
[Concrete changes. Not "try harder" - specific process changes.]

## Team Dynamics
[Did agents challenge each other? Did anyone go silent? Did debates drag?]

## Quality Score (1-10)
[Rate and justify. Below 8 = explain what would make it a 9.]
```

## 7. Self-Assess

Each agent answers honestly:
- Did this session move the product meaningfully forward?
- Is the codebase in better shape than when the session started?
- Did I meet my own standard of excellence?
- Is there anything I settled for that doesn't meet the standard?

If the answer to the last question is yes, note it in the handoff. The next session starts there.

---

The next agent should be able to pick up exactly where you left off from the handoff, living documents, and the brief alone. If they can't, the handoff failed.
