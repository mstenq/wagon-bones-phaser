import { describe, expect, test } from 'bun:test';
import './setup';
import { resetPlayerState, getPlayerState } from './testRunPlayer';
import { GameState } from './testGameState';
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
import { getTrailEventById, selectTrailEvent } from '../TrailEventsSystem';
import { item } from './testHelpers';
import { HandType } from '../types';
import { getRunSeed, initRunRng, rngFloat, type RunRngState } from '../RunRng';
import { getRoundState } from '../store/roundStore';
import { createInitialRunState } from '../store/runStore';
import { createInitialSceneState, getSceneState } from '../store/sceneStore';
import { D } from '../scoreMath';

function emptyScene(activeScene: GameSaveSnapshot['activeScene'] = 'RoundSelect') {
  return { ...createInitialSceneState(), activeScene };
}

describe('SaveLoad', () => {
  test('round-trips run state for RoundSelect scene', () => {
    const player = resetPlayerState();
    initRunRng('save-seed');
    player.applyProfession('outlaw');
    player.setDifficulty(3);
    player.leg = 2;
    player.round = 2;
    player.economy.setBalance(17);
    player.getHandStats(HandType.PAIR).level = 3;

    const snapshot = buildSaveSnapshot({ activeScene: 'RoundSelect' });
    expect(snapshot.version).toBe(SAVE_VERSION);
    expect(snapshot.runSeed).toBe('save-seed');
    expect(snapshot.rngState.idCounter).toBe(0);
    expect(snapshot.run.professionId).toBe('outlaw');
    expect(snapshot.run.difficulty).toBe(3);
    expect(snapshot.run.balance).toBe(17);

    const { scene } = applySaveSnapshot(snapshot);
    expect(scene).toBe('RoundSelect');

    const restored = getPlayerState();
    expect(restored.profession?.id).toBe('outlaw');
    expect(restored.difficulty).toBe(3);
    expect(restored.leg).toBe(2);
    expect(restored.round).toBe(2);
    expect(restored.economy.balance).toBe(17);
    expect(restored.getHandStats(HandType.PAIR).level).toBe(3);
  });

  test('restores rng stream progression from save snapshot', () => {
    resetPlayerState();
    initRunRng('progress-seed');
    rngFloat('shop');
    const snapshot = buildSaveSnapshot({ activeScene: 'RoundSelect' });
    const expectedNext = rngFloat('shop');

    applySaveSnapshot(snapshot);

    expect(getRunSeed()).toBe('progress-seed');
    expect(rngFloat('shop')).toBe(expectedNext);
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
    game.state.totalMiles = D(42);
    game.state.day = 2;

    const snapshot = buildSaveSnapshot({ activeScene: 'Game' });
    expect(snapshot.round).not.toBeNull();

    const { scene } = applySaveSnapshot(snapshot);
    expect(scene).toBe('Game');
    expect(getRoundState()?.totalMiles).toBeMiles(42);

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
    const bad = { version: 999, activeScene: 'RoundSelect', run: {} };
    expect(validateSaveSnapshot(bad)).toBeNull();
  });

  test('rejects unknown active scene', () => {
    const run = createInitialRunState();
    const bad: GameSaveSnapshot = {
      version: SAVE_VERSION,
      exportedAt: new Date().toISOString(),
      activeScene: 'Payout' as GameSaveSnapshot['activeScene'],
      runSeed: 'seed',
      rngState: { idCounter: 0, streamStates: {} as RunRngState['streamStates'] },
      run,
      round: null,
      scene: emptyScene('Payout' as GameSaveSnapshot['activeScene']),
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

  test('round-trips seenTrailEventIds through save/restore', () => {
    const player = resetPlayerState();
    player.applyProfession('outlaw');
    player.seenTrailEventIds.add('wildflowers');
    player.seenTrailEventIds.add('bad_mosquitos');

    const snapshot = buildSaveSnapshot({ activeScene: 'RoundSelect' });
    expect(snapshot.run.seenTrailEventIds).toContain('wildflowers');
    expect(snapshot.run.seenTrailEventIds).toContain('bad_mosquitos');

    applySaveSnapshot(snapshot);
    const restored = getPlayerState();
    expect(restored.seenTrailEventIds.has('wildflowers')).toBe(true);
    expect(restored.seenTrailEventIds.has('bad_mosquitos')).toBe(true);
  });

  test('spyglass preview snapshot preserves pendingTrailEventId for reload', () => {
    const player = resetPlayerState();
    player.applyProfession('farmer');
    player.equipment = [item('scouts_spyglass')];
    player.seenTrailEventIds.add('wildflowers');
    player.pendingTrailEvent = getTrailEventById('wildflowers')!;

    const snapshot = buildSaveSnapshot({
      activeScene: 'TrailEvent',
      scene: {
        trailEvent: { eventId: 'wildflowers', resolved: false, spyglassRevealed: false },
      },
    });

    expect(snapshot.run.pendingTrailEventId).toBe('wildflowers');

    applySaveSnapshot(snapshot);
    const restored = getPlayerState();
    expect(restored.pendingTrailEvent?.id).toBe('wildflowers');
  });

  test('resolved trail event snapshot preserves result panel rebuild data', () => {
    resetPlayerState();
    const resolvedDisplay = {
      choiceId: 'endure',
      outcomeIndex: 0,
      gainedDiceIds: ['die-1'],
      enhancedDiceBeforeCount: 2,
      equipmentCountBeforeResolve: 1,
      negatedNegativeEffects: false,
      message: 'You press on.',
    };

    const snapshot = buildSaveSnapshot({
      activeScene: 'TrailEvent',
      scene: {
        trailEvent: {
          eventId: 'bad_mosquitos',
          resolved: true,
          spyglassRevealed: true,
          selectedChoiceId: 'endure',
          resolvedDisplay,
        },
      },
    });

    applySaveSnapshot(snapshot);
    const trail = getSceneState().trailEvent;
    expect(trail?.resolved).toBe(true);
    expect(trail?.resolvedDisplay).toEqual(resolvedDisplay);
  });

  test('restored TrailEvent snapshot keeps event excluded from future selection', () => {
    const player = resetPlayerState();
    player.applyProfession('farmer');
    player.leg = 1;
    player.seenTrailEventIds.add('wildflowers');

    const snapshot = buildSaveSnapshot({
      activeScene: 'TrailEvent',
      scene: {
        trailEvent: { eventId: 'wildflowers', resolved: false, spyglassRevealed: false },
      },
    });

    applySaveSnapshot(snapshot);
    const restored = getPlayerState();
    expect(restored.seenTrailEventIds.has('wildflowers')).toBe(true);

    for (let i = 0; i < 200; i++) {
      const picked = selectTrailEvent(Math.random);
      expect(picked.id).not.toBe('wildflowers');
    }
  });

  test('startRound clears restored ROLL state for the next blind', () => {
    resetPlayerState();
    const player = getPlayerState();
    player.applyProfession('farmer');
    player.finalizeRunSetup();

    const restored = new GameState();
    restored.startRound();
    restored.selectForRoll(restored.state.hand.map((d) => d.id));
    expect(restored.state.phase).toBe('ROLL');
    expect(restored.state.rolledDice.length).toBeGreaterThan(0);

    const nextBlind = new GameState({ targetMiles: player.targetMiles });
    nextBlind.startRound();
    expect(nextBlind.state.phase).toBe('SELECT');
    expect(nextBlind.state.rolledDice).toEqual([]);
    expect(nextBlind.state.hand.length).toBeGreaterThan(0);
  });
});
