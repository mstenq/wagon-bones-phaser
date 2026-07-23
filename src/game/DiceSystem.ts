// ─── Dice System (No Phaser imports) ───
// Die lifecycle: creation, rolling, pouch management, hand detection.
// Score orchestration: scoring/scoreHand.ts. Item handlers: effects/.

import { Die, DiceEnhancement, HandType, HandResult, HandDefinition } from './types';
import hands from '../data/hands';
import { getRunState } from './store/runStore';
import { selectResolvedLoadedDieTarget } from './store/selectors/runSelectors';
import { resolveEquipmentList } from './store/resolve';
import { GAMEPLAY } from './Constants';
import {
  getGravityModeFace,
  getGravityRollChance,
  getLoadedFaceRollChance,
  hasGravityEquipment,
} from './equipmentUtils';
import { getRoundState } from './store/roundStore';
import { selectGravityDice } from './store/selectors/roundSelectors';
import { hasSpiritPath } from './spiritPath';
import { D } from './scoreMath';
import { rngFloat, rngInt, rngPick, rngShuffle } from './RunRng';

const HAND_TABLE: HandDefinition[] = hands;

let nextDieId = 0;

// ─── Dice Creation ───

export function createDie(overrides?: Partial<Die>): Die {
  const die: Die = {
    id: `die_${nextDieId++}`,
    value: rngInt('dice', 1, 12),
    enhancement: null,
    sticker: null,
    aura: null,
    bonusMiles: 0,
    ...overrides,
  };
  if (die.enhancement === 'stone') die.value = 0;
  return die;
}

/**
 * Change a die's enhancement and fix its face value when entering or leaving stone.
 * Stone dice always use value 0; leaving stone rolls a new d12 face.
 */
export function setDieEnhancement(die: Die, enhancement: DiceEnhancement): void {
  const wasStone = die.enhancement === 'stone';
  die.enhancement = enhancement;
  if (enhancement === 'stone') {
    die.value = 0;
  } else if (wasStone) {
    die.value = rngInt('dice', 1, 12);
  }
}

export function createPouch(count: number): Die[] {
  return Array.from({ length: count }, () => createDie());
}

/** Create profession-enhanced dice (non-null enhancements only). */
export function createStartingDice(enhancements: Exclude<DiceEnhancement, null>[]): Die[] {
  return enhancements.map((enhancement) => createDie({ enhancement }));
}

/** Profession dice plus standard (unenhanced) dice up to total collection size. */
export function createRunStartingPouch(
  professionEnhancements: Exclude<DiceEnhancement, null>[],
  totalCount: number = GAMEPLAY.STARTING_DICE,
): Die[] {
  const professionDice = createStartingDice(professionEnhancements);
  const standardCount = Math.max(0, totalCount - professionDice.length);
  return [...professionDice, ...createPouch(standardCount)];
}

// ─── Rolling ───

const D12_FACES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

type FaceRollBiasSource = 'loaded' | 'gravity';

type FaceRollBias = {
  face: number;
  chance: number;
  source: FaceRollBiasSource;
};

function collectFaceRollBiases(
  die: Die,
  equipment: ReturnType<typeof resolveEquipmentList>,
  run: ReturnType<typeof getRunState>,
): FaceRollBias[] {
  const biases: FaceRollBias[] = [];

  const loadedTarget = selectResolvedLoadedDieTarget(run);
  if (loadedTarget !== null) {
    const loadedChance = getLoadedFaceRollChance(equipment, die.enhancement, run.professionId);
    if (loadedChance > 0) {
      biases.push({ face: loadedTarget, chance: loadedChance, source: 'loaded' });
    }
  }

  const round = getRoundState();
  if (round?.phase === 'ROLL' && hasGravityEquipment(equipment)) {
    const mode = getGravityModeFace(selectGravityDice(round));
    if (mode) {
      const gravityChance = getGravityRollChance(mode.count, equipment);
      if (gravityChance > 0) {
        biases.push({ face: mode.face, chance: gravityChance, source: 'gravity' });
      }
    }
  }

  return biases;
}

function resolveBiasedFaceRoll(die: Die, biases: FaceRollBias[]): Die | null {
  if (biases.length === 0) return null;

  const guaranteedGravity = biases.find((bias) => bias.source === 'gravity' && bias.chance >= 1);
  if (guaranteedGravity) return { ...die, value: guaranteedGravity.face };

  const chanceByFace = new Map<number, number>();
  for (const bias of biases) {
    const current = chanceByFace.get(bias.face) ?? 0;
    chanceByFace.set(bias.face, Math.min(1, current + bias.chance));
  }

  let roll = rngFloat('loadedDice');
  for (const [face, chance] of chanceByFace) {
    if (roll < chance) return { ...die, value: face };
    roll -= chance;
  }

  const biasedFaces = new Set(chanceByFace.keys());
  const otherFaces = D12_FACES.filter((face) => !biasedFaces.has(face));
  return { ...die, value: rngPick('loadedDice', otherFaces) };
}

export function rollDie(die: Die): Die {
  if (die.enhancement === 'stone') return { ...die, value: 0 };

  const run = getRunState();
  const equipment = resolveEquipmentList();
  const biasedRoll = resolveBiasedFaceRoll(die, collectFaceRollBiases(die, equipment, run));
  if (biasedRoll) return biasedRoll;

  return { ...die, value: rngInt('dice', 1, 12) };
}

export function rollDice(dice: Die[]): Die[] {
  return dice.map((d) => rollDie(d));
}

// ─── Pouch Management ───

export function drawFromPouch(pouch: Die[], count: number): { drawn: Die[]; remaining: Die[] } {
  const shuffled = rngShuffle('dice', pouch);
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

function findLongestStraight(dice: Die[], allowGaps = false): number[] {
  if (dice.length === 0) return [];

  const unique = [...new Set(dice.map((d) => d.value))].sort((a, b) => a - b);
  let best: number[] = [];
  let current: number[] = [unique[0]];

  for (let i = 1; i < unique.length; i++) {
    const diff = unique[i] - unique[i - 1];
    const extendsChain = diff === 1 || (allowGaps && diff === 2);
    if (extendsChain) {
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

export function buildHandResult(type: HandType, scoringDice: Die[]): HandResult {
  const def = getHandDef(type);
  return { type, name: def.name, baseMiles: D(def.baseMiles), baseMult: D(def.baseMult), rank: def.rank, scoringDice };
}

function buildResult(type: HandType, scoringDice: Die[]): HandResult {
  return buildHandResult(type, scoringDice);
}

function allDiceShareEnhancement(dice: Die[]): boolean {
  if (dice.length !== 5) return false;
  const enhancement = dice[0].enhancement;
  if (enhancement === null) return false;
  return dice.every((d) => d.enhancement === enhancement);
}

type HandPatternResult = { pattern: HandType; straight: number[] };

/** Base hand pattern (no flush variants) from pip layout alone. */
function classifyHandPattern(dice: Die[], allowGaps: boolean): HandPatternResult {
  if (dice.length === 0) return { pattern: HandType.HIGH_VALUE, straight: [] };

  const freq = getFrequencies(dice);
  const counts = [...freq.values()].sort((a, b) => b - a);
  const straight = findLongestStraight(dice, allowGaps);

  if (counts[0] >= 5) return { pattern: HandType.FIVE_OF_A_KIND, straight };
  if (straight.length >= 5) return { pattern: HandType.FIVE_STRAIGHT, straight };
  if (counts[0] >= 4) return { pattern: HandType.FOUR_OF_A_KIND, straight };
  if (counts[0] >= 3 && counts[1] >= 2) return { pattern: HandType.FULL_HOUSE, straight };
  if (straight.length >= 4) return { pattern: HandType.FOUR_STRAIGHT, straight };
  if (counts[0] >= 3) return { pattern: HandType.THREE_OF_A_KIND, straight };
  if (counts[0] >= 2 && counts[1] >= 2) return { pattern: HandType.TWO_PAIR, straight };
  if (counts[0] >= 2) return { pattern: HandType.PAIR, straight };
  return { pattern: HandType.HIGH_VALUE, straight };
}

function detectFlushVariant(dice: Die[]): HandType {
  const allStone = dice.every((d) => d.enhancement === 'stone');
  if (allStone) return HandType.FLUSH_FIVE;

  const allowGaps = hasSpiritPath(resolveEquipmentList());
  const { pattern } = classifyHandPattern(dice, allowGaps);
  if (pattern === HandType.FIVE_OF_A_KIND) return HandType.FLUSH_FIVE;
  if (pattern === HandType.FIVE_STRAIGHT) return HandType.STRAIGHT_FLUSH;
  if (pattern === HandType.FULL_HOUSE) return HandType.FLUSH_HOUSE;
  return HandType.FLUSH;
}

/**
 * Detect the best hand from 1-5 dice.
 * Stone dice are excluded from hand pattern detection but always scored.
 */
export function detectBestHand(dice: Die[]): HandResult {
  if (allDiceShareEnhancement(dice)) {
    const flushType = detectFlushVariant(dice);
    return buildResult(flushType, [...dice]);
  }

  // Separate stone dice — they don't participate in hand detection
  const stoneDice = dice.filter((d) => d.enhancement === 'stone');
  const normalDice = dice.filter((d) => d.enhancement !== 'stone');

  if (normalDice.length === 0) {
    // Only stone dice — no hand pattern, just score them all
    return buildResult(HandType.HIGH_VALUE, [...stoneDice]);
  }

  const result = detectBestHandFromDice(normalDice);
  // Include stone dice in scoring, preserving the player's play order (left to right)
  if (stoneDice.length > 0) {
    const scoringIds = new Set([...result.scoringDice, ...stoneDice].map((d) => d.id));
    result.scoringDice = dice.filter((d) => scoringIds.has(d.id));
  }
  return result;
}

/**
 * Internal: detect best hand from non-stone dice only.
 */
function detectBestHandFromDice(dice: Die[]): HandResult {
  const allowGaps = hasSpiritPath(resolveEquipmentList());
  const { pattern, straight } = classifyHandPattern(dice, allowGaps);
  const freq = getFrequencies(dice);

  switch (pattern) {
    case HandType.FIVE_OF_A_KIND:
      return buildResult(pattern, dice.slice(0, 5));

    case HandType.FIVE_STRAIGHT: {
      const straightSet = new Set(straight.slice(0, 5));
      const scoringDice = dice.filter((d) => straightSet.has(d.value));
      const used = new Set<number>();
      const uniqueDice = scoringDice.filter((d) => {
        if (used.has(d.value)) return false;
        used.add(d.value);
        return true;
      });
      return buildResult(pattern, uniqueDice.slice(0, 5));
    }

    case HandType.FOUR_OF_A_KIND: {
      const pip = [...freq.entries()].find(([, c]) => c >= 4)![0];
      return buildResult(pattern, dice.filter((d) => d.value === pip).slice(0, 4));
    }

    case HandType.FULL_HOUSE: {
      const threePip = [...freq.entries()].find(([, c]) => c >= 3)![0];
      const twoPip = [...freq.entries()].find(([p, c]) => c >= 2 && p !== threePip)![0];
      const pairPips = new Set([threePip, twoPip]);
      const scoring: Die[] = [];
      const used = new Map<number, number>();
      for (const d of dice) {
        if (!pairPips.has(d.value)) continue;
        const limit = d.value === threePip ? 3 : 2;
        const count = used.get(d.value) ?? 0;
        if (count < limit) {
          scoring.push(d);
          used.set(d.value, count + 1);
        }
      }
      return buildResult(pattern, scoring);
    }

    case HandType.FOUR_STRAIGHT: {
      const straightSet = new Set(straight.slice(0, 4));
      const used = new Set<number>();
      const scoringDice = dice.filter((d) => {
        if (!straightSet.has(d.value) || used.has(d.value)) return false;
        used.add(d.value);
        return true;
      });
      return buildResult(pattern, scoringDice.slice(0, 4));
    }

    case HandType.THREE_OF_A_KIND: {
      const pip = [...freq.entries()].find(([, c]) => c >= 3)![0];
      return buildResult(pattern, dice.filter((d) => d.value === pip).slice(0, 3));
    }

    case HandType.TWO_PAIR: {
      const pairs = [...freq.entries()].filter(([, c]) => c >= 2).map(([p]) => p);
      const pairPips = new Set(pairs);
      const scoring: Die[] = [];
      const used = new Map<number, number>();
      for (const d of dice) {
        if (!pairPips.has(d.value)) continue;
        const count = used.get(d.value) ?? 0;
        if (count < 2) {
          scoring.push(d);
          used.set(d.value, count + 1);
        }
      }
      return buildResult(pattern, scoring);
    }

    case HandType.PAIR: {
      const pip = [...freq.entries()].find(([, c]) => c >= 2)![0];
      return buildResult(pattern, dice.filter((d) => d.value === pip).slice(0, 2));
    }

    case HandType.HIGH_VALUE:
    default: {
      if (dice.length === 0) return buildResult(HandType.HIGH_VALUE, []);
      const best = [...dice].sort((a, b) => b.value - a.value);
      return buildResult(HandType.HIGH_VALUE, [best[0]]);
    }
  }
}
