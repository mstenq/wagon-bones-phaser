# Difficulty System — Implementation Feedback

## Overall Assessment: Solid ✅

All 1197 tests pass (55 dedicated to the difficulty system). Architecture is clean, types are sound, and the feature is well-integrated.

---

## Issues Found

### 1. Skin Walker effect is NOT implemented — Cursed interaction cannot fire

**Severity:** Low (design debt, not a bug)

`skin_walker` exists in `frontier_encounters.json` but has no `instantEffect` field and no `case` handler in `ConsumablesSystem.ts`. The planned "Skin Walker doesn't work on Cursed items" interaction documented in DIFFICULTY.md is moot until Skin Walker's base effect is coded.

`priests_blessing` IS implemented (line 398 of ConsumablesSystem.ts) but does **not** check for Cursed before destroying other equipment. If player has Cursed equipment, `priests_blessing` will currently delete it via `equipment.splice(0, length, chosen)` — bypassing the sell protection since it's destruction, not selling.

**Recommendation:** When implementing Skin Walker, add Cursed checks. For Priest's Blessing, decide whether Cursed items should survive the "destroy all others" effect (they currently don't).

---

### 2. `priests_blessing` destroys Cursed equipment

**Severity:** Medium (conflicts with stated design intent)

The documented behavior says Skin Walker/Priest's Blessing "do NOT work on Cursed equipment" but the current `priests_blessing` code at line 398-405 simply picks a random item, gives it holy aura, and replaces the entire equipment array. It does not filter out Cursed items from destruction.

If the intent is that Cursed items **survive** Priest's Blessing (only non-cursed items are destroyed), the code needs:
```typescript
case 'priests_blessing': {
  if (player.equipment.length === 0) return { success: false, failReason: 'No equipment!' };
  const holyAura = getItemAuraById('holy');
  if (!holyAura) return { success: true };
  const chosenIdx = Math.floor(Math.random() * player.equipment.length);
  const chosen = player.equipment[chosenIdx];
  chosen.def = { ...chosen.def, aura: holyAura };
  // Keep cursed items that weren't chosen
  const survivors = player.equipment.filter((e, i) => i === chosenIdx || isEquipmentCursed(e));
  player.equipment.splice(0, player.equipment.length, ...survivors);
  return { success: true };
}
```

## Minor Polish Suggestions

| Area | Suggestion |
|------|-----------|
| Test coverage | No test verifies `getEquipmentPurchasePrice()` returns $1 for leased items |
