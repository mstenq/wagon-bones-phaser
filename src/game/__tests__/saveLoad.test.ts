import { describe, expect, test } from 'bun:test';
import { resetPlayerState, getPlayerState } from '../PlayerState';
import { GameState } from '../GameState';
import { acquireEquipmentInstance } from '../EquipmentModifiers';
import { getEquipmentDefById } from '../ItemsSystem';
import { getProfessionById } from '../../data/professions';
import {
  buildSaveSnapshot,
  applySaveSnapshot,
  validateSaveSnapshot,
  SAVE_VERSION,
  type GameSaveSnapshot,
} from '../SaveLoad';
import { HandType } from '../types';
import bosses from '../../data/bosses';

describe('SaveLoad', () => {
  test('round-trips player state for RoundSelect scene', () => {
    const player = resetPlayerState();
    player.applyProfession('outlaw');
    player.setDifficulty(3);
    player.leg = 2;
    player.round = 2;
    player.economy.setBalance(17);
    player.getHandStats(HandType.PAIR).level = 3;

    const snapshot = buildSaveSnapshot({ activeScene: 'RoundSelect' });
    expect(snapshot.version).toBe(SAVE_VERSION);
    expect(snapshot.player.professionId).toBe('outlaw');
    expect(snapshot.player.difficulty).toBe(3);
    expect(snapshot.player.balance).toBe(17);

    const { scene, sceneData } = applySaveSnapshot(snapshot);
    expect(scene).toBe('RoundSelect');
    expect(sceneData).toEqual({});

    const restored = getPlayerState();
    expect(restored.profession?.id).toBe('outlaw');
    expect(restored.difficulty).toBe(3);
    expect(restored.leg).toBe(2);
    expect(restored.round).toBe(2);
    expect(restored.economy.balance).toBe(17);
    expect(restored.getHandStats(HandType.PAIR).level).toBe(3);
  });

  test('round-trips Game scene with mid-round state', () => {
    resetPlayerState();
    const player = getPlayerState();
    player.applyProfession('farmer');
    player.finalizeRunSetup();
    player.leg = 1;
    player.round = 1;

    const def = getEquipmentDefById('coffee');
    if (!def) throw new Error('coffee equipment missing');
    player.equipment.push(acquireEquipmentInstance(def, [], []));

    const game = new GameState({ targetMiles: player.targetMiles });
    game.startRound();
    game.state.phase = 'ROLL';
    game.state.totalMiles = 42;
    game.state.day = 2;

    const snapshot = buildSaveSnapshot({
      activeScene: 'Game',
      data: {
        config: { ...game.config },
        state: {
          ...game.state,
          spent: [...game.state.spent],
          hand: [...game.state.hand],
          selectedForRoll: [...game.state.selectedForRoll],
          rolledDice: [...game.state.rolledDice],
          selectedForScore: [...game.state.selectedForScore],
          handHistory: [...game.state.handHistory],
        },
      },
    });

    const { scene, sceneData } = applySaveSnapshot(snapshot);
    expect(scene).toBe('Game');
    expect((sceneData as { restore: { state: { totalMiles: number } } }).restore.state.totalMiles).toBe(42);

    const restoredPlayer = getPlayerState();
    expect(restoredPlayer.equipment[0]?.def.id).toBe('coffee');
    expect(restoredPlayer.profession?.id).toBe('farmer');
  });

  test('preserves boss assignment IDs', () => {
    const player = resetPlayerState();
    const ids = player.getBossAssignmentIds();
    expect(ids.length).toBeGreaterThan(0);

    const snapshot = buildSaveSnapshot({ activeScene: 'RoundSelect' });
    applySaveSnapshot(snapshot);

    expect(getPlayerState().getBossAssignmentIds()).toEqual(ids);
  });

  test('rejects invalid save version', () => {
    const bad = { version: 999, activeScene: 'RoundSelect', player: {} };
    expect(validateSaveSnapshot(bad)).toBeNull();
  });

  test('rejects unknown active scene', () => {
    const bad: GameSaveSnapshot = {
      version: SAVE_VERSION,
      exportedAt: new Date().toISOString(),
      activeScene: 'Payout' as GameSaveSnapshot['activeScene'],
      player: {
        balance: 4,
        dice: [],
        loadedDieTarget: null,
        spentDiceIds: [],
        equipment: [],
        maxEquipmentSlots: 5,
        maxConsumableSlots: 2,
        consumables: [],
        lastUsedConsumableId: null,
        shopSlots: 5,
        leg: 1,
        round: 1,
        interestCap: 25,
        handStats: {},
        professionId: null,
        difficulty: 1,
        handSize: 8,
        shopRerollCount: 0,
        purchasedPermits: [],
        currentLegPermitId: null,
        permitPurchasedThisLeg: false,
        permitDayBonus: 0,
        permitRerollBonus: 0,
        permitDayPenalty: 0,
        permitRerollPenalty: 0,
        permitScoreReduction: 0,
        trailEventModifiers: {
          dayPenalty: 0,
          rerollPenalty: 0,
          handSizePenalty: 0,
          scoreMultiplier: 1,
          disableRerollDay1: false,
          standardDiceDay1: false,
          moneyPerDayLoss: 0,
          diamondCrackDoubled: false,
          luckyOddsHalved: false,
          scoredDiceDestroyChance: 0,
          bossUpgradeMultiplier: 1,
          flatMilesPenalty: 0,
          skipNextShop: false,
          loseAllRerolls: false,
        },
        pendingTrailEventId: null,
        seenTrailEventIds: [],
        skipNextShop: false,
        trailGuidesUsed: 0,
        startingDiceCount: 25,
        bossEffectDisabled: false,
        bossRoundState: {
          disabledEquipmentIndices: [],
          lockedDiceIds: [],
          preacherLockedHand: null,
          handsPlayedThisRound: [],
          equipmentDisplayOrder: null,
          equipmentHidden: false,
          landSlideRevealed: false,
        },
        pendingNewDiceIds: [],
        pendingHandDiceIds: [],
        pendingAnimatedDestructions: [],
        pendingJunkDealerCount: 0,
        pendingTags: [],
        storedAuraTags: [],
        roundsSkipped: 0,
        daysScored: 0,
        unusedRerollsTotal: 0,
        twinWagonCount: 0,
        wideSaddleBonus: 0,
        tagFreeReroll: false,
        bonusShopPermitId: null,
        skippedRoundsThisLeg: [],
        skippedRoundTags: {},
        roundSkipPreviewTags: {},
        bossRerollsUsedThisLeg: 0,
        dynamiteSelfDestructed: false,
        bossAssignmentIds: bosses.map((b) => b.id).slice(0, 8),
        nextDieId: 0,
      },
    };
    expect(validateSaveSnapshot(bad)).toBeNull();
  });

  test('restoreBossAssignments throws on unknown boss', () => {
    const player = resetPlayerState();
    expect(() => player.restoreBossAssignments(['nonexistent_boss_xyz'])).toThrow();
  });

  test('getProfessionById used in restore', () => {
    expect(getProfessionById('outlaw')).toBeDefined();
  });
});
