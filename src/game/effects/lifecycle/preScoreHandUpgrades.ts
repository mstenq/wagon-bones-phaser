// ─── Pre-score hand upgrades (Surveyor's Transit, …) ───
// Applied before hand level bonuses are added to the scored hand.

import type { EquipmentInstance } from '../../ItemsSystem';
import { checkLoadedChance } from '../../equipmentUtils';
import { applyHandLevelUpgrade } from '../../handStatsHelpers';
import { getRunState } from '../../store/runStore';
import { getRoundState } from '../../store/roundStore';
import type { HandType, HandUpgradeInfo } from '../../types';
import { forEachEquipmentResolved, resolveChance } from '../helpers';

export function processPreScoreHandUpgrades(equipment: EquipmentInstance[], handType: HandType): HandUpgradeInfo[] {
  const upgrades: HandUpgradeInfo[] = [];
  const run = getRunState();
  const roundDay = getRoundState()?.day ?? 1;

  forEachEquipmentResolved(
    equipment,
    (equip) => {
      switch (equip.def.effectType) {
        case 'HAND_UPGRADE_CHANCE': {
          const p = equip.def.effectParams as Record<string, unknown>;
          const chance = resolveChance(p, run.professionId ?? undefined);
          if (checkLoadedChance(chance, equipment)) {
            upgrades.push(applyHandLevelUpgrade(handType));
          }
          break;
        }
        case 'STEW': {
          if ((equip.state.roundsRemaining ?? 0) <= 0 || roundDay !== 1) break;
          const chance = (equip.def.effectParams.chance as [number, number]) ?? [1, 2];
          if (checkLoadedChance(chance, equipment)) {
            upgrades.push(applyHandLevelUpgrade(handType));
          }
          break;
        }
      }
    },
    'skip',
  );

  return upgrades;
}
