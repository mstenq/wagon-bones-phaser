# Refactor 5: Extract Settings Modal Shell And Break Modal Cycles

## Goal

Remove duplication between settings modals and break circular imports involving `OptionsModal`.

Primary targets:

- `src/phaser/ui/OptionsModal.ts`
- `src/phaser/ui/SoundsSettingsModal.ts`
- `src/phaser/ui/PreferencesSettingsModal.ts`

## Why

Fallow reported circular imports:

- `OptionsModal.ts` <-> `PreferencesSettingsModal.ts`
- `OptionsModal.ts` <-> `SoundsSettingsModal.ts`

It also reported a large duplicate block between `PreferencesSettingsModal` and `SoundsSettingsModal`, including a duplicated `ToggleCheckbox` implementation and modal shell setup.

The current shape makes simple navigation ("back to options") require importing the parent modal, which creates cycles.

## Files To Inspect First

- `src/phaser/ui/OptionsModal.ts`
- `src/phaser/ui/SoundsSettingsModal.ts`
- `src/phaser/ui/PreferencesSettingsModal.ts`
- `src/phaser/ui/Button.ts`
- `src/phaser/ui/DiceSprite.ts`

## Target Shape

Add shared UI primitives:

- `src/phaser/ui/modalShell.ts`
- `src/phaser/ui/ToggleCheckbox.ts`
- optionally `src/phaser/ui/SliderControl.ts` if sounds slider logic is large enough
- `src/phaser/ui/optionsNavigation.ts`

`modalShell.ts` should own:

- dim background
- centered panel
- title
- common back/close button placement helpers
- common panel measurements

`ToggleCheckbox.ts` should own:

- checkbox graphics
- checked state
- pointer interaction
- `onChange`
- `destroy` behavior inherited from Container

`optionsNavigation.ts` should own parent/child modal navigation functions without importing child modals back into `OptionsModal` in both directions.

## Navigation Rule

Avoid circular imports by ensuring dependencies point one way.

Good shape:

- `OptionsModal` imports child modal constructors.
- Child modals do not import `OptionsModal`.
- Child modals receive an `onBack` callback from the caller.

Example:

```ts
new SoundsSettingsModal(scene, contentX, width, height, {
  onBack: () => new OptionsModal(scene, contentX, width, height),
});
```

Or:

```ts
openSoundsSettingsModal(scene, layout, {
  onBack: () => openOptionsModal(scene, layout),
});
```

Choose one simple pattern. Callback injection is usually enough.

## Implementation Plan

1. Extract `ToggleCheckbox` from one modal into `ToggleCheckbox.ts`.
2. Update both `SoundsSettingsModal` and `PreferencesSettingsModal` to import it.
3. Extract modal shell creation:
   - dim background
   - panel background
   - title text
   - common dimensions
4. Update `OptionsModal` to use the shell helper.
5. Update `SoundsSettingsModal` to use the shell helper.
6. Update `PreferencesSettingsModal` to use the shell helper.
7. Remove direct imports of `OptionsModal` from child modals.
8. Pass an `onBack` callback into child modal constructors instead.
9. Re-run fallow dead-code/circular check if available:
   - `bunx fallow dead-code --format json --quiet 2>/dev/null || true`
10. Remove any leftover duplicated checkbox or shell code.

## Constructor Guidance

Avoid adding many positional parameters. If a modal needs more than scene/layout dimensions, use an options object:

```ts
interface SoundsSettingsModalOptions {
  onBack: () => void;
}
```

Do not keep growing positional constructors.

## Behavioral Requirements

- Options modal still opens:
  - Equipment catalog
  - Sound settings
  - Preferences
  - export/load/restart/menu actions
- Sound settings still persist audio preferences.
- Preferences still persist gameplay preferences.
- Back buttons return to Options.
- Dimming/background interaction remains unchanged.
- Modal sizes and placement remain visually consistent.

## Pitfalls

- Do not introduce a modal manager or stack unless absolutely needed.
- Do not make shell helpers know about audio/gameplay preferences.
- Do not use global scene state for modal navigation.
- Do not accidentally keep the import cycle through a barrel export.

## Acceptance Criteria

- `SoundsSettingsModal.ts` and `PreferencesSettingsModal.ts` no longer define separate `ToggleCheckbox` classes.
- Child settings modals no longer import `OptionsModal`.
- Fallow no longer reports the settings modal circular dependencies.
- Modal UI behavior is unchanged.
- `bun run typecheck` passes.
- `bun run check` passes.
- `bun run build` passes.
