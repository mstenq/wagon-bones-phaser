import './setup';
import { describe, expect, test } from 'bun:test';
import { die } from './testHelpers';
import { getPlayerState, resetPlayerState } from './testRunPlayer';
import { createFrontierConsumableDef } from '../ConsumablesSystem';
import { applyDiceSelectionEffect } from '../DiceSelectionSystem';
import {
  initPackLineup,
  reorderPackLineup,
  selectPackLineupDice,
  syncPackLineupAfterSelection,
} from '../visibleDiceRow';
import { sceneActions } from '../store/sceneStore';
import { getSceneState } from '../store/sceneStore';
import frontierEncountersData from '../../data/frontier_encounters';

function enterTestPack(lineupDieIds: string[] = []): void {
  sceneActions.enterBoosterPack({
    packDefId: 'test_pack',
    returnScene: 'Shop',
    queuedPackDefIds: [],
    contents: [],
    picksRemaining: 3,
    effectivePickCount: 3,
    usedCardIndices: [],
    lineupDieIds,
  });
}

describe('visibleDiceRow pack lineup', () => {
  test('initPackLineup seeds lineupDieIds in scene store', () => {
    resetPlayerState();
    const d1 = die({ value: 1 });
    const d2 = die({ value: 2 });
    const d3 = die({ value: 3 });
    getPlayerState().dice = [d1, d2, d3];

    enterTestPack();
    const dice = initPackLineup();

    expect(dice.length).toBeGreaterThan(0);
    expect(getSceneState().boosterPack?.lineupDieIds).toEqual(dice.map((d) => d.id));
    expect(selectPackLineupDice().map((d) => d.id)).toEqual(dice.map((d) => d.id));
  });

  test('reorderPackLineup reorders ids in scene store', () => {
    resetPlayerState();
    const d1 = die({ value: 1 });
    const d2 = die({ value: 2 });
    const d3 = die({ value: 3 });

    enterTestPack([d1.id, d2.id, d3.id]);
    reorderPackLineup(0, 2);

    expect(getSceneState().boosterPack?.lineupDieIds).toEqual([d2.id, d3.id, d1.id]);
  });

  test('syncPackLineupAfterSelection inserts copies beside source die', () => {
    resetPlayerState();
    const d1 = die({ value: 1 });
    const d2 = die({ value: 2, enhancement: 'lucky' });
    const d3 = die({ value: 3 });
    getPlayerState().dice = [d1, d2, d3];

    enterTestPack([d1.id, d2.id, d3.id]);

    const seeingDouble = frontierEncountersData.find((encounter) => encounter.id === 'seeing_double')!;
    const config = createFrontierConsumableDef(seeingDouble).diceSelection!;
    const result = applyDiceSelectionEffect(config, [d2]);
    syncPackLineupAfterSelection(result, [d2]);

    const ids = selectPackLineupDice().map((d) => d.id);
    expect(ids).toHaveLength(5);
    expect(ids[0]).toBe(d1.id);
    expect(ids[1]).toBe(d2.id);
    expect(ids[2]).toBe(result.addedDice![0]!.id);
    expect(ids[3]).toBe(result.addedDice![1]!.id);
    expect(ids[4]).toBe(d3.id);
  });

  test('selectPackLineupDice drops destroyed dice from visible row', () => {
    resetPlayerState();
    const d1 = die({ value: 1 });
    const d2 = die({ value: 2 });
    const d3 = die({ value: 3 });
    getPlayerState().dice = [d1, d3];

    enterTestPack([d1.id, d2.id, d3.id]);

    expect(selectPackLineupDice().map((d) => d.id)).toEqual([d1.id, d3.id]);
  });
});
