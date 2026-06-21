// ─── Run progression actions ───

import { HandType } from '../../types';
import { processEquipmentOnBossDefeat } from '../../EquipmentEffects';
import { GAMEPLAY } from '../../Constants';
import { recordSecretHandDiscovered } from '../../UserStats';
import { getSecretHandTypes } from '../../../data/hands';
import { getRunState, runStore } from '../runStore';
import { resolveEquipmentList } from '../resolve';
import { selectJourneyComplete } from '../selectors/runSelectors';
import { economyActions } from './economyActions';
import { selectShopRerollCost, selectShopRerollFreeSource, buildShopFreeRerollPlan } from '../selectors/runSelectors';
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

    if (getSecretHandTypes().includes(type)) {
      recordSecretHandDiscovered(type);
    }
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
    const freeSource = selectShopRerollFreeSource(state);
    economyActions.trySpend(cost);
    runStore.setState((s) => {
      const rerollIndex = s.shopRerollCount;
      let statusTraitTokens = s.statusTraitTokens;
      const next: Partial<typeof s> = { shopRerollCount: s.shopRerollCount + 1 };

      // Persist per-reroll free/paid history so cost growth doesn't depend on
      // how we rebuild future plans when tokens are acquired mid-shop.
      const nextPlan = [...s.shopFreeRerollPlan];
      while (nextPlan.length <= rerollIndex) nextPlan.push(null);
      nextPlan[rerollIndex] = freeSource;
      next.shopFreeRerollPlan = nextPlan;

      if (freeSource === 'tag') next.tagFreeReroll = false;

      if (freeSource === 'shop_pass') {
        const idx = statusTraitTokens.findIndex((t) => t.id === 'shop_pass');
        if (idx >= 0) {
          const token = statusTraitTokens[idx]!;
          const nextCopies = token.copies - 1;
          statusTraitTokens =
            nextCopies > 0
              ? statusTraitTokens.map((t, i) => (i === idx ? { ...t, copies: nextCopies } : t))
              : statusTraitTokens.filter((t) => t.id !== 'shop_pass');
        }
        next.statusTraitTokens = statusTraitTokens;
      }

      return { ...s, ...next };
    });
    equipmentActions.processOnShopReroll();
    return true;
  },

  resetShopRerolls(): void {
    runStore.setState((s) => {
      const next = {
        ...s,
        shopRerollCount: 0,
        tagFreeReroll: false,
        bonusShopPermitId: null,
      };
      return { ...next, shopFreeRerollPlan: buildShopFreeRerollPlan(next) };
    });
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
