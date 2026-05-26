# REFACTOR 10 — EventBus cleanup

**Prerequisites:** [REFACTOR_8.md](./REFACTOR_8.md) recommended  
**Next:** [REFACTOR_11.md](./REFACTOR_11.md)

---

## REFACTOR 9 handoff

- **`PlaybackRunner` `handlers.ts`** already uses `gameFacade.boss.revealLandSlideHints` (done in REFACTOR 9).
- **Non–Game scenes** now use `gameFacade.shop` / `pack` / `trail` / `meta`; pouch consumables in shop/pack go through `gameFacade.consumable.use` or `gameFacade.pack.useFromPouch` (playback enqueued in facade).
- **`Preloader.ts`** still imports `getConsumableTexturePrefix` from `ConsumablesSystem` (asset preload only).
- **`DiceSelectionScene`** still imports `DiceSelectionSystem` (not in REFACTOR 9 scope).

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

- [x] Remove dead emits (`TAG_EARNED`, etc.) or wire to playback
- [x] Migrate `PERMITS_CHANGED` listener: RoundSelect subscribes to `runStore` selector `selectPurchasedPermitsRevision` instead
- [x] Remove lease/perished EventBus emits from GameScene/runner
- [x] Trim `Events` to `SCENE_READY` + any you intentionally keep
- [x] Update `PUBLIC_API_SPEC.md` EventBus section (or defer to REFACTOR_11)
- [x] `bun run check`

---

## Acceptance criteria

- [x] `rg 'Events\.(TAG_|ROUND_|LEASE_|PHASE_|HAND_|DICE_|SCORE_|DAY_|REROLL|SPENT|EQUIPMENT_DESTROYED)' src/` → empty
- [ ] `SCENE_READY` still works (menu → game)
- [ ] Dev permit grant in Journey modal still refreshes round select UI

---

## REFACTOR 11 handoff

- `EventBus.ts` exports only `SCENE_READY`; gameplay events removed.
- `selectPurchasedPermitsRevision` in `runSelectors.ts` drives `RoundSelectScene` refresh via `bindStore`.
- Remaining `PUBLIC_API_SPEC.md` facade/playback sections still need the full REFACTOR_11 pass.

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
