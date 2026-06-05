# Refactor 12: Remove New Type-Boundary Casts

## Goal

Remove new or newly exposed `as any` / `as unknown` casts from the refactor series by making the type boundaries explicit.

This step should be small and surgical. It is not a general campaign to remove every old Phaser typing workaround in the repo.

## Why

The refactor split code into helpers, but some helpers now reach across private or loosely typed boundaries:

- `GameSceneDevPanel` reaches into private `Button.label` through `as any`.
- `ShopScene` still has cast-heavy permit/pack display helpers.
- Other touched files may have local casts that hide unclear contracts.

The codebase rule is to avoid new casts and inline type imports. When a caller legitimately needs a capability, expose a typed API at the owning boundary.

## Files To Inspect First

- `src/phaser/scenes/game/GameSceneDevPanel.ts`
- `src/phaser/ui/Button.ts`
- `src/phaser/scenes/ShopScene.ts`
- `src/game/SaveLoad.ts` only if inline type imports are touched nearby
- Any changed files reported by `rg "as any|as unknown|unknown as|import\\(.*\\)\\." src`

## Current Smell

`GameSceneDevPanel` does this:

```ts
(button as any).label?.setFontSize?.(13);
```

The dev panel needs a real button styling hook. It should not know about private internals.

`ShopScene` also uses casts while building card-shaped display definitions. That usually means the boundary should be a typed builder or a narrower shared display type.

## Target Shape

Prefer one of these approaches:

- Add a narrow public method to `Button`, such as `setLabelFontSize(size: number | string): this`.
- Add an optional style parameter to the `Button` constructor only if multiple callers need more than font size.
- Extract typed display builders for permit/dice pseudo-cards instead of `as unknown as EquipmentDef`.
- Replace `as any` pack casts with the correct facade/store type.

Keep Phaser-specific casts only where Phaser's typings require them, and isolate those casts in low-level rendering helpers.

## Implementation Plan

1. Run `rg "as any|as unknown|unknown as|import\\(.*\\)\\." src`.
2. Identify casts in files touched by this refactor series.
3. Add `Button.setLabelFontSize()` or a similarly narrow public API.
4. Update `GameSceneDevPanel` to use the public API.
5. Inspect `ShopScene` casts:
   - permit display def creation
   - dev pack replacement
   - pack opened marker fallback
6. Replace casts with explicit typed helpers when practical.
7. Leave old unrelated casts alone unless the file is already being edited and the fix is obvious.
8. Re-run the `rg` command to confirm no new refactor-introduced casts remain.

## Behavioral Requirements

- Dev loaded-die controls keep the same button sizes and font sizes.
- Permit cards still render with the same tooltip and price behavior.
- Dev pack swapping still works.
- No public gameplay type is broadened just to satisfy a UI cast.

## Pitfalls

- Do not expose raw `Button.label` publicly if a narrow method solves the need.
- Do not replace a cast with `unknown` plumbing that makes the contract less clear.
- Do not introduce inline type imports. Use top-level `import type`.
- Do not spend time on unrelated legacy casts unless they block this cleanup.

## Acceptance Criteria

- `GameSceneDevPanel` no longer uses `as any` to style button labels.
- Any new casts introduced by the refactor series are removed or isolated with a clear Phaser typing reason.
- No inline type imports are introduced.
- `bun run typecheck` passes.
- `bun run check` passes.
- `bun run build` passes.
