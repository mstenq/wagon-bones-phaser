# REFACTOR 10 — EventBus cleanup

**Prerequisites:** [REFACTOR_8.md](./REFACTOR_8.md) recommended  
**Next:** [REFACTOR_11.md](./REFACTOR_11.md)

---

## Goal

**One blessed cross-host signal:** `Events.SCENE_READY` for Solid ↔ Phaser. Remove or replace gameplay EventBus emissions/listeners with store/facade/playback.

---

## Current usage (audit)

| Event | Emit | Listen |
|-------|------|--------|
| `SCENE_READY` | Most scenes | `PhaserGame.tsx` |
| `PERMITS_CHANGED` | `JourneyInfoModal` | `RoundSelectScene` → restart scene |
| `TAG_EARNED`, `ROUND_SKIPPED` | `RoundSelectScene` | **none** |
| `TAG_QUEUE_CHANGED` | `ShopScene` | **none** |
| `LEASE_PAID`, `EQUIPMENT_PERISHED`, `LEASE_DEFAULTED` | `GameScene` | **none** (floating text inline) |
| `PHASE_CHANGED`, … | unused | unused |

---

## Target design

### Keep

- `SCENE_READY` — document as **host-only** in `EventBus.ts`

### Replace

| Event | Replacement |
|-------|-------------|
| `PERMITS_CHANGED` | `runStore` patch + `sceneActions.syncRoundSelectFromRun` or re-enter round select via facade `gameMeta.refreshRoundSelect()` |
| `TAG_EARNED`, `ROUND_SKIPPED` | Delete emits OR enqueue `playback({ kind: 'tag-earned' })` if animation needed |
| `TAG_QUEUE_CHANGED` | `selectPendingTagCount` / shop scene `bindStore` on `runStore` |
| Lease/perished/defaulted | Already `modifier-feedback` playback command (REFACTOR_4) — delete EventBus emits |

### Delete from `Events` constant object

Remove unused gameplay constants after grep confirms zero references:

- `PHASE_CHANGED`, `HAND_UPDATED`, `DICE_ROLLED`, `SCORE_CALCULATED`, `DAY_ENDED`, `ROUND_WON`, `ROUND_LOST`, `REROLL_UPDATED`, `SPENT_REFRESHED`, `EQUIPMENT_DESTROYED`

---

## Tasks

- [ ] Remove dead emits (`TAG_EARNED`, etc.) or wire to playback
- [ ] Migrate `PERMITS_CHANGED` listener: RoundSelect subscribes to `runStore` selector `selectPurchasedPermits` revision string instead
- [ ] Remove lease/perished EventBus emits from GameScene/runner
- [ ] Trim `Events` to `SCENE_READY` + any you intentionally keep
- [ ] Update `PUBLIC_API_SPEC.md` EventBus section (or defer to REFACTOR_11)
- [ ] `bun run check`

---

## Acceptance criteria

- [ ] `rg 'Events\.(TAG_|ROUND_|LEASE_|PHASE_|HAND_|DICE_|SCORE_|DAY_|REROLL|SPENT|EQUIPMENT_DESTROYED)' src/` → empty
- [ ] `SCENE_READY` still works (menu → game)
- [ ] Dev permit grant in Journey modal still refreshes round select UI

---

## Verification

Manual: dev mode grant permit → round select shows update without relying on EventBus (if dev modal kept).

---

## Pitfalls

- `EventBus.removeListener(Events.SCENE_READY)` in PhaserGame — do not break cleanup.
- External mods/docs referencing old event names — grep repo docs.

---

## Out of scope

- Removing Phaser dependency from `EventBus.ts` (optional future: use mitt in shared package)
