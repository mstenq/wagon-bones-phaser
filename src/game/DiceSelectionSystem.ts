// ─── Dice Selection System (No Phaser imports) ───
// Handles the common pattern: draw N dice from player pool, player picks some, apply effect.
// Used by supply cards (mirage, shallow_grave) and frontier encounters (gold_rush, etc.).

import { Die, DiceAura, DiceEnhancement, DiceSticker } from './types';
import { getPlayerState } from './PlayerState';
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
  pickCount: number; // how many the player selects
  effectType: DiceSelectionEffectType;
  effectParams: DiceSelectionEffectParams;
  cardName: string; // for display
  description: string; // for display
  skippable: boolean; // can the player skip without picking?
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

// ─── Drawing Dice ───

/**
 * Draw dice from the player's pool.
 * Uses active (non-spent) dice first, then shuffles spent dice if needed.
 * Returns copies (not references) so originals stay in pool.
 */
export function drawDiceForSelection(count: number): Die[] {
  const player = getPlayerState();
  // drawCount 0 means "show handSize dice from non-spent pool"
  const effectiveCount = count > 0 ? count : player.handSize;
  const pool =
    count > 0
      ? rngShuffle('dice', player.dice)
      : rngShuffle(
          'dice',
          player.dice.filter((d) => !player.spentDiceIds.has(d.id)),
        );
  return pool.slice(0, Math.min(effectiveCount, pool.length)).map((d) => ({ ...d }));
}

// ─── Applying Effects ───

/**
 * Apply the selected effect to the player's actual dice.
 * Returns a description of what happened.
 */
export function applyDiceSelectionEffect(config: DiceSelectionConfig, selectedDice: Die[]): string {
  const player = getPlayerState();

  switch (config.effectType) {
    case 'DESTROY':
      return applyDestroy(player, selectedDice);
    case 'COPY':
      return applyCopy(player, selectedDice, config.effectParams.copyCount ?? 2);
    case 'ADD_STICKER':
      return applyAddSticker(player, selectedDice, config.effectParams.sticker!);
    case 'CLONE':
      return applyClone(player, selectedDice);
    case 'APPLY_AURA':
      return applyAura(player, selectedDice, config.effectParams.aura ?? null);
    case 'BUMP_VALUE':
      return applyBumpValue(player, selectedDice, config.effectParams.bumpDirection ?? 'up');
    case 'ENHANCE':
      return applyEnhance(player, selectedDice, config.effectParams.enhancement ?? null);
  }
}

function applyDestroy(player: ReturnType<typeof getPlayerState>, selectedDice: Die[]): string {
  const ids = new Set(selectedDice.map((d) => d.id));
  const enhancedCount = selectedDice.filter((d) => d.enhancement !== null).length;
  const before = player.dice.length;
  player.dice = player.dice.filter((d) => !ids.has(d.id));
  const removed = before - player.dice.length;
  if (removed > 0) {
    processEquipmentOnDiceDestroyed(player.equipment, removed, enhancedCount);
  }
  return `Destroyed ${removed} dice`;
}

function applyCopy(player: ReturnType<typeof getPlayerState>, selectedDice: Die[], copyCount: number): string {
  const die = selectedDice[0];
  if (!die) return 'No die selected';
  const original = player.dice.find((d) => d.id === die.id);
  if (!original) return 'Die not found';
  for (let i = 0; i < copyCount; i++) {
    player.addDie({ ...original });
  }
  return `Created ${copyCount} copies`;
}

function applyAddSticker(player: ReturnType<typeof getPlayerState>, selectedDice: Die[], sticker: DiceSticker): string {
  const die = selectedDice[0];
  if (!die) return 'No die selected';
  const original = player.dice.find((d) => d.id === die.id);
  if (!original) return 'Die not found';

  original.sticker = sticker;
  return `Applied ${sticker} sticker`;
}

function applyClone(player: ReturnType<typeof getPlayerState>, selectedDice: Die[]): string {
  if (selectedDice.length < 2) return 'Select 2 dice';
  const left = player.dice.find((d) => d.id === selectedDice[0].id);
  const right = player.dice.find((d) => d.id === selectedDice[1].id);
  if (!left || !right) return 'Dice not found';

  // Left becomes a copy of right (keep left's id; face value follows enhancement rules)
  setDieEnhancement(left, right.enhancement);
  left.sticker = right.sticker;
  left.aura = right.aura;

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

function applyAura(player: ReturnType<typeof getPlayerState>, selectedDice: Die[], aura: DiceAura): string {
  const die = selectedDice[0];
  if (!die) return 'No die selected';
  const original = player.dice.find((d) => d.id === die.id);
  if (!original) return 'Die not found';

  const chosenAura = aura ?? pickRandomAura();
  original.aura = chosenAura;

  const info = diceAuras.find((a) => a.id === chosenAura);
  const auraName = info ? info.name : chosenAura;
  return `Applied ${auraName} aura`;
}

function applyEnhance(
  player: ReturnType<typeof getPlayerState>,
  selectedDice: Die[],
  enhancement: DiceEnhancement,
): string {
  let count = 0;
  for (const die of selectedDice) {
    const original = player.dice.find((d) => d.id === die.id);
    if (!original) continue;
    setDieEnhancement(original, enhancement);
    count++;
  }
  return `Enhanced ${count} dice to ${enhancement ?? 'standard'}`;
}

function applyBumpValue(
  player: ReturnType<typeof getPlayerState>,
  selectedDice: Die[],
  direction: 'up' | 'down',
): string {
  const die = selectedDice[0];
  if (!die) return 'No die selected';
  const original = player.dice.find((d) => d.id === die.id);
  if (!original) return 'Die not found';

  // Use the visible value (from the passed-in die, which may be a rolled copy)
  const currentValue = die.value;
  const delta = direction === 'up' ? 1 : -1;
  const newValue = Math.min(12, Math.max(1, currentValue + delta));
  if (newValue === currentValue) return `Already at ${currentValue}`;
  original.value = newValue;
  return `Bumped die from ${currentValue} to ${newValue}`;
}
