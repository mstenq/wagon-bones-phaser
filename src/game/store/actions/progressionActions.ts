// ─── Run progression actions ───

import { HandType } from '../../types';
import { processEquipmentOnBossDefeat } from '../../EquipmentEffects';
import { GAMEPLAY } from '../../Constants';
import { getRunState, runStore } from '../runStore';
import { resolveEquipmentList } from '../resolve';
import { selectJourneyComplete } from '../selectors/runSelectors';
import { economyActions } from './economyActions';
import { selectShopRerollCost } from '../selectors/runSelectors';
import { canAfford } from '../economy';
import { equipmentActions } from './equipmentActions';

export const progressionActions = {
  recordHandPlayed(type: HandType): void {
    runStore.setState((s) => {
      const stats = s.handStats[type] ?? {
        level: 1,
        timesPlayed: 0,
        milesPerLevel: 10,
        multPerLevel: 1,
      };
      return {
        handStats: {
          ...s.handStats,
          [type]: { ...stats, timesPlayed: stats.timesPlayed + 1 },
        },
      };
    });
  },

  upgradeHandLevel(type: HandType, amount: number = 1): void {
    runStore.setState((s) => {
      const stats = s.handStats[type] ?? {
        level: 1,
        timesPlayed: 0,
        milesPerLevel: 10,
        multPerLevel: 1,
      };
      return {
        handStats: {
          ...s.handStats,
          [type]: { ...stats, level: stats.level + amount },
        },
      };
    });
  },

  downgradeHandLevel(type: HandType, amount: number = 1): void {
    runStore.setState((s) => {
      const stats = s.handStats[type] ?? {
        level: 1,
        timesPlayed: 0,
        milesPerLevel: 10,
        multPerLevel: 1,
      };
      return {
        handStats: {
          ...s.handStats,
          [type]: { ...stats, level: Math.max(1, stats.level - amount) },
        },
      };
    });
  },

  payShopReroll(): boolean {
    const state = getRunState();
    const cost = selectShopRerollCost(state);
    if (!canAfford(state, cost)) return false;
    const usedTagFreeReroll = state.tagFreeReroll && state.shopRerollCount === 0;
    economyActions.trySpend(cost);
    if (usedTagFreeReroll) {
      runStore.setState((s) => ({ tagFreeReroll: false, shopRerollCount: s.shopRerollCount + 1 }));
    } else {
      runStore.setState((s) => ({ shopRerollCount: s.shopRerollCount + 1 }));
    }
    equipmentActions.processOnShopReroll();
    return true;
  },

  resetShopRerolls(): void {
    runStore.setState({ shopRerollCount: 0, tagFreeReroll: false, bonusShopPermitId: null });
  },

  advanceRound(skipped: boolean = false): boolean {
    const state = getRunState();
    if (skipped) {
      runStore.setState({ roundsSkipped: state.roundsSkipped + 1 });
    } else if (state.round === GAMEPLAY.ROUNDS_PER_LEG) {
      processEquipmentOnBossDefeat(resolveEquipmentList());
    }

    let { leg, round, storyVictoryPending, endlessMode } = getRunState();
    round++;
    if (round > GAMEPLAY.ROUNDS_PER_LEG) {
      round = 1;
      const prevLeg = leg;
      leg++;
      if (prevLeg === GAMEPLAY.LEGS && !endlessMode) {
        storyVictoryPending = true;
      }
      runStore.setState({
        leg,
        round,
        storyVictoryPending,
        skippedRoundsThisLeg: [],
        skippedRoundTags: {},
        skippedRoundTagMeta: {},
        roundSkipPreviewTags: {},
        roundSkipPreviewMeta: {},
        bossRerollsUsedThisLeg: 0,
        currentLegPermitId: null,
        permitPurchasedThisLeg: false,
      });
    } else {
      runStore.setState({ round });
    }

    return selectJourneyComplete(getRunState());
  },
};
