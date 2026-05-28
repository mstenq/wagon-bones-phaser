// ─── Test Helpers ───
// Factories and utilities for setting up game state in tests.
// Usage: const { game, run } = setupGame({ equipment: [item('horseshoe')] });

import { Die, HandType, BossDef, DifficultyLevel, EquipmentModifier } from '../types';
import { getBossById } from '../../data/bosses';
import { GameState } from './testGameState';
import { getPlayerState, type PlayerState } from './testRunPlayer';
import { resetRunRng } from '../RunRng';
import {
  bossActions,
  economyActions,
  equipmentActions,
  progressionActions,
  roundActions,
  runActions,
  setupActions,
} from '../store';
import { getRunState } from '../store/runStore';
import { getRoundState } from '../store/roundStore';
import { EquipmentDef, EquipmentInstance, getAllEquipment, createEquipmentInstance } from '../ItemsSystem';
import { EQUIPMENT_MODIFIER } from '../Constants';
import { createPouch } from '../DiceSystem';
import { GAMEPLAY } from '../Constants';
import { D } from '../decimal';
import type { RunState } from '../store/types';

// ─── Item Lookup ───

const _itemsById = new Map<string, EquipmentDef>();
function getItemsMap(): Map<string, EquipmentDef> {
  if (_itemsById.size === 0) {
    for (const item of getAllEquipment()) {
      _itemsById.set(item.id, item);
    }
  }
  return _itemsById;
}

/** Look up an equipment def by id. Throws if not found. */
export function item(id: string, purchasedPermitIds: string[] = []): EquipmentInstance {
  const def = getItemsMap().get(id);
  if (!def) throw new Error(`Unknown item id: "${id}". Available: ${[...getItemsMap().keys()].join(', ')}`);
  return createEquipmentInstance(def, purchasedPermitIds);
}

/** Create an equipment instance with an aura applied */
export function itemWithAura(id: string, auraId: 'fire' | 'icy' | 'holy' | 'ghost'): EquipmentInstance {
  const inst = item(id);
  const auraMap = {
    fire: { id: 'fire', name: 'Blazing', description: '+10 mult', costIncrease: 3, equipmentChance: 0 },
    icy: { id: 'icy', name: 'Frozen', description: '+50 miles', costIncrease: 3, equipmentChance: 0 },
    holy: { id: 'holy', name: 'Holy', description: 'x1.5 mult', costIncrease: 5, equipmentChance: 0 },
    ghost: {
      id: 'ghost',
      name: 'Ghost',
      description: "Doesn't take up space in your inventory",
      costIncrease: 5,
      equipmentChance: 0,
    },
  } as const;
  const def = {
    ...inst.def,
    aura: auraMap[auraId],
    cost: inst.def.cost + auraMap[auraId].costIncrease,
  };
  return createEquipmentInstance(def);
}

/** Create an equipment instance with custom initial state overrides */
export function itemWithState(id: string, stateOverrides: Record<string, number>): EquipmentInstance {
  const inst = item(id);
  return {
    ...inst,
    state: { ...inst.state, ...stateOverrides },
  };
}

export function setTestDifficulty(level: DifficultyLevel): void {
  setupActions.setDifficulty(level);
}

/** Build equipment with explicit modifiers (no random roll). */
export function equipWithModifiers(id: string, modifiers: EquipmentModifier[]): EquipmentInstance {
  const def = getItemsMap().get(id);
  if (!def) throw new Error(`Unknown item id: "${id}"`);
  return {
    def,
    sellValue: modifiers.includes('cursed')
      ? 0
      : modifiers.includes('leased')
        ? EQUIPMENT_MODIFIER.LEASED_BUY_PRICE
        : Math.max(1, Math.floor(def.cost / 2)),
    state: def.initialState ? { ...def.initialState } : {},
    modifiers: [...modifiers],
    perishableRoundsLeft: modifiers.includes('perishable') ? EQUIPMENT_MODIFIER.PERISHABLE_ROUNDS : undefined,
  };
}

// ─── Die Factories ───

let _testDieId = 0;

/** Create a die with specific values. Defaults to a plain d12 with value 6. */
export function die(overrides: Partial<Die> = {}): Die {
  return {
    id: `test_die_${_testDieId++}`,
    value: 6,
    enhancement: null,
    sticker: null,
    aura: null,
    bonusMiles: 0,
    ...overrides,
  };
}

/** Create multiple dice with the same value */
export function diceWithValue(value: number, count: number): Die[] {
  return Array.from({ length: count }, () => die({ value }));
}

/** Create dice from an array of values */
export function diceFromValues(values: number[]): Die[] {
  return values.map((v) => die({ value: v }));
}

/** Reset the test die ID counter (call in beforeEach if you want deterministic IDs) */
export function resetDieIds(): void {
  _testDieId = 0;
}

/** Copy live run equipment state onto instances tests still hold by reference. */
export function persistPlayerEquipment(): void {
  getPlayerState().persistEquipment();
}

/** Seed ROLL phase with dice that exist in the run pouch (adds missing dice to run). */
export function seedTestRoll(rolled: Die[], options?: { rerolls?: number }): void {
  const run = getRunState();
  const existingIds = new Set(run.dice.map((d) => d.id));
  const merged = [...run.dice];
  for (const d of rolled) {
    if (!existingIds.has(d.id)) {
      merged.push(d);
      existingIds.add(d.id);
    }
  }
  if (merged.length !== run.dice.length) {
    runActions.patch({ dice: merged });
  }

  const dieValuesByDieId: Record<string, number> = {};
  for (const d of rolled) dieValuesByDieId[d.id] = d.value;

  roundActions.patch({
    phase: 'ROLL',
    rolledDice: rolled.map((d) => ({ id: d.id, value: d.value })),
    selectedForRollIds: rolled.map((d) => d.id),
    dieValuesByDieId,
    rerollsRemaining: options?.rerolls ?? 6,
  });
}

/** Copy run-store equipment onto instances tests still hold by reference. */
export function syncEquipmentInstances(...instances: EquipmentInstance[]): void {
  const player = getPlayerState();
  for (const orig of instances) {
    const live = player.equipment.find((e) => e.def.id === orig.def.id);
    if (!live) continue;
    orig.state = { ...live.state };
    orig.def = live.def;
    orig.perishableRoundsLeft = live.perishableRoundsLeft;
    orig.sellValue = live.sellValue;
    orig.modifiers = [...live.modifiers];
  }
}

/** Push in-test equipment edits (state/def) into the run store before store-driven actions. */
export function pushEquipmentState(...instances: EquipmentInstance[]): void {
  const player = getPlayerState();
  player.syncFromStore();
  for (const orig of instances) {
    const live = player.equipment.find((e) => e.def.id === orig.def.id);
    if (!live) continue;
    live.state = { ...orig.state };
    live.def = orig.def;
    live.perishableRoundsLeft = orig.perishableRoundsLeft;
    live.sellValue = orig.sellValue;
    live.modifiers = [...orig.modifiers];
  }
  player.persistEquipment();
}

export type PlayScoredDayAndEndOptions = {
  /** Dice scored this day (default 2). */
  scoredCount?: number;
  /** Dice rolled this day (default min(5, hand size)). */
  rollCount?: number;
  /** Exact dice to roll and score (overrides rollCount / scoredCount). */
  rolledDice?: Die[];
  /** Options for roundActions.endDay (GameScene uses deferEquipmentDestructionAnimation: true). */
  endDay?: { deferEquipmentDestructionAnimation?: boolean };
  /** Set a very high target so scoring one hand does not win the leg. */
  avoidWin?: boolean;
};

/**
 * SELECT → ROLL → SCORE → endDay through store actions.
 * Call after setupGame + game.startRound(). Syncs player equipment from the store on return.
 */
export function playScoredDayAndEnd(game: GameState, options: PlayScoredDayAndEndOptions = {}) {
  if (options.avoidWin) {
    game.config.targetMiles = D(999_999);
  }

  if (options.rolledDice) {
    seedTestRoll(options.rolledDice);
    game.selectForRoll(options.rolledDice.map((d) => d.id));
    game.selectForScore(options.rolledDice.map((d) => d.id));
  } else {
    const hand = game.state.hand;
    const rollCount = options.rollCount ?? Math.min(5, hand.length);
    const rollIds = hand.slice(0, rollCount).map((d) => d.id);
    game.selectForRoll(rollIds);

    const scoredCount = options.scoredCount ?? 2;
    const scoredIds = game.state.rolledDice.slice(0, scoredCount).map((d) => d.id);
    game.selectForScore(scoredIds);
  }
  const score = game.calculateScore();
  if (!score) throw new Error('playScoredDayAndEnd: calculateScore returned null');

  const result = game.endDay(options.endDay);
  getPlayerState().syncFromStore();
  return result;
}

/** Reset run + round stores for isolated tests. */
export function resetGameStores(): void {
  resetRunRng();
  runActions.reset();
  roundActions.reset();
}

/** Same as `resetGameStores` + sync legacy player facade cache (prefer store APIs in new tests). */
export function resetTestRun(): void {
  resetGameStores();
  getPlayerState().syncFromStore();
}

/** @deprecated Use `resetTestRun` or `resetGameStores`. */
export const resetPlayerState = resetTestRun;

// ─── Game Setup ───

export interface GameSetupOptions {
  /** Equipment to equip on the player */
  equipment?: EquipmentInstance[];
  /** Starting money (default: 10) */
  money?: number;
  /** Current leg (default: 1) */
  leg?: number;
  /** Current round within the leg (default: 1) */
  round?: number;
  /** Profession id to apply (default: none) */
  profession?: string;
  /** Hand stats overrides: { [HandType]: { level } } */
  handLevels?: Partial<Record<HandType, number>>;
  /** Custom dice pool (replaces default) */
  dice?: Die[];
  /** Hand size override */
  handSize?: number;
  /** Max equipment slots */
  maxEquipmentSlots?: number;
  /** Boss id for current leg (sets round to 3) */
  bossId?: string;
}

export interface GameSetupResult {
  /** Round facade for scoring / phase transitions in tests */
  game: GameState;
  /** Run slice after setup */
  run: RunState;
  /** @deprecated Use `run` + store actions; kept for existing tests during step 7 */
  player: PlayerState;
}

/**
 * Set up a fresh game environment with sensible defaults and easy overrides.
 */
export function setupGame(options: GameSetupOptions = {}): GameSetupResult {
  resetGameStores();

  if (options.money !== undefined) economyActions.setBalance(options.money);
  if (options.leg !== undefined) runActions.patch({ leg: options.leg });
  if (options.round !== undefined) runActions.patch({ round: options.round });
  if (options.profession) setupActions.applyProfession(options.profession);
  if (options.equipment) {
    equipmentActions.setEquipment([...options.equipment]);
  }
  if (options.dice) runActions.patch({ dice: [...options.dice] });
  if (!options.profession && !options.dice) {
    runActions.patch({ dice: createPouch(GAMEPLAY.STARTING_DICE) });
  }
  setupActions.finalizeRunSetup();
  if (options.handSize !== undefined) runActions.patch({ handSize: options.handSize });
  if (options.maxEquipmentSlots !== undefined) runActions.patch({ maxEquipmentSlots: options.maxEquipmentSlots });

  if (options.handLevels) {
    for (const [handType, level] of Object.entries(options.handLevels)) {
      if (level !== undefined && level > 1) {
        progressionActions.upgradeHandLevel(handType as HandType, level - 1);
      }
    }
  }

  if (options.bossId) {
    runActions.patch({ round: 3 });
    const boss = getBossById(options.bossId);
    if (!boss) throw new Error(`Unknown boss id: "${options.bossId}"`);
    bossActions.setBossForCurrentLeg(boss);
  }

  const game = new GameState();
  const player = getPlayerState();
  player.syncFromStore();
  return { game, run: getRunState(), player };
}

/** Force boss on current leg (round 3) */
export function setBoss(_run: RunState, bossId: string): BossDef {
  const boss = getBossById(bossId);
  if (!boss) throw new Error(`Unknown boss id: "${bossId}"`);
  runActions.patch({ round: 3 });
  bossActions.setBossForCurrentLeg(boss);
  return boss;
}

// ─── Score Calculation Helper ───

export interface ScoreTestOptions {
  /** Dice selected for scoring */
  scoredDice: Die[];
  /** Dice rolled but NOT scored (held in hand) */
  heldDice?: Die[];
  /** Equipment equipped on the player */
  equipment?: EquipmentInstance[];
  /** Rerolls remaining (default: 2) */
  rerollsRemaining?: number;
  /** Hand level overrides */
  handLevels?: Partial<Record<HandType, number>>;
  /** Starting money */
  money?: number;
  /** Profession id */
  profession?: string;
  /** Boss id (boss round) */
  bossId?: string;
  /** Current day (1-based, default: 1) */
  currentDay?: number;
  /** Max days for the round (default: game default) */
  maxDays?: number;
  /** Echo of the Damned retrigger stacks before scoring */
  echoOfTheDamnedStacks?: number;
}

/**
 * Run the full score calculation pipeline and return the result.
 */
export function calculateTestScore(options: ScoreTestOptions) {
  const allDice = [...options.scoredDice, ...(options.heldDice ?? [])];
  const scoredIds = options.scoredDice.map((d) => d.id);

  const { game, run } = setupGame({
    equipment: options.equipment ?? [],
    dice: [...allDice, ...diceWithValue(1, 50)],
    money: options.money ?? 10,
    profession: options.profession,
    handLevels: options.handLevels,
    bossId: options.bossId,
  });

  if (options.echoOfTheDamnedStacks !== undefined) {
    const nextCopies = options.echoOfTheDamnedStacks;
    runActions.patch({
      statusTraitTokens: [
        ...run.statusTraitTokens.filter((t) => t.id !== 'echo_of_the_damned'),
        { id: 'echo_of_the_damned', copies: nextCopies },
      ],
    });
  }

  const rerolls = options.rerollsRemaining ?? 6;

  game.startRound();

  if (options.currentDay !== undefined) {
    roundActions.patch({ day: options.currentDay });
  }
  if (options.maxDays !== undefined) {
    const round = getRoundState();
    if (round) roundActions.patch({ config: { ...round.config, maxDays: options.maxDays } });
  }

  const dieValuesByDieId: Record<string, number> = {};
  for (const d of allDice) dieValuesByDieId[d.id] = d.value;
  roundActions.patch({
    phase: 'ROLL',
    rolledDice: allDice.map((d) => ({ id: d.id, value: d.value })),
    selectedForRollIds: allDice.map((d) => d.id),
    dieValuesByDieId,
    rerollsRemaining: rerolls,
  });

  game.selectForScore(scoredIds);

  const result = game.calculateScore();
  if (!result) throw new Error('calculateScore returned null');

  const player = getPlayerState();
  // Scoring mutates store-resolved equipment; sync state onto instances tests still hold.
  if (options.equipment) {
    for (const orig of options.equipment) {
      const live = player.equipment.find((e) => e.def.id === orig.def.id);
      if (live) {
        orig.state = { ...live.state };
        orig.perishableRoundsLeft = live.perishableRoundsLeft;
      }
    }
  }

  return { result, game, run, player };
}
