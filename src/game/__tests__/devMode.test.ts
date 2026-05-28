import { describe, test, expect, afterEach } from 'bun:test';
import { devStartBossRound, isDevMode, setUrlDevModeForTests } from '../DevMode';
import { item, setupGame } from './testHelpers';
import { gameRound, getRoundState, getRunState } from '../store';
import { selectCurrentBoss } from '../store/selectors/runSelectors';
import { getBossRoundState } from '../BossEffectsSystem';

describe('isDevMode', () => {
  afterEach(() => {
    setUrlDevModeForTests(false);
  });

  test('false for non-developer when URL flag off', () => {
    setupGame({ profession: 'farmer' });
    expect(isDevMode()).toBe(false);
  });

  test('true for non-developer when URL flag on', () => {
    setUrlDevModeForTests(true);
    setupGame({ profession: 'farmer' });
    expect(isDevMode()).toBe(true);
  });

  test('true for developer profession without URL flag', () => {
    setupGame({ profession: 'developer' });
    expect(isDevMode()).toBe(true);
  });
});

describe('devStartBossRound', () => {
  test('clears stale round state before starting boss test', () => {
    const { game } = setupGame({ profession: 'developer' });
    game.startRound();
    expect(getRoundState()).not.toBeNull();

    const boss = devStartBossRound('the_land_slide');
    expect(boss?.id).toBe('the_land_slide');
    expect(getRoundState()).toBeNull();
    expect(getRunState().round).toBe(3);
  });

  test('fresh boss test session shuffles land slide equipment order', () => {
    const { game } = setupGame({
      profession: 'developer',
      equipment: [item('express_train'), item('deadeye'), item('wild_card'), item('worn_deck')],
    });
    game.startRound();
    const before = getRunState().equipment.map((e) => e.defId);

    const boss = devStartBossRound('the_land_slide');
    expect(boss?.id).toBe('the_land_slide');
    expect(getRunState().bossAssignmentIds[getRunState().leg - 1]).toBe('the_land_slide');
    expect(selectCurrentBoss(getRunState())?.id).toBe('the_land_slide');
    gameRound.beginRoundSession({ restored: false });

    const after = getRunState().equipment.map((e) => e.defId);
    expect(getBossRoundState().equipmentHidden).toBe(true);
    expect(after).not.toEqual(before);
  });
});
