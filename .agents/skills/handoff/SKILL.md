---
name: handoff
description: >-
  Summarize the current chat or plan into a root-level HANDOFF_*.md for starting
  a fresh chat without context rot. Use when the user invokes /handoff, asks for
  a handoff, context transfer, or a clean summary to continue work in a new session.
disable-model-invocation: true
---

# Handoff

Produce a **single markdown file** at the **repository root** so a new chat can continue without prior conversation history.

## When to run

- User says `/handoff`, "hand off", "start fresh", or "summarize for a new chat"
- Long planning thread with rejected approaches that would confuse implementation
- Before closing a session with unfinished work

## Workflow

1. **Identify the active decision** — what is actually being built or done next? Read the current plan file if one exists (`.cursor/plans/*.md` or user-linked plan).
2. **Discard superseded work** — do not carry forward rejected designs, abandoned options, or exploratory dead ends unless listed briefly under "Rejected (do not implement)".
3. **Pick `shortName`** — lowercase kebab-case, 2–4 words (e.g. `trail-miles`, `boss-reroll-fix`).
4. **Write** `HANDOFF_<shortName>.md` at the **repo root** (same directory as `package.json` / `AGENTS.md`).
5. **Tell the user** to open a new chat and attach or `@`-reference that file as the only context.

Do **not** update the plan file unless the user also asked to revise the plan. The handoff is the entry point for the new chat.

## Output template

Use this structure. Keep it **short and actionable** — aim for what a developer needs in the first 5 minutes, not a transcript.

```markdown
# Handoff: <Title>

**Status:** <not started | in progress | ready to implement | blocked>
**Branch / plan:** <optional>
**New chat prompt:** Attach this file and say: "<one-line instruction>"

## Goal

<1–3 sentences — what we're trying to accomplish>

## Decided approach

<Bullets or short paragraphs — the chosen design only>

## Implementation checklist

- [ ] <concrete task>
- [ ] ...

## Key files

| File | Why |
|------|-----|
| `path` | ... |

## Constraints

- <hard rules that must not be violated>

## Rejected (do not implement)

- <one line per rejected idea — prevents context rot>

## Open questions

- <only if blocking; omit section if none>

## Verification

- `bun run typecheck`
- `bun run check`
- <other commands>
```

## Writing rules

- **Third person or imperative** — written for the next agent, not the user diary.
- **No canvas/plan archaeology** — omit proportional display layers, geographic curves, or other paths unless listed under Rejected.
- **Numbers and constants** — include final tuned values if decided; mark TBD if not.
- **No duplicate of AGENTS.md** — link `AGENTS.md` for project conventions; don't paste the whole constitution.
- **One handoff per topic** — if multiple unrelated threads, ask which to hand off or produce separate files.

## Example new-chat prompt (tell the user)

> Open a new chat, attach `HANDOFF_trail-miles.md`, and say: "Implement the handoff."
