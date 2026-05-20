// ─── Test Helpers ───
// Factories and utilities for setting up game state in tests.
// Usage: const { game, player } = setupGame({ equipment: [item('horseshoe')] });

import { Die, DiceEnhancement, DiceAura, DiceSticker, HandType } from '../types';
import { GameState } from '../GameState';
import { PlayerState, resetPlayerState, ProfessionDef } from '../PlayerState';
import { EquipmentDef, EquipmentInstance, getAllEquipment } from '../ItemsSystem';
import { createDie } from '../DiceSystem';

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
export function item(id: string): EquipmentInstance {
  const def = getItemsMap().get(id);
  if (!def) throw new Error(`Unknown item id: "${id}". Available: ${[...getItemsMap().keys()].join(', ')}`);
  return {
    def,
    sellValue: Math.max(1, Math.floor(def.cost / 2)),
    state: def.initialState ? { ...def.initialState } : {},
  };
}

/** Create an equipment instance with an aura applied */
export function itemWithAura(id: string, auraId: 'fire' | 'icy' | 'holy' | 'ghost'): EquipmentInstance {
  const inst = item(id);
  const auraMap = {
    fire: { id: 'fire', name: 'Blazing', description: '+10 mult', costIncrease: 3, chance: 0 },
    icy: { id: 'icy', name: 'Frozen', description: '+50 miles', costIncrease: 3, chance: 0 },
    holy: { id: 'holy', name: 'Holy', description: 'x1.5 mult', costIncrease: 5, chance: 0 },
    ghost: {
      id: 'ghost',
      name: 'Ghost',
      description: "Doesn't take up space in your inventory",
      costIncrease: 5,
      chance: 0,
    },
  } as const;
  return {
    ...inst,
    def: { ...inst.def, aura: auraMap[auraId] },
  };
}

/** Create an equipment instance with custom initial state overrides */
export function itemWithState(id: string, stateOverrides: Record<string, number>): EquipmentInstance {
  const inst = item(id);
  return {
    ...inst,
    state: { ...inst.state, ...stateOverrides },
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
    isGrimy: false,
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
}

export interface GameSetupResult {
  game: GameState;
  player: PlayerState;
}

/**
 * Set up a fresh game environment with sensible defaults and easy overrides.
 * Resets the global PlayerState singleton so tests are isolated.
 */
export function setupGame(options: GameSetupOptions = {}): GameSetupResult {
  // Reset global singleton
  const player = resetPlayerState();

  // Apply options
  if (options.money !== undefined) player.economy.setBalance(options.money);
  if (options.leg !== undefined) player.leg = options.leg;
  if (options.round !== undefined) player.round = options.round;
  if (options.profession) player.applyProfession(options.profession);
  if (options.equipment) player.equipment = [...options.equipment];
  if (options.dice) player.dice = [...options.dice];
  player.finalizeRunSetup();
  if (options.handSize !== undefined) player.handSize = options.handSize;
  if (options.maxEquipmentSlots !== undefined) player.maxEquipmentSlots = options.maxEquipmentSlots;

  if (options.handLevels) {
    for (const [handType, level] of Object.entries(options.handLevels)) {
      if (level !== undefined && level > 1) {
        player.upgradeHandLevel(handType as HandType, level - 1);
      }
    }
  }

  const game = new GameState();
  return { game, player };
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
  /** Current day (1-based, default: 1) */
  currentDay?: number;
  /** Max days for the round (default: game default) */
  maxDays?: number;
}

/**
 * Run the full score calculation pipeline and return the result.
 * This drives the GameState through SELECT → ROLL → SCORE phases,
 * injecting the specified dice directly (no randomness).
 */
export function calculateTestScore(options: ScoreTestOptions) {
  const allDice = [...options.scoredDice, ...(options.heldDice ?? [])];
  const scoredIds = options.scoredDice.map((d) => d.id);

  const { game, player } = setupGame({
    equipment: options.equipment ?? [],
    dice: [...allDice, ...diceWithValue(1, 50)], // pad dice pool
    money: options.money ?? 10,
    profession: options.profession,
    handLevels: options.handLevels,
  });

  // Set rerolls (default matches GAMEPLAY.MAX_REROLLS = 6)
  const rerolls = options.rerollsRemaining ?? 6;

  // Start round
  game.startRound();

  // Override day/maxDays if specified
  if (options.currentDay !== undefined) game.state.day = options.currentDay;
  if (options.maxDays !== undefined) game.config.maxDays = options.maxDays;

  // Force the game state to have our specific dice
  game.state.phase = 'ROLL';
  game.state.rolledDice = allDice;
  game.state.selectedForRoll = allDice;
  game.state.rerollsRemaining = rerolls;

  // Select dice for scoring
  game.selectForScore(scoredIds);

  // Calculate
  const result = game.calculateScore();
  if (!result) throw new Error('calculateScore returned null');

  return { result, game, player };
}
