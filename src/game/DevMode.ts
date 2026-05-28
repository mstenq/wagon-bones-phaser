// ─── Dev Mode Utilities ───
// Dev tools (shop swap, boss test, etc.) when developer profession is selected or ?devmode=true.

import { GAMEPLAY } from './Constants';
import { createEmptyModifiers, createEmptyTrailRoundEffects } from './TrailEventsSystem';
import { resetBossRoundState } from './BossEffectsSystem';
import bosses from '../data/bosses';
import type { BossDef } from './types';
import { getAllEquipment, EquipmentDef, ItemAura } from './ItemsSystem';
import { getSupplyDefById, getTrailGuideDefById, getFrontierDefById, ConsumableDef } from './ConsumablesSystem';
import { applyPermitEffectToRun, getPermitById, PermitDef } from './PermitsSystem';
import itemAuras from '../data/item_auras';
import { getPackDefById, type PackDefinition } from './BoosterPackSystem';
import { bossActions, getRunState, permitActions, roundActions, runActions } from './store';
import { selectProfession } from './store/selectors/runSelectors';

let urlDevModeEnabled = false;

/** Read ?devmode=true from the page URL (call once at app bootstrap). */
export function initDevModeFromUrl(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  urlDevModeEnabled = params.get('devmode') === 'true';
}

/** Test-only override for URL dev mode flag. */
export function setUrlDevModeForTests(enabled: boolean): void {
  urlDevModeEnabled = enabled;
}

/** Check if dev mode is active (developer profession or ?devmode=true). */
export function isDevMode(): boolean {
  if (urlDevModeEnabled) return true;
  return selectProfession(getRunState())?.id === 'developer';
}

/** Result of looking up a shop item by ID */
export type DevLookupResult =
  | { type: 'equipment'; def: EquipmentDef }
  | { type: 'consumable'; def: ConsumableDef }
  | null;

/**
 * Look up an item by ID for shop swap.
 * Search order: equipment, supply cards, trail guides, frontier encounters.
 */
export function devLookupShopItem(id: string): DevLookupResult {
  // 1. Equipment
  const allEquip = getAllEquipment();
  const equipDef = allEquip.find((e) => e.id === id);
  if (equipDef) return { type: 'equipment', def: equipDef };

  // 2. Supply cards
  const supplyDef = getSupplyDefById(id);
  if (supplyDef) return { type: 'consumable', def: supplyDef };

  // 3. Trail guides
  const tgDef = getTrailGuideDefById(id);
  if (tgDef) return { type: 'consumable', def: tgDef };

  // 4. Frontier encounters
  const feDef = getFrontierDefById(id);
  if (feDef) return { type: 'consumable', def: feDef };

  return null;
}

/** Look up a pack definition by ID */
export function devLookupPack(id: string): PackDefinition | null {
  return getPackDefById(id) ?? null;
}

/** Look up a permit by ID */
export function devLookupPermit(id: string): PermitDef | null {
  return getPermitById(id);
}

/** Grant a permit without cost (dev only). Stage 2 auto-grants its stage 1 prerequisite. */
export function devGrantPermit(id: string): { ok: true; added: string[] } | { ok: false; error: string } {
  const permit = getPermitById(id.trim());
  if (!permit) return { ok: false, error: `Permit not found: ${id}` };

  const toGrant: PermitDef[] = [];

  if (permit.stage === 2 && permit.prerequisiteId) {
    const prereq = getPermitById(permit.prerequisiteId);
    if (prereq && !permitActions.hasPermit(prereq.id)) toGrant.push(prereq);
  }

  if (!permitActions.hasPermit(permit.id)) toGrant.push(permit);

  if (toGrant.length === 0) return { ok: false, error: 'Permit already owned' };

  const added: string[] = [];
  for (const p of toGrant) {
    const state = getRunState();
    runActions.patch({ purchasedPermits: [...state.purchasedPermits, p.id] });
    applyPermitEffectToRun(p);
    added.push(p.id);
  }

  return { ok: true, added };
}

/** Get all available item auras (for the equipment aura swap dropdown) */
export function devGetAllAuras(): ItemAura[] {
  return itemAuras;
}

/** All boss definitions (for dev boss picker) */
export function devGetAllBosses(): BossDef[] {
  return bosses;
}

/** Configure run state and start a boss round with a specific boss */
export function devStartBossRound(bossId: string): BossDef | null {
  const boss = devGetAllBosses().find((b) => b.id === bossId);
  if (!boss) return null;

  // Force a fresh boss-round bootstrap when GameScene is started from a dev modal.
  // Without this, stale roundStore state can trigger "restored round" path and skip boss init hooks.
  roundActions.clearRound();

  runActions.patch({
    round: GAMEPLAY.ROUNDS_PER_LEG,
    bossEffectDisabled: false,
    trailEventModifiers: createEmptyModifiers(),
    trailRoundEffects: createEmptyTrailRoundEffects(),
    skipNextShop: false,
  });
  bossActions.setBossForCurrentLeg(boss);
  resetBossRoundState();

  return boss;
}
