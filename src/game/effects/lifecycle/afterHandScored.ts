// ─── after-hand-scored lifecycle handlers ───

import { Die, HandType, HandUpgradeInfo } from '../../types';
import type { EquipmentInstance } from '../../ItemsSystem';
import { walkEquipmentLifecycle } from '../../equipmentUtils';
import { resolveEffectParam } from '../helpers';
import { getRandomSupplyDef } from '../../ConsumablesSystem';
import { getRunState } from '../../store/runStore';
import { consumableActions } from '../../store/actions/consumableActions';

function applyAfterHandScoredEffect(equip: EquipmentInstance, handType: HandType): void {
  const run = getRunState();
  switch (equip.def.effectType) {
    case 'STATEFUL_ADD_MILES': {
      const decayRaw = (equip.def.effectParams as Record<string, unknown>).decayPerHand;
      const decay = typeof decayRaw === 'number' && Number.isFinite(decayRaw) ? decayRaw : 0;
      const currentMiles =
        typeof equip.state.miles === 'number' && Number.isFinite(equip.state.miles) ? equip.state.miles : 0;
      equip.state.miles = Math.max(0, currentMiles - decay);
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

  walkEquipmentLifecycle(equipment, ({ equip }) => applyAfterHandScoredEffect(equip, handType));

  return upgrades;
}
