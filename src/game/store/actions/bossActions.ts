// ─── Run boss assignment actions ───

import type { BossDef } from '../../types';
import bosses, { getEligibleBossesForLeg } from '../../../data/bosses';
import { GAMEPLAY } from '../../Constants';
import { rngPick } from '../../RunRng';
import { getRunState, runStore } from '../runStore';
import { economyActions } from './economyActions';
import { canAfford } from '../economy';
import { selectBossPermitRerollLimit, selectCanBossPermitReroll } from '../selectors/runSelectors';

export const bossActions = {
  assignBosses(): void {
    const bossAssignmentIds: string[] = [];
    const usedInFirstEight = new Set<string>();

    for (let leg = 1; leg <= GAMEPLAY.MAX_LEGS; leg++) {
      let eligible = getEligibleBossesForLeg(leg);

      if (leg <= GAMEPLAY.LEGS) {
        const unused = eligible.filter((b) => !usedInFirstEight.has(b.id));
        if (unused.length > 0) eligible = unused;
        else usedInFirstEight.clear();
      }

      if (eligible.length === 0) {
        bossAssignmentIds.push(bosses[0]!.id);
        continue;
      }
      const pick = rngPick('meta', eligible);
      if (leg <= GAMEPLAY.LEGS) usedInFirstEight.add(pick.id);
      bossAssignmentIds.push(pick.id);
    }

    runStore.setState({ bossAssignmentIds });
  },

  ensureBossAssignments(): void {
    const state = getRunState();
    if (state.bossAssignmentIds.length === 0) bossActions.assignBosses();
  },

  setBossForCurrentLeg(boss: BossDef): void {
    const state = getRunState();
    bossActions.ensureBossAssignments();
    const bossAssignmentIds = [...state.bossAssignmentIds];
    bossAssignmentIds[state.leg - 1] = boss.id;
    runStore.setState({ bossAssignmentIds });
  },

  rerollBossForLeg(leg: number = getRunState().leg): boolean {
    const state = getRunState();
    bossActions.ensureBossAssignments();
    const currentId = state.bossAssignmentIds[leg - 1];
    const current = currentId ? bosses.find((b) => b.id === currentId) : undefined;
    let eligible = getEligibleBossesForLeg(leg).filter((b) => b.id !== current?.id);

    if (leg <= GAMEPLAY.LEGS) {
      const usedElsewhere = new Set(
        state.bossAssignmentIds.map((id, i) => (i !== leg - 1 ? id : undefined)).filter((id): id is string => !!id),
      );
      const unused = eligible.filter((b) => !usedElsewhere.has(b.id));
      if (unused.length > 0) eligible = unused;
    }

    if (eligible.length === 0) return false;
    const pick = rngPick('meta', eligible);
    const bossAssignmentIds = [...state.bossAssignmentIds];
    bossAssignmentIds[leg - 1] = pick.id;
    runStore.setState({ bossAssignmentIds });
    return true;
  },

  restoreBossAssignments(ids: string[]): void {
    for (const id of ids) {
      const boss = bosses.find((b) => b.id === id);
      if (!boss) throw new Error(`Unknown boss id: ${id}`);
    }
    runStore.setState({ bossAssignmentIds: [...ids] });
  },

  tryBossPermitReroll(): boolean {
    const state = getRunState();
    if (!selectCanBossPermitReroll(state)) return false;
    if (!canAfford(state, GAMEPLAY.BOSS_REROLL_COST)) return false;
    if (!bossActions.rerollBossForLeg()) return false;
    economyActions.trySpend(GAMEPLAY.BOSS_REROLL_COST);
    const limit = selectBossPermitRerollLimit(state);
    if (limit !== -1) {
      runStore.setState({ bossRerollsUsedThisLeg: state.bossRerollsUsedThisLeg + 1 });
    }
    return true;
  },
};
