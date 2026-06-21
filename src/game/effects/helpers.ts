// ─── Shared Utility Functions ───

import { EquipmentInstance } from '../ItemsSystem';
import { walkEquipmentPerSlot, walkEquipmentScoring, type ResolveEquipmentSlotOptions } from '../equipmentUtils';
import { handTypeContains } from '../handContainment';
import { Die, HandType } from '../types';
import type { ScoringPipelineContext } from './types';
import { addScore, D, gte, multiplyScore, type Decimal, type DecimalSource } from '../scoreMath';
import { getFlourSackHandSizeBonus } from '../effectParams';
import { getRunState } from '../store/runStore';
import { resolveEquipmentList } from '../store/resolve';
import { isEquipmentDisabledByBoss } from '../BossEffectsSystem';

export type { ResolveEquipmentSlotOptions, UnresolvedCopyBehavior } from '../equipmentUtils';

/** Multiply pipeline xMult and round to avoid float drift. */
export function multiplyCtxXMult(ctx: { xMult: Decimal }, factor: number): void {
  ctx.xMult = multiplyScore(ctx.xMult, factor);
}

/** Scoring pipeline iterator — uses scoring walk preset (NONE stubs, resolution logs). */
export function forEachEquipmentScoring(
  equipment: EquipmentInstance[],
  fn: (equip: EquipmentInstance, original: EquipmentInstance, index: number) => void,
  overrides: ResolveEquipmentSlotOptions = {},
): void {
  walkEquipmentScoring(equipment, ({ equip, original, index }) => fn(equip, original, index), overrides);
}

/** Fire/arcane on one bar slot (original card, not copy target). Called right after that slot's additive pass. */
export function applyEquipmentAuraForSlot(
  equipment: EquipmentInstance[],
  slotIndex: number,
  ctx: ScoringPipelineContext,
): void {
  if (isEquipmentDisabledByBoss(slotIndex)) return;
  const originalEquip = equipment[slotIndex];
  if (!originalEquip.def.aura) return;

  switch (originalEquip.def.aura.id) {
    case 'fire':
      ctx.bonusMult = addScore(ctx.bonusMult, 10);
      ctx.animEvents.push({ target: { kind: 'equip', equipIndex: slotIndex }, popupType: 'mult', value: 10 });
      console.log(`  [equip] ${originalEquip.def.name} FIRE aura: +10 mult (bonusMult: ${ctx.bonusMult})`);
      break;
    case 'arcane':
      ctx.bonusMiles = addScore(ctx.bonusMiles, 50);
      ctx.animEvents.push({ target: { kind: 'equip', equipIndex: slotIndex }, popupType: 'miles', value: 50 });
      console.log(`  [equip] ${originalEquip.def.name} ARCANE aura: +50 miles (bonusMiles: ${ctx.bonusMiles})`);
      break;
  }
}

/** Apply fire/arcane for every slot (bar order). Prefer per-slot calls from the additive loop. */
export function applyEquipmentAuras(equipment: EquipmentInstance[], ctx: ScoringPipelineContext): void {
  for (let i = 0; i < equipment.length; i++) {
    applyEquipmentAuraForSlot(equipment, i, ctx);
  }
}

/** Holy aura xMult on one bar slot (original card). Called after that slot's additive + fire/arcane. */
export function applyHolyAuraForSlot(
  equipment: EquipmentInstance[],
  slotIndex: number,
  finalMult: Decimal,
  ctx: ScoringPipelineContext,
): Decimal {
  if (isEquipmentDisabledByBoss(slotIndex)) return finalMult;
  const originalEquip = equipment[slotIndex];
  if (originalEquip.def.aura?.id !== 'holy') return finalMult;

  const updated = multiplyScore(finalMult, 1.5);
  ctx.animEvents.push({ target: { kind: 'equip', equipIndex: slotIndex }, popupType: 'xmult', value: 1.5 });
  console.log(`  [equip] ${originalEquip.def.name} HOLY aura: x1.5 mult (finalMult: ${updated})`);
  return updated;
}

/** Apply holy aura xMult multipliers after additive bonuses. */
export function applyHolyAuraXMult(
  baseMult: DecimalSource,
  equipment: EquipmentInstance[],
  ctx: ScoringPipelineContext,
): Decimal {
  let finalMult = D(baseMult);
  for (let i = 0; i < equipment.length; i++) {
    finalMult = applyHolyAuraForSlot(equipment, i, finalMult, ctx);
  }
  return finalMult;
}

/** Get config modifications from equipment (hand size, rerolls). */
export function getConfigModifiers(equipment: EquipmentInstance[]): {
  rerollsBonus: number;
  rollSizeBonus: number;
  freeShopRerolls: number;
  daysPenalty: number;
} {
  let rerollsBonus = 0;
  let rollSizeBonus = 0;
  let freeShopRerolls = 0;
  let daysPenalty = 0;

  for (let i = 0; i < equipment.length; i++) {
    if (isEquipmentDisabledByBoss(i)) continue;
    const equip = equipment[i];
    const { effectType, effectParams } = equip.def;
    const p = effectParams as Record<string, unknown>;

    if (effectType === 'MODIFY_REROLLS') {
      rerollsBonus += p.value as number;
    }
    if (effectType === 'FREE_SHOP_REROLL') {
      freeShopRerolls += p.value as number;
    }
    if (effectType === 'TRAIL_BACKPACK') {
      rerollsBonus += p.rerollsBonus as number;
      rollSizeBonus -= p.rollSizePenalty as number;
    }
    if (effectType === 'EXPRESS_TRAIN') {
      rerollsBonus -= p.rerollsPenalty as number;
    }
    if (effectType === 'PACK_SADDLE') {
      rollSizeBonus += p.value as number;
    }
    if (effectType === 'COFFEE') {
      rollSizeBonus += p.handSizeBonus as number;
      daysPenalty += p.daysPenalty as number;
    }
    if (effectType === 'FLOUR_SACK') {
      rollSizeBonus += getFlourSackHandSizeBonus(equip, getRunState().professionId);
    }
  }

  return { rerollsBonus, rollSizeBonus, freeShopRerolls, daysPenalty };
}

/** Bonus pack picks from equipment (e.g. Rustler). */
export function getBonusPackPicks(equipment: EquipmentInstance[]): number {
  let bonus = 0;
  for (let i = 0; i < equipment.length; i++) {
    if (isEquipmentDisabledByBoss(i)) continue;
    const { effectType, effectParams } = equipment[i].def;
    if (effectType === 'EXTRA_PACK_PICK') {
      bonus += ((effectParams as Record<string, unknown>).value as number) ?? 1;
    }
  }
  return bonus;
}

/** Check if any equipment prevents death. Returns the index of the first one found, or -1. */
export function findDeathPrevention(
  equipment: EquipmentInstance[],
  totalMiles: DecimalSource,
  targetMiles: DecimalSource,
): number {
  for (let i = 0; i < equipment.length; i++) {
    if (equipment[i].def.effectType === 'PREVENT_DEATH') {
      const threshold = (equipment[i].def.effectParams.threshold as number) ?? 0.25;
      if (gte(totalMiles, multiplyScore(targetMiles, threshold))) {
        return i;
      }
    }
  }
  return -1;
}

/** Whether Stacked Deck is equipped (loaded dice count as all pip values for equipment). */
export function hasStackedDeck(equipment: EquipmentInstance[]): boolean {
  return equipment.some((e) => e.def.effectType === 'STACKED_DECK');
}

/** True if die matches a pip for equipment effects (Stacked Deck: loaded = all pips). */
/** Leftmost held die with the lowest rank, excluding stone dice (value 0). */
export function findLowestHeldDieTarget(heldDice: Die[]): Die | undefined {
  const ranked = heldDice.filter((d) => d.enhancement !== 'stone');
  if (ranked.length === 0) return undefined;
  const lowestValue = Math.min(...ranked.map((d) => d.value));
  return heldDice.find((d) => d.enhancement !== 'stone' && d.value === lowestValue);
}

export function isLowestHeldDieTarget(die: Die, heldDice: Die[]): boolean {
  const target = findLowestHeldDieTarget(heldDice);
  return target !== undefined && die === target;
}

export function dieMatchesPip(die: Die, pip: number, equipment: EquipmentInstance[], stackedDeck?: boolean): boolean {
  if (die.value === pip) return true;
  if ((stackedDeck ?? hasStackedDeck(equipment)) && die.enhancement === 'loaded') return true;
  return false;
}

export function getEffectPips(params: Record<string, unknown>): number[] {
  if (Array.isArray(params.pips)) return params.pips as number[];
  if (typeof params.pip === 'number') return [params.pip];
  return [];
}

export function dieMatchesAnyPip(
  die: Die,
  pips: number[],
  equipment: EquipmentInstance[],
  stackedDeck?: boolean,
): boolean {
  return pips.some((pip) => dieMatchesPip(die, pip, equipment, stackedDeck));
}

export function collectPipRetriggerSources(
  die: Die,
  equipment: EquipmentInstance[],
  stackedDeck?: boolean,
): { equipIndex: number }[] {
  const resolvedStacked = stackedDeck ?? hasStackedDeck(equipment);
  const sources: { equipIndex: number }[] = [];
  walkEquipmentPerSlot(equipment, ({ equip, index }) => {
    if (equip.def.effectType !== 'PIP_RETRIGGER') return;
    const pips = getEffectPips(equip.def.effectParams as Record<string, unknown>);
    if (dieMatchesAnyPip(die, pips, equipment, resolvedStacked)) {
      sources.push({ equipIndex: index });
    }
  });
  return sources;
}

/** True if die matches even/odd parity (Stacked Deck: loaded = all pips, so both parities). */
export function dieMatchesParity(
  die: Die,
  parity: 'even' | 'odd',
  equipment: EquipmentInstance[],
  stackedDeck?: boolean,
): boolean {
  const isEven = die.value % 2 === 0;
  const matches = parity === 'even' ? isEven : !isEven;
  if (matches) return true;
  if ((stackedDeck ?? hasStackedDeck(equipment)) && die.enhancement === 'loaded') return true;
  return false;
}

/**
 * Split Trail parity: scored hand has both even and odd values.
 * Unlike dieMatchesParity, a single loaded die cannot satisfy both sides at once —
 * non-loaded face parity is resolved first, then each loaded die fills one missing side.
 */
export function scoredHandHasBothParities(
  scoringDice: Die[],
  equipment: EquipmentInstance[],
  stackedDeck?: boolean,
): boolean {
  const resolvedStacked = stackedDeck ?? hasStackedDeck(equipment);
  if (!resolvedStacked) {
    return scoringDice.some((d) => d.value % 2 === 0) && scoringDice.some((d) => d.value % 2 === 1);
  }

  const nonLoaded = scoringDice.filter((d) => d.enhancement !== 'loaded');
  let hasEven = nonLoaded.some((d) => d.value % 2 === 0);
  let hasOdd = nonLoaded.some((d) => d.value % 2 === 1);
  if (hasEven && hasOdd) return true;

  for (const die of scoringDice) {
    if (die.enhancement !== 'loaded') continue;
    if (!hasEven) {
      hasEven = true;
    } else if (!hasOdd) {
      hasOdd = true;
    }
    if (hasEven && hasOdd) return true;
  }
  return false;
}

/** Boss effects are negated by Saint Elmo's Shield or selling Sheriff's Badge this round. */
export function isBossEffectNegated(): boolean {
  const state = getRunState();
  if (resolveEquipmentList(state).some((e) => e.def.id === 'saint_elmos_shield')) return true;
  return state.bossEffectDisabled;
}

export function handTypeMatches(played: HandType, required: string): boolean {
  return handTypeContains(played, required as HandType);
}

export { resolveEffectParam, resolveChance } from '../effectParams';
