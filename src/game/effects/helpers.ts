// ─── Shared Utility Functions ───

import { EquipmentInstance } from '../ItemsSystem';
import { resolveCopyTarget } from '../equipmentUtils';
import { Die, HandType } from '../types';
import type { ScoringPipelineContext } from './types';
import { addScore, D, gte, multiplyScore, type Decimal, type DecimalSource } from '../scoreMath';
import { getRunState } from '../store/runStore';
import { resolveEquipmentList } from '../store/resolve';
import { isEquipmentDisabledByBoss } from '../BossEffectsSystem';

export type UnresolvedCopyBehavior = 'none' | 'skip';

/** Multiply pipeline xMult and round to avoid float drift. */
export function multiplyCtxXMult(ctx: { xMult: Decimal }, factor: number): void {
  ctx.xMult = multiplyScore(ctx.xMult, factor);
}

export function forEachEquipmentResolved(
  equipment: EquipmentInstance[],
  fn: (equip: EquipmentInstance, original: EquipmentInstance, index: number) => void,
  unresolvedCopy: UnresolvedCopyBehavior = 'none',
): void {
  const maxCopyDepth = equipment.length;
  for (let i = 0; i < equipment.length; i++) {
    if (isEquipmentDisabledByBoss(i)) continue;
    const original = equipment[i];
    let equip = original;

    if (equip.def.effectType === 'COPY_RIGHT' || equip.def.effectType === 'COPY_LEFTMOST') {
      const resolved = resolveCopyTarget(equipment, i, maxCopyDepth);
      if (!resolved) {
        console.log(`  [equip] ${equip.def.name}: nothing to copy`);
        if (unresolvedCopy === 'skip') continue;
        equip = { ...original, def: { ...original.def, effectType: 'NONE' } } as EquipmentInstance;
      } else {
        console.log(`  [equip] ${equip.def.name}: copying ${resolved.def.name}`);
        equip = resolved;
      }
    }

    fn(equip, original, i);
  }
}

/** Apply fire/icy equipment auras (always from the original slot, not copy target). */
export function applyEquipmentAuras(equipment: EquipmentInstance[], ctx: ScoringPipelineContext): void {
  for (let i = 0; i < equipment.length; i++) {
    if (isEquipmentDisabledByBoss(i)) continue;
    const originalEquip = equipment[i];
    if (!originalEquip.def.aura) continue;

    switch (originalEquip.def.aura.id) {
      case 'fire':
        ctx.bonusMult = addScore(ctx.bonusMult, 10);
        ctx.animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'mult', value: 10 });
        console.log(`  [equip] ${originalEquip.def.name} FIRE aura: +10 mult (bonusMult: ${ctx.bonusMult})`);
        break;
      case 'icy':
        ctx.bonusMiles = addScore(ctx.bonusMiles, 50);
        ctx.animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'miles', value: 50 });
        console.log(`  [equip] ${originalEquip.def.name} ICY aura: +50 miles (bonusMiles: ${ctx.bonusMiles})`);
        break;
    }
  }
}

/** Apply holy aura xMult multipliers after additive bonuses. */
export function applyHolyAuraXMult(
  baseMult: DecimalSource,
  equipment: EquipmentInstance[],
  ctx: ScoringPipelineContext,
): Decimal {
  let finalMult = D(baseMult);
  for (let i = 0; i < equipment.length; i++) {
    if (isEquipmentDisabledByBoss(i)) continue;
    const equip = equipment[i];
    if (equip.def.aura?.id === 'holy') {
      finalMult = multiplyScore(finalMult, 1.5);
      ctx.animEvents.push({ target: { kind: 'equip', equipIndex: i }, popupType: 'xmult', value: 1.5 });
      console.log(`  [equip] ${equip.def.name} HOLY aura: x1.5 mult (finalMult: ${finalMult})`);
    }
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
      rollSizeBonus += equip.state.handSizeBonus ?? 0;
    }
  }

  return { rerollsBonus, rollSizeBonus, freeShopRerolls, daysPenalty };
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
export function dieMatchesPip(die: Die, pip: number, equipment: EquipmentInstance[], stackedDeck?: boolean): boolean {
  if (die.value === pip) return true;
  if ((stackedDeck ?? hasStackedDeck(equipment)) && die.enhancement === 'loaded') return true;
  return false;
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

/** Boss effects are negated by Saint Elmo's Shield or selling Sheriff's Badge this round. */
export function isBossEffectNegated(): boolean {
  const state = getRunState();
  if (resolveEquipmentList(state).some((e) => e.def.id === 'saint_elmos_shield')) return true;
  return state.bossEffectDisabled;
}

export function handTypeMatches(played: HandType, required: string): boolean {
  if (played === required) return true;

  if (played === HandType.FULL_HOUSE) {
    if (required === HandType.PAIR || required === HandType.THREE_OF_A_KIND || required === HandType.TWO_PAIR)
      return true;
  }
  if (played === HandType.TWO_PAIR && required === HandType.PAIR) return true;
  if (played === HandType.THREE_OF_A_KIND && required === HandType.PAIR) return true;
  if (played === HandType.FOUR_OF_A_KIND) {
    if (required === HandType.THREE_OF_A_KIND || required === HandType.PAIR) return true;
  }
  if (played === HandType.FIVE_OF_A_KIND) {
    if (
      required === HandType.FOUR_OF_A_KIND ||
      required === HandType.THREE_OF_A_KIND ||
      required === HandType.PAIR ||
      required === HandType.TWO_PAIR ||
      required === HandType.FULL_HOUSE
    )
      return true;
  }
  if (played === HandType.FIVE_STRAIGHT) {
    if (required === HandType.FOUR_STRAIGHT) return true;
  }

  return false;
}

export { resolveEffectParam, resolveChance } from '../effectParams';
