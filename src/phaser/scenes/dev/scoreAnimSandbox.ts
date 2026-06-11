// ─── Score Anim Lab bootstrap ───
// Seeds a real GameScene run: huge random pouch, generous days/rerolls, unreachable target.

import diceEnhancements from '../../../data/dice_enhancements';
import diceStickers from '../../../data/dice_stickers';
import { GAMEPLAY } from '../../../game/Constants';
import { createDie } from '../../../game/DiceSystem';
import { getEquipmentDefById } from '../../../game/equipmentCatalog';
import { acquireRewardEquipmentInstance } from '../../../game/EquipmentModifiers';
import { gameFacade, initRoundSession, startRoundSession } from '../../../game/facade';
import type { EquipmentInstance } from '../../../game/ItemsSystem';
import { clearPlayback } from '../../../game/playback';
import { SCORE_ANIM_SANDBOX } from '../../../game/scoreAnimSandboxConfig';
import { rngInt, type RngStream } from '../../../game/RunRng';
import {
  equipmentActions,
  getRoundState,
  getRunState,
  resetAllGameStores,
  roundActions,
  runActions,
  sceneActions,
} from '../../../game/store';
import type { Die, DiceAura, DiceEnhancement, DiceSticker } from '../../../game/types';

const AURA_OPTIONS: DiceAura[] = ['holy', 'fire', 'arcane'];

const SANDBOX_EQUIPMENT_IDS = [
  'silver_bullets',
  'wild_card',
  'snake_eyes',
  'iron_furnace',
  'gold_pan',
  'graverobber',
  'moonshine',
] as const;

function createSandboxEquipment(): EquipmentInstance[] {
  const { purchasedPermits } = getRunState();
  return SANDBOX_EQUIPMENT_IDS.map((id) => {
    const def = getEquipmentDefById(id);
    if (!def) throw new Error(`Unknown sandbox equipment: ${id}`);
    return acquireRewardEquipmentInstance(def, purchasedPermits);
  });
}

function pickOptional<T>(stream: RngStream, noneWeight: number, options: T[]): T | null {
  if (options.length === 0) return null;
  const roll = rngInt(stream, 0, options.length + noneWeight - 1);
  if (roll < noneWeight) return null;
  return options[roll - noneWeight] ?? null;
}

export function generateSandboxDicePool(count: number): Die[] {
  const enhancements = diceEnhancements.map((e) => e.id as DiceEnhancement);
  const stickers = diceStickers.map((s) => s.id as DiceSticker);

  return Array.from({ length: count }, () => {
    const enhancement = pickOptional<DiceEnhancement>('dice', 2, enhancements);
    const sticker = pickOptional<DiceSticker>('dice', 4, stickers);
    const aura = pickOptional<DiceAura>('dice', 5, [...AURA_OPTIONS]);
    return createDie({ enhancement, sticker, aura });
  });
}

function seedSandboxRun(): void {
  resetAllGameStores();
  roundActions.clearRound();
  sceneActions.setActiveScene('none');
  runActions.clearPlayback();

  gameFacade.meta.applyProfession('developer');
  gameFacade.meta.setDifficulty(1);
  gameFacade.meta.initRunRng(gameFacade.meta.generateRunSeed());
  gameFacade.meta.finalizeRunSetup();
  gameFacade.meta.assignBosses();

  const dice = generateSandboxDicePool(SCORE_ANIM_SANDBOX.diceCount);
  const equipment = createSandboxEquipment();
  equipmentActions.setEquipment(equipment);

  runActions.patch({
    dice,
    nextDieId: dice.length,
    leg: 1,
    round: 1,
    balance: SCORE_ANIM_SANDBOX.startingMoney,
    consumables: [],
    spentDiceIds: [],
    handSize: GAMEPLAY.ROLL_SIZE + SCORE_ANIM_SANDBOX.handSizeBonus,
    maxEquipmentSlots: Math.max(GAMEPLAY.MAX_EQUIPMENT_SLOTS, equipment.length),
    maxConsumableSlots: GAMEPLAY.MAX_CONSUMABLE_SLOTS,
    pendingNewDiceIds: [],
    pendingHandDiceIds: [],
    priorityHandDiceIds: [],
  });
}

function beginSandboxRound(): void {
  const sandboxConfig = {
    targetMiles: SCORE_ANIM_SANDBOX.targetMiles,
    maxDays: SCORE_ANIM_SANDBOX.maxDays,
    maxRerolls: SCORE_ANIM_SANDBOX.maxRerolls,
  };
  initRoundSession(sandboxConfig);
  startRoundSession(sandboxConfig);
  const round = getRoundState();
  if (round) {
    roundActions.patch({
      config: {
        ...round.config,
        ...sandboxConfig,
      },
      rerollsRemaining: SCORE_ANIM_SANDBOX.maxRerolls,
    });
  }
  clearPlayback();
}

/** Full bootstrap for ?animlab=true — run store, round session, and playback queue. */
export function bootstrapScoreAnimLab(): void {
  seedSandboxRun();
  beginSandboxRound();
}
