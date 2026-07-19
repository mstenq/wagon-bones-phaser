// ─── Run-level facade (No Phaser imports) ───

import { GAMEPLAY } from '../Constants';
import { getRandomSupplyDef, grantGhostMedicine } from '../ConsumablesSystem';
import { consumableActions } from '../store/actions/consumableActions';
import { milesToSave } from '../scoreMath';
import { computePayoutBreakdown } from '../runProgression';
import { processBossPayoutTags } from '../TagSystem';
import { resetAllGameStores } from '../store/resetAll';
import { getRunState, runStore } from '../store/runStore';
import { sceneActions } from '../store/sceneStore';
import { selectIsBossRound, selectProfession } from '../store/selectors/runSelectors';
import {
  selectRoundConfig,
  selectRoundDay,
  selectRoundTotalMiles,
  selectRerollsRemaining,
} from '../store/selectors/roundSelectors';
import { D } from '../scoreMath';
import type { PayoutSceneState } from './types';

export const gameRun = {
  resetAll(): void {
    resetAllGameStores();
  },

  /** Win-round payout: same data as GameScene.transitionAfterRoundEnd (without Phaser audio/scene.start). */
  preparePayoutPresentation(): PayoutSceneState {
    const run = getRunState();
    const daysRemaining = selectRoundConfig().maxDays - selectRoundDay();
    const rerollsRemaining = selectRerollsRemaining();
    const totalMiles = selectRoundTotalMiles() ?? D(0);
    const targetMiles = selectRoundConfig().targetMiles;
    const profMods = selectProfession(run)?.modifiers as Record<string, unknown> | undefined;
    if (profMods?.randomSupplyOnRoundEnd) {
      consumableActions.addConsumable(getRandomSupplyDef());
    }

    const payout = computePayoutBreakdown(run, daysRemaining, rerollsRemaining);

    let investmentBonus = 0;
    if (run.round === GAMEPLAY.ROUNDS_PER_LEG) {
      investmentBonus = processBossPayoutTags();
      if (profMods?.doubleTagOnBoss) {
        const state = getRunState();
        runStore.setState({ twinWagonCount: state.twinWagonCount + 1 });
      }
      if (profMods?.ghostMedicineOnBoss) {
        grantGhostMedicine();
      }
    }

    const state: PayoutSceneState = {
      breakdown: payout,
      presentation: {
        totalMilesSave: milesToSave(totalMiles),
        targetMilesSave: milesToSave(targetMiles),
        daysRemaining,
        rerollsRemaining,
        leg: run.leg,
        round: run.round,
        isVictory: selectIsBossRound(run) && run.leg === GAMEPLAY.LEGS && !run.endlessMode,
        investmentBonus,
      },
    };

    sceneActions.enterPayout(state);
    return state;
  },
};
