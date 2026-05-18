// ─── Dice System (No Phaser imports) ───
// Handles dice creation, rolling, pouch management, hand detection, and scoring.

import { Die, HandType, HandResult, HandDefinition, ScoreResult, ScoreAnimEvent } from './types';
import handsData from '../data/hands.json';
import { getPlayerState } from './PlayerState';
import type { EquipmentInstance } from './ItemsSystem';
import { getScoredRetriggerCount, processEquipmentOnLuckyTrigger, processEquipmentOnDiamondDestroyed } from './EquipmentEffects';
import { getRandomSupplyDef, createConsumableInstance, getRandomFrontierDef } from './ConsumablesSystem';
import { resolveCopyTarget, checkLoadedChance } from './Constants';

const HAND_TABLE: HandDefinition[] = handsData as HandDefinition[];

let nextDieId = 0;

// ─── Dice Creation ───

export function createDie(overrides?: Partial<Die>): Die {
  const die: Die = {
    id: `die_${nextDieId++}`,
    value: Math.ceil(Math.random() * 12),
    enhancement: null,
    sticker: null,
    aura: null,
    isGrimy: false,
    bonusMiles: 0,
    ...overrides,
  };
  if (die.enhancement === 'stone') die.value = 0;
  return die;
}

export function createPouch(count: number): Die[] {
  return Array.from({ length: count }, () => createDie());
}

// ─── Rolling ───

export function rollDie(die: Die): Die {
  // Stone dice never get a numeric value
  if (die.enhancement === 'stone') return { ...die, value: 0 };
  return { ...die, value: Math.ceil(Math.random() * 12) };
}

export function rollDice(dice: Die[]): Die[] {
  return dice.map(rollDie);
}

// ─── Pouch Management ───

export function drawFromPouch(pouch: Die[], count: number): { drawn: Die[]; remaining: Die[] } {
  const shuffled = [...pouch].sort(() => Math.random() - 0.5);
  return {
    drawn: shuffled.slice(0, count),
    remaining: shuffled.slice(count),
  };
}

export function returnToPouch(pouch: Die[], dice: Die[]): Die[] {
  return [...pouch, ...dice];
}

// ─── Hand Detection ───

function getFrequencies(dice: Die[]): Map<number, number> {
  const freq = new Map<number, number>();
  for (const d of dice) {
    freq.set(d.value, (freq.get(d.value) || 0) + 1);
  }
  return freq;
}

function findLongestStraight(dice: Die[]): number[] {
  const unique = [...new Set(dice.map((d) => d.value))].sort((a, b) => a - b);
  let best: number[] = [];
  let current: number[] = [unique[0]];

  for (let i = 1; i < unique.length; i++) {
    if (unique[i] === unique[i - 1] + 1) {
      current.push(unique[i]);
    } else {
      if (current.length > best.length) best = current;
      current = [unique[i]];
    }
  }
  if (current.length > best.length) best = current;
  return best;
}

export function getHandDef(type: HandType): HandDefinition {
  return HAND_TABLE.find((h) => h.type === type)!;
}

function buildResult(type: HandType, scoringDice: Die[]): HandResult {
  const def = getHandDef(type);
  return { type, name: def.name, baseMiles: def.baseMiles, baseMult: def.baseMult, rank: def.rank, scoringDice };
}

/**
 * Detect the best hand from 1-5 dice.
 * Stone dice are excluded from hand pattern detection but always scored.
 */
export function detectBestHand(dice: Die[]): HandResult {
  // Separate stone dice — they don't participate in hand detection
  const stoneDice = dice.filter((d) => d.enhancement === 'stone');
  const normalDice = dice.filter((d) => d.enhancement !== 'stone');

  if (normalDice.length === 0) {
    // Only stone dice — no hand pattern, just score them all
    return buildResult(HandType.HIGH_VALUE, [...stoneDice]);
  }

  const result = detectBestHandFromDice(normalDice);
  // Append stone dice to scoring — they're always scored
  if (stoneDice.length > 0) {
    result.scoringDice = [...result.scoringDice, ...stoneDice];
  }
  return result;
}

/**
 * Internal: detect best hand from non-stone dice only.
 */
function detectBestHandFromDice(dice: Die[]): HandResult {
  if (dice.length === 0) {
    return buildResult(HandType.HIGH_VALUE, []);
  }

  const freq = getFrequencies(dice);
  const counts = [...freq.values()].sort((a, b) => b - a);
  const straight = findLongestStraight(dice);

  // Five of a kind
  if (counts[0] >= 5) {
    return buildResult(HandType.FIVE_OF_A_KIND, dice.slice(0, 5));
  }

  // Five straight
  if (straight.length >= 5) {
    const straightSet = new Set(straight.slice(0, 5));
    const scoringDice = dice.filter((d) => straightSet.has(d.value));
    // Take only one die per value
    const used = new Set<number>();
    const uniqueDice = scoringDice.filter((d) => {
      if (used.has(d.value)) return false;
      used.add(d.value);
      return true;
    });
    return buildResult(HandType.FIVE_STRAIGHT, uniqueDice.slice(0, 5));
  }

  // Four of a kind
  if (counts[0] >= 4) {
    const pip = [...freq.entries()].find(([, c]) => c >= 4)![0];
    const scoring = dice.filter((d) => d.value === pip).slice(0, 4);
    return buildResult(HandType.FOUR_OF_A_KIND, scoring);
  }

  // Full house (3 + 2)
  if (counts[0] >= 3 && counts[1] >= 2) {
    const threePip = [...freq.entries()].find(([, c]) => c >= 3)![0];
    const twoPip = [...freq.entries()].find(([p, c]) => c >= 2 && p !== threePip)![0];
    const pairPips = new Set([threePip, twoPip]);
    const scoring: Die[] = [];
    const used = new Map<number, number>(); // pip → count used
    for (const d of dice) {
      if (!pairPips.has(d.value)) continue;
      const limit = d.value === threePip ? 3 : 2;
      const count = used.get(d.value) ?? 0;
      if (count < limit) {
        scoring.push(d);
        used.set(d.value, count + 1);
      }
    }
    return buildResult(HandType.FULL_HOUSE, scoring);
  }

  // Four straight
  if (straight.length >= 4) {
    const straightSet = new Set(straight.slice(0, 4));
    const used = new Set<number>();
    const scoringDice = dice.filter((d) => {
      if (!straightSet.has(d.value) || used.has(d.value)) return false;
      used.add(d.value);
      return true;
    });
    return buildResult(HandType.FOUR_STRAIGHT, scoringDice.slice(0, 4));
  }

  // Three of a kind
  if (counts[0] >= 3) {
    const pip = [...freq.entries()].find(([, c]) => c >= 3)![0];
    return buildResult(HandType.THREE_OF_A_KIND, dice.filter((d) => d.value === pip).slice(0, 3));
  }

  // Two pair
  if (counts[0] >= 2 && counts[1] >= 2) {
    const pairs = [...freq.entries()].filter(([, c]) => c >= 2).map(([p]) => p);
    const pairPips = new Set(pairs);
    const scoring: Die[] = [];
    const used = new Map<number, number>(); // pip → count used
    for (const d of dice) {
      if (!pairPips.has(d.value)) continue;
      const count = used.get(d.value) ?? 0;
      if (count < 2) {
        scoring.push(d);
        used.set(d.value, count + 1);
      }
    }
    return buildResult(HandType.TWO_PAIR, scoring);
  }

  // Pair
  if (counts[0] >= 2) {
    const pip = [...freq.entries()].find(([, c]) => c >= 2)![0];
    return buildResult(HandType.PAIR, dice.filter((d) => d.value === pip).slice(0, 2));
  }

  // High value — best single die
  const best = [...dice].sort((a, b) => b.value - a.value);
  return buildResult(HandType.HIGH_VALUE, [best[0]]);
}

// ─── Scoring ───

/**
 * Calculate score for a played hand.
 * miles = (handBaseMiles + sum of scoring dice values) × handBaseMult
 */
export function scoreHand(handResult: HandResult, equipment: EquipmentInstance[], scoreContext?: { currentDay: number; maxDays: number }): ScoreResult {
  let totalValue = 0;
  let bonusMult = 0;
  let xMult = 1;
  const player = getPlayerState();
  const animEvents: ScoreAnimEvent[] = [];

  console.log('  [scoreHand] Step 3: Per-die scoring');
  // Step 3: Per-die scoring (left to right)
  // Calculate global retrigger count (War Drums, Last Stand) once
  const globalRetriggerCount = getScoredRetriggerCount(equipment, scoreContext);
  const firstDieId = handResult.scoringDice.length > 0 ? handResult.scoringDice[0].id : null;
  const lastDieId = handResult.scoringDice.length > 0 ? handResult.scoringDice[handResult.scoringDice.length - 1].id : null;
  for (const die of handResult.scoringDice) {
    // Calculate how many times this die triggers:
    // red_bullet sticker: trigger this die twice
    let triggers = die.sticker === 'red_bullet' ? 2 : 1;
    // PIP_RETRIGGER: One-Eyed Jack — extra trigger for matching pip
    const maxCopyDepth = equipment.length;
    for (let ei = 0; ei < equipment.length; ei++) {
      let equip = equipment[ei];
      // Resolve copy items
      if (equip.def.effectType === 'COPY_RIGHT' || equip.def.effectType === 'COPY_LEFTMOST') {
        const resolved = resolveCopyTarget(equipment, ei, maxCopyDepth);
        if (!resolved) continue;
        equip = resolved;
      }
      if (equip.def.effectType === 'PIP_RETRIGGER' && die.value === (equip.def.effectParams.pip as number)) {
        triggers++;
      }
      // FIRST_DICE_RETRIGGER: Quick Draw — retrigger first die N additional times
      if (equip.def.effectType === 'FIRST_DICE_RETRIGGER' && die.id === firstDieId) {
        triggers += equip.def.effectParams.value as number;
      }
      // LAST_DICE_RETRIGGER: Last Laugh — retrigger last die N additional times
      if (equip.def.effectType === 'LAST_DICE_RETRIGGER' && die.id === lastDieId) {
        triggers += equip.def.effectParams.value as number;
      }
      // ENHANCED_RETRIGGER: Moonshine — retrigger enhanced dice
      if (equip.def.effectType === 'ENHANCED_RETRIGGER' && die.enhancement !== null) {
        triggers++;
      }
    }
    // War Drums / Last Stand: retrigger all scored dice
    triggers += globalRetriggerCount;
    for (let t = 0; t < triggers; t++) {
      const triggerLabel = t > 0 ? ' (retrigger)' : '';

      // Base effect — value as miles (stone dice have 0 value but add 50 miles)
      const dieMiles = die.enhancement === 'stone' ? 50 : die.value;
      totalValue += dieMiles;
      animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'miles', value: dieMiles, dieId: die.id });
      console.log(`  [scoreHand]   Die ${die.id}${triggerLabel}: +${dieMiles} ${die.enhancement === 'stone' ? 'miles (STONE)' : 'value'} (total: ${totalValue})`);

      // Permanent bonus miles (e.g. from Cowboy Boots)
      if (die.bonusMiles > 0) {
        totalValue += die.bonusMiles;
        animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'miles', value: die.bonusMiles, dieId: die.id });
        console.log(`  [scoreHand]   Die ${die.id}${triggerLabel}: +${die.bonusMiles} bonus miles (total: ${totalValue})`);
      }
      // Dice enhancement effects
      switch (die.enhancement) {
        case 'bone':
          bonusMult += 4;
          animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'mult', value: 4, dieId: die.id });
          console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} BONE: +4 mult (bonusMult: ${bonusMult})`);
          break;
        case 'wooden':
          totalValue += 10;
          animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'miles', value: 10, dieId: die.id });
          console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} WOODEN: +10 miles (totalValue: ${totalValue})`);
          break;
        case 'diamond':
          xMult *= 2;
          animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'xmult', value: 2, dieId: die.id });
          console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} DIAMOND: x2 mult (xMult: ${xMult})`);
          break;
        case 'lucky': {
          if (checkLoadedChance([1, 5], equipment)) {
            bonusMult += 20;
            animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'mult', value: 20, dieId: die.id });
            console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} LUCKY: hit +20 mult! (bonusMult: ${bonusMult})`);
            processEquipmentOnLuckyTrigger(equipment);
          }
          if (checkLoadedChance([1, 15], equipment)) {
            player.economy.earn(20);
            animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'money', value: 20, dieId: die.id });
            console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} LUCKY: hit $20!`);
            processEquipmentOnLuckyTrigger(equipment);
          }
          break;
        }
      
      }

      // Dice aura effects
      switch (die.aura) {
        case 'fire':
          bonusMult += 10;
          animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'mult', value: 10, dieId: die.id });
          console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} FIRE aura: +10 mult (bonusMult: ${bonusMult})`);
          break;
        case 'icy':
          totalValue += 50;
          animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'miles', value: 50, dieId: die.id });
          console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} ICY aura: +50 miles (totalValue: ${totalValue})`);
          break;
        case 'holy':
          xMult *= 1.5;
          animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'xmult', value: 1.5, dieId: die.id });
          console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} HOLY aura: x1.5 (xMult: ${xMult})`);
          break;
      }

      // Sticker effects (scored dice)
      if (die.sticker === 'purple_flower') {
        const supplyDef = getRandomSupplyDef();
        player.consumables.push(createConsumableInstance(supplyDef));
        animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'supply', value: 0, dieId: die.id });
        console.log(
          `  [scoreHand]   Die ${die.id}${triggerLabel} STICKER purple_flower: granted supply card '${supplyDef.name}'`,
        );
      }

      if (die.sticker === 'golden_dollar') {
        player.economy.earn(3);
        animEvents.push({ target: { kind: 'die', dieId: die.id }, popupType: 'money', value: 3, dieId: die.id });
        console.log(
          `  [scoreHand]   Die ${die.id}${triggerLabel} STICKER golden_dollar: +$3`,
        );
      }

      // 'On scored' equipment — items that trigger per matching die (left to right)
      for (let eIdx = 0; eIdx < equipment.length; eIdx++) {
        const equip = equipment[eIdx];
        const { effectType, effectParams } = equip.def;
        const p = effectParams as Record<string, unknown>;

        switch (effectType) {
          case 'PIP_MULT':
            if (die.value === (p.pip as number)) {
              bonusMult += p.value as number;
              animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: eIdx }, popupType: 'mult', value: p.value as number, dieId: die.id });
              console.log(
                `  [scoreHand]   Die ${die.id}${triggerLabel} → ${equip.def.name}: +${p.value} mult (bonusMult: ${bonusMult})`,
              );
            }
            break;
          case 'PIP_MILES':
            if (die.value === (p.pip as number)) {
              totalValue += p.value as number;
              animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: eIdx }, popupType: 'miles', value: p.value as number, dieId: die.id });
              console.log(
                `  [scoreHand]   Die ${die.id}${triggerLabel} → ${equip.def.name}: +${p.value} miles (totalValue: ${totalValue})`,
              );
            }
            break;
          case 'PARITY_MULT':
            if (matchesParity(die.value, p.parity as string)) {
              bonusMult += p.value as number;
              animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: eIdx }, popupType: 'mult', value: p.value as number, dieId: die.id });
              console.log(
                `  [scoreHand]   Die ${die.id}${triggerLabel} → ${equip.def.name}: +${p.value} mult (bonusMult: ${bonusMult})`,
              );
            }
            break;
          case 'PARITY_MILES':
            if (matchesParity(die.value, p.parity as string)) {
              totalValue += p.value as number;
              animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: eIdx }, popupType: 'miles', value: p.value as number, dieId: die.id });
              console.log(
                `  [scoreHand]   Die ${die.id}${triggerLabel} → ${equip.def.name}: +${p.value} miles (totalValue: ${totalValue})`,
              );
            }
            break;
          case 'GOLD_DICE_MONEY':
            if (die.enhancement === 'gold') {
              player.economy.earn(p.value as number);
              animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: eIdx }, popupType: 'money', value: p.value as number, dieId: die.id });
              console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} → ${equip.def.name}: +$${p.value}`);
            }
            break;
          case 'LUCKY_NUMBER_PIP_XMULT':
            if (die.value === (equip.state.pip ?? 0)) {
              xMult *= p.value as number;
              animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: eIdx }, popupType: 'xmult', value: p.value as number, dieId: die.id });
              console.log(
                `  [scoreHand]   Die ${die.id}${triggerLabel} → ${equip.def.name}: x${p.value} (lucky number ${equip.state.pip})`,
              );
            }
            break;
          case 'PIP_SUPPLY_CHANCE': {
            if (die.value === (p.pip as number)) {
              if (checkLoadedChance(p.chance as [number, number], equipment)) {
                const supplyDef = getRandomSupplyDef();
                player.consumables.push(createConsumableInstance(supplyDef));
                animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: eIdx }, popupType: 'supply', value: 0, dieId: die.id });
                console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} → ${equip.def.name}: granted supply card '${supplyDef.name}'`);
              }
            }
            break;
          }
          case 'ENHANCED_SCORE_MONEY': {
            if (die.enhancement !== null) {
              if (checkLoadedChance(p.chance as [number, number], equipment)) {
                player.economy.earn(p.value as number);
                animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: eIdx }, popupType: 'money', value: p.value as number, dieId: die.id });
                console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} → ${equip.def.name}: +$${p.value}`);
              }
            }
            break;
          }
          case 'PERMANENT_DIE_MILES_GAIN': {
            // Cowboy Boots: permanently add miles to this die (only on first trigger)
            if (t === 0) {
              die.bonusMiles = (die.bonusMiles ?? 0) + (p.value as number);
              console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} → ${equip.def.name}: permanently +${p.value} miles (now ${die.bonusMiles})`);
            }
            break;
          }
          case 'LUCKY_DICE_MONEY': {
            // Lucky Penny: lucky dice earn money when scored
            if (die.enhancement === 'lucky') {
              player.economy.earn(p.value as number);
              animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: eIdx }, popupType: 'money', value: p.value as number, dieId: die.id });
              console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} → ${equip.def.name}: +$${p.value}`);
            }
            break;
          }
          case 'BONE_DICE_XMULT_CHANCE': {
            // Bone Charm: bone dice have chance to give xMult
            if (die.enhancement === 'bone') {
              if (checkLoadedChance(p.chance as [number, number], equipment)) {
                xMult *= p.value as number;
                animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: eIdx }, popupType: 'xmult', value: p.value as number, dieId: die.id });
                console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} → ${equip.def.name}: x${p.value}`);
              }
            }
            break;
          }
          case 'WOODEN_DICE_MILES': {
            // Wood Axe: wooden dice give bonus miles
            if (die.enhancement === 'wooden') {
              totalValue += p.value as number;
              animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: eIdx }, popupType: 'miles', value: p.value as number, dieId: die.id });
              console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} → ${equip.def.name}: +${p.value} miles (totalValue: ${totalValue})`);
            }
            break;
          }
          case 'IRON_DICE_MULT': {
            // Iron Spurs: steel dice give bonus mult
            if (die.enhancement === 'steel') {
              bonusMult += p.value as number;
              animEvents.push({ target: { kind: 'both', dieId: die.id, equipIndex: eIdx }, popupType: 'mult', value: p.value as number, dieId: die.id });
              console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} → ${equip.def.name}: +${p.value} mult (bonusMult: ${bonusMult})`);
            }
            break;
          }
          case 'ENHANCEMENT_SCORED_MILES': {
            // Covered Wagon: gains permanent miles per matching enhancement scored (only first trigger)
            if (t === 0 && die.enhancement === (p.enhancement as string)) {
              equip.state.miles = (equip.state.miles ?? 0) + (p.value as number);
              console.log(`  [scoreHand]   Die ${die.id}${triggerLabel} → ${equip.def.name}: gained +${p.value} miles (now ${equip.state.miles})`);
            }
            break;
          }
        }
      }
    } // end retrigger loop
  }

  // SOLO_FIRST_DAY_ENHANCE: Lucky Find — if 1 die scored alone on day 1, enhance it
  if (scoreContext && scoreContext.currentDay === 1 && handResult.scoringDice.length === 1) {
    const maxCopyDepthSolo = equipment.length;
    for (let ei = 0; ei < equipment.length; ei++) {
      let equip = equipment[ei];
      // Resolve copy items
      if (equip.def.effectType === 'COPY_RIGHT' || equip.def.effectType === 'COPY_LEFTMOST') {
        const resolved = resolveCopyTarget(equipment, ei, maxCopyDepthSolo);
        if (!resolved) continue;
        equip = resolved;
      }
      if (equip.def.effectType === 'SOLO_FIRST_DAY_ENHANCE') {
        const target = handResult.scoringDice[0];
        if (target.enhancement === null) {
          const enhancements: Die['enhancement'][] = ['bone', 'lucky', 'wooden', 'steel', 'gold', 'loaded', 'diamond'];
          target.enhancement = enhancements[Math.floor(Math.random() * enhancements.length)];
          console.log(`  [scoreHand] ${equip.def.name}: enhanced die ${target.id} → ${target.enhancement}`);
        }
      }
      if (equip.def.effectType === 'FIRST_DAY_SOLO_COPY') {
        // Bloodline: copy the solo die into the collection
        const target = handResult.scoringDice[0];
        const copy = createDie({
          value: target.value,
          enhancement: target.enhancement,
          sticker: target.sticker,
          aura: target.aura,
          bonusMiles: target.bonusMiles,
        });
        player.dice.push(copy);
        console.log(`  [scoreHand] ${equip.def.name}: copied die ${target.id} → ${copy.id}`);
      }
    }
  }

  // FIRST_HAND_ENHANCED_SIX: Hellfire Round — destroy enhanced 6 on first hand, gain frontier card
  if (scoreContext && scoreContext.currentDay === 1) {
    for (let eIdx = 0; eIdx < equipment.length; eIdx++) {
      const equip = equipment[eIdx];
      if (equip.def.effectType === 'FIRST_HAND_ENHANCED_SIX') {
        const target = handResult.scoringDice.find((d) => d.value === 6 && d.enhancement !== null);
        if (target) {
          // Mark die for destruction by removing from player's collection
          const idx = player.dice.findIndex((d) => d.id === target.id);
          if (idx >= 0) {
            player.dice.splice(idx, 1);
            console.log(`  [scoreHand] ${equip.def.name}: destroyed enhanced 6 (${target.id}), granting frontier card`);
            // Grant frontier encounter card
            const frontierDef = getRandomFrontierDef();
            if (frontierDef) {
              player.consumables.push(createConsumableInstance(frontierDef));
              animEvents.push({ target: { kind: 'equip', equipIndex: eIdx }, popupType: 'supply', value: 0 });
            }
          }
        }
      }
    }
  }

  // ENHANCED_RETRIGGER: Moonshine — enhanced dice have chance of being destroyed after scoring
  for (const equip of equipment) {
    if (equip.def.effectType !== 'ENHANCED_RETRIGGER') continue;

    const p = equip.def.effectParams as Record<string, unknown>;

    for (const scoredDie of handResult.scoringDice) {
      if (scoredDie.enhancement === null) continue;

      const chanceTuple = scoredDie.enhancement === 'diamond'
        ? p.diamondDestroyChance as [number, number]
        : p.destroyChance as [number, number];
      if (!checkLoadedChance(chanceTuple, equipment)) continue;

      const idx = player.dice.findIndex((d) => d.id === scoredDie.id);
      if (idx < 0) continue;

      const wasDiamond = player.dice[idx].enhancement === 'diamond';
      player.dice.splice(idx, 1);
      console.log(`  [scoreHand] ${equip.def.name}: destroyed enhanced die ${scoredDie.id} (${scoredDie.enhancement})`);

      // Diamond Coffin: track diamond destruction
      if (wasDiamond) {
        processEquipmentOnDiamondDestroyed(equipment);
      }
    }
  }

  const mult = (handResult.baseMult + bonusMult) * xMult;
  const miles = (handResult.baseMiles + totalValue) * mult;
  console.log(
    `  [scoreHand] Result: (${handResult.baseMiles} baseMiles + ${totalValue} value) * (${handResult.baseMult} baseMult + ${bonusMult} bonus) * ${xMult} xMult = ${miles} miles (mult: ${mult})`,
  );
  return { handResult, totalValue, miles, mult, animEvents };
}

function matchesParity(value: number, parity: string): boolean {
  if (parity === 'even') return value % 2 === 0;
  if (parity === 'odd') return value % 2 !== 0;
  return false;
}
