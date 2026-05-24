// ─── after-hand-scored lifecycle handlers ───

import { Die, HandDefinition, HandType, HandUpgradeInfo } from '../../types';
import type { EquipmentInstance } from '../../ItemsSystem';
import { checkLoadedChance } from '../../equipmentUtils';
import { forEachEquipmentResolved, resolveChance, resolveEffectParam } from '../helpers';
import { getRandomSupplyDef } from '../../ConsumablesSystem';
import hands from '../../../data/hands';
import { getRunState } from '../../store/runStore';
import { selectHandStats } from '../../store/selectors/runSelectors';
import { progressionActions } from '../../store/actions/progressionActions';
import { consumableActions } from '../../store/actions/consumableActions';

const HAND_TABLE: HandDefinition[] = hands;

function applyAfterHandScoredEffect(
  equip: EquipmentInstance,
  handType: HandType,
  equipment: EquipmentInstance[],
  upgrades: HandUpgradeInfo[],
): void {
  const run = getRunState();
  switch (equip.def.effectType) {
    case 'STATEFUL_ADD_MILES': {
      const decay = equip.def.effectParams.decayPerHand as number;
      equip.state.miles = Math.max(0, (equip.state.miles ?? 0) - decay);
      break;
    }
    case 'HAND_UPGRADE_CHANCE': {
      const p = equip.def.effectParams as Record<string, unknown>;
      const chance = resolveChance(p, run.professionId ?? undefined);
      if (checkLoadedChance(chance, equipment)) {
        const stats = selectHandStats(run, handType);
        const handDef = HAND_TABLE.find((h) => h.type === handType)!;
        const oldLevel = stats.level;
        const oldBaseMiles = handDef.baseMiles + stats.milesPerLevel * (oldLevel - 1);
        const oldBaseMult = handDef.baseMult + stats.multPerLevel * (oldLevel - 1);

        progressionActions.upgradeHandLevel(handType);

        const newStats = selectHandStats(getRunState(), handType);
        const newLevel = newStats.level;
        const newBaseMiles = handDef.baseMiles + newStats.milesPerLevel * (newLevel - 1);
        const newBaseMult = handDef.baseMult + newStats.multPerLevel * (newLevel - 1);

        upgrades.push({
          handType,
          handName: handDef.name,
          oldLevel,
          newLevel,
          oldBaseMiles,
          newBaseMiles,
          oldBaseMult,
          newBaseMult,
        });
      }
      break;
    }
    case 'REPEAT_HAND_XMULT': {
      const handKey = `round_${handType}`;
      equip.state[handKey] = (equip.state[handKey] ?? 0) + 1;
      break;
    }
    case 'LOW_MONEY_SUPPLY': {
      const p = equip.def.effectParams as Record<string, unknown>;
      const threshold = resolveEffectParam<number>(p, 'threshold', run.professionId ?? undefined);
      if (run.balance <= threshold) {
        consumableActions.addConsumable(getRandomSupplyDef());
      }
      break;
    }
  }
}

export function processEquipmentAfterHandScored(
  equipment: EquipmentInstance[],
  handType: HandType,
  _scoringDice?: Die[],
): HandUpgradeInfo[] {
  const upgrades: HandUpgradeInfo[] = [];

  forEachEquipmentResolved(
    equipment,
    (equip) => applyAfterHandScoredEffect(equip, handType, equipment, upgrades),
    'skip',
  );

  return upgrades;
}
