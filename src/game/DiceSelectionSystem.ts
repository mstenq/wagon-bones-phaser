// ─── Dice Selection System (No Phaser imports) ───
// Handles the common pattern: draw N dice from player pool, player picks some, apply effect.
// Used by supply cards (mirage, shallow_grave) and frontier encounters (gold_rush, etc.).

import { Die, DiceAura, DiceEnhancement, DiceSticker } from './types';
import { getRunState, runStore } from './store/runStore';
import { diceActions } from './store/actions/diceActions';
import { replaceEquipmentList, resolveEquipmentList } from './store/resolve';
import { storedFromEquipmentInstances } from './store/resolve';
import { setDieEnhancement } from './DiceSystem';
import { processEquipmentOnDiceDestroyed } from './EquipmentEffects';
import { CHANCES } from './Constants';
import diceAuras from '../data/dice_auras';
import { rngFloat, rngShuffle } from './RunRng';

// ─── Effect Types ───

export type DiceSelectionEffectType =
  | 'DESTROY' // shallow_grave: destroy selected dice
  | 'COPY' // seeing_double: duplicate selected die
  | 'ADD_STICKER' // gold_rush, snake_oil, spirit_guide, deputize
  | 'CLONE' // mirage: left die becomes a copy of right die
  | 'APPLY_AURA' // spirit_shaman: apply a random aura
  | 'BUMP_VALUE' // medicine: bump die value up or down by 1
  | 'ENHANCE'; // coffee_tin, buzzards, etc: change die enhancement

export interface DiceSelectionEffectParams {
  sticker?: DiceSticker; // for ADD_STICKER
  copyCount?: number; // how many copies (for COPY)
  aura?: DiceAura; // for APPLY_AURA (if null, picks random)
  bumpDirection?: 'up' | 'down'; // for BUMP_VALUE (set by UI)
  enhancement?: DiceEnhancement; // for ENHANCE
}

export interface DiceSelectionConfig {
  drawCount: number; // how many dice to show (typically 5)
  /** Maximum dice the player may select. */
  pickCount: number;
  /** Minimum dice required to apply (defaults to pickCount). */
  minPickCount?: number;
  effectType: DiceSelectionEffectType;
  effectParams: DiceSelectionEffectParams;
  cardName: string; // for display
  description: string; // for display
  skippable: boolean; // can the player skip without picking?
}

export function getDiceSelectionMinPicks(config: DiceSelectionConfig): number {
  return config.minPickCount ?? config.pickCount;
}

export function getDiceSelectionMaxPicks(config: DiceSelectionConfig): number {
  return config.pickCount;
}

export function isDiceSelectionReady(config: DiceSelectionConfig, selectedCount: number): boolean {
  return selectedCount >= getDiceSelectionMinPicks(config) && selectedCount <= getDiceSelectionMaxPicks(config);
}

export interface DiceSelectionState {
  config: DiceSelectionConfig;
  drawnDice: Die[]; // the dice shown to the player
  selectedIds: string[]; // currently selected dice IDs
}

/** Only BUMP_VALUE is allowed to change the displayed face value in-roll. */
export function shouldUpdateDisplayedDiceValue(effectType: DiceSelectionEffectType): boolean {
  return effectType === 'BUMP_VALUE';
}

function findRunDie(dieId: string): Die | undefined {
  return getRunState().dice.find((d) => d.id === dieId);
}

function patchRunDie(dieId: string, updater: (die: Die) => Die): boolean {
  const state = getRunState();
  const idx = state.dice.findIndex((d) => d.id === dieId);
  if (idx < 0) return false;
  const dice = [...state.dice];
  dice[idx] = updater({ ...dice[idx]! });
  runStore.setState({ dice });
  return true;
}

// ─── Drawing Dice ───

/**
 * Draw dice from the player's pool.
 * Uses active (non-spent) dice first, then shuffles spent dice if needed.
 * Returns copies (not references) so originals stay in pool.
 */
export function drawDiceForSelection(count: number): Die[] {
  const run = getRunState();
  // drawCount 0 means "show handSize dice from non-spent pool"
  const effectiveCount = count > 0 ? count : run.handSize;
  const spent = new Set(run.spentDiceIds);
  const pool =
    count > 0
      ? rngShuffle('dice', run.dice)
      : rngShuffle(
          'dice',
          run.dice.filter((d) => !spent.has(d.id)),
        );
  return pool.slice(0, Math.min(effectiveCount, pool.length)).map((d) => ({ ...d }));
}

// ─── Applying Effects ───

/**
 * Apply the selected effect to the player's actual dice.
 * Returns a description of what happened.
 */
export function applyDiceSelectionEffect(config: DiceSelectionConfig, selectedDice: Die[]): string {
  switch (config.effectType) {
    case 'DESTROY':
      return applyDestroy(selectedDice);
    case 'COPY':
      return applyCopy(selectedDice, config.effectParams.copyCount ?? 2);
    case 'ADD_STICKER':
      return applyAddSticker(selectedDice, config.effectParams.sticker!);
    case 'CLONE':
      return applyClone(selectedDice);
    case 'APPLY_AURA':
      return applyAura(selectedDice, config.effectParams.aura ?? null);
    case 'BUMP_VALUE':
      return applyBumpValue(selectedDice, config.effectParams.bumpDirection ?? 'up');
    case 'ENHANCE':
      return applyEnhance(selectedDice, config.effectParams.enhancement ?? null);
  }
}

function applyDestroy(selectedDice: Die[]): string {
  const ids = new Set(selectedDice.map((d) => d.id));
  const enhancedCount = selectedDice.filter((d) => d.enhancement !== null).length;
  const state = getRunState();
  const before = state.dice.length;
  const equipment = resolveEquipmentList();
  const dice = state.dice.filter((d) => !ids.has(d.id));
  const removed = before - dice.length;
  if (removed > 0) {
    processEquipmentOnDiceDestroyed(equipment, removed, enhancedCount);
    runStore.setState({ dice, equipment: storedFromEquipmentInstances(equipment) });
    replaceEquipmentList(equipment);
  }
  return `Destroyed ${removed} dice`;
}

function applyCopy(selectedDice: Die[], copyCount: number): string {
  const die = selectedDice[0];
  if (!die) return 'No die selected';
  const original = findRunDie(die.id);
  if (!original) return 'Die not found';
  for (let i = 0; i < copyCount; i++) {
    diceActions.addDie({ ...original });
  }
  return `Created ${copyCount} copies`;
}

function applyAddSticker(selectedDice: Die[], sticker: DiceSticker): string {
  const die = selectedDice[0];
  if (!die) return 'No die selected';
  if (!findRunDie(die.id)) return 'Die not found';
  patchRunDie(die.id, (d) => ({ ...d, sticker }));
  return `Applied ${sticker} sticker`;
}

function applyClone(selectedDice: Die[]): string {
  if (selectedDice.length < 2) return 'Select 2 dice';
  const left = findRunDie(selectedDice[0].id);
  const right = findRunDie(selectedDice[1].id);
  if (!left || !right) return 'Dice not found';

  patchRunDie(left.id, (d) => {
    const cloned = { ...d };
    setDieEnhancement(cloned, right.enhancement);
    cloned.sticker = right.sticker;
    cloned.aura = right.aura;
    return cloned;
  });

  return `Cloned ${right.enhancement ?? 'standard'} die`;
}

// ─── Aura ───

/** Weighted random aura — thresholds from Constants.CHANCES */
export function pickRandomAura(): DiceAura {
  const roll = rngFloat('consumables');
  if (roll < CHANCES.AURA_HOLY) return 'holy';
  if (roll < CHANCES.AURA_HOLY + CHANCES.AURA_FIRE) return 'fire';
  return 'icy';
}

function applyAura(selectedDice: Die[], aura: DiceAura | null): string {
  const die = selectedDice[0];
  if (!die) return 'No die selected';
  if (!findRunDie(die.id)) return 'Die not found';

  const chosenAura = aura ?? pickRandomAura();
  patchRunDie(die.id, (d) => ({ ...d, aura: chosenAura }));

  const info = diceAuras.find((a) => a.id === chosenAura);
  const auraName = info ? info.name : chosenAura;
  return `Applied ${auraName} aura`;
}

function applyEnhance(selectedDice: Die[], enhancement: DiceEnhancement): string {
  let count = 0;
  for (const die of selectedDice) {
    const updated = patchRunDie(die.id, (original) => {
      const next = { ...original };
      setDieEnhancement(next, enhancement);
      return next;
    });
    if (!updated) continue;
    setDieEnhancement(die, enhancement);
    count++;
  }
  return `Enhanced ${count} dice to ${enhancement ?? 'standard'}`;
}

function applyBumpValue(selectedDice: Die[], direction: 'up' | 'down'): string {
  const die = selectedDice[0];
  if (!die) return 'No die selected';
  if (!findRunDie(die.id)) return 'Die not found';

  // Use the visible value (from the passed-in die, which may be a rolled copy)
  const currentValue = die.value;
  const delta = direction === 'up' ? 1 : -1;
  const newValue = Math.min(12, Math.max(1, currentValue + delta));
  if (newValue === currentValue) return `Already at ${currentValue}`;
  patchRunDie(die.id, (d) => ({ ...d, value: newValue }));
  return `Bumped die from ${currentValue} to ${newValue}`;
}
