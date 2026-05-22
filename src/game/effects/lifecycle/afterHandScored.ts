// ─── after-hand-scored lifecycle handlers ───

import { Die, HandDefinition, HandType, HandUpgradeInfo } from '../../types';
import type { EquipmentInstance } from '../../ItemsSystem';
import { getPlayerState } from '../../PlayerState';
import { checkLoadedChance } from '../../Constants';
import { forEachEquipmentResolved, resolveChance, resolveEffectParam } from '../helpers';
import { getRandomSupplyDef } from '../../ConsumablesSystem';
import hands from '../../../data/hands';

const HAND_TABLE: HandDefinition[] = hands;

function applyAfterHandScoredEffect(
  equip: EquipmentInstance,
  handType: HandType,
  equipment: EquipmentInstance[],
  upgrades: HandUpgradeInfo[],
): void {
  switch (equip.def.effectType) {
    case 'STATEFUL_ADD_MILES': {
      const decay = equip.def.effectParams.decayPerHand as number;
      equip.state.miles = Math.max(0, (equip.state.miles ?? 0) - decay);
      break;
    }
    case 'HAND_UPGRADE_CHANCE': {
      const p = equip.def.effectParams as Record<string, unknown>;
      const chance = resolveChance(p, getPlayerState().profession?.id);
      if (checkLoadedChance(chance, equipment)) {
        const player = getPlayerState();
        const stats = player.getHandStats(handType);
        const handDef = HAND_TABLE.find((h) => h.type === handType)!;
        const oldLevel = stats.level;
        const oldBaseMiles = handDef.baseMiles + stats.milesPerLevel * (oldLevel - 1);
        const oldBaseMult = handDef.baseMult + stats.multPerLevel * (oldLevel - 1);

        player.upgradeHandLevel(handType);

        const newLevel = stats.level;
        const newBaseMiles = handDef.baseMiles + stats.milesPerLevel * (newLevel - 1);
        const newBaseMult = handDef.baseMult + stats.multPerLevel * (newLevel - 1);

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
      const player = getPlayerState();
      const threshold = resolveEffectParam<number>(p, 'threshold', player.profession?.id);
      if (player.economy.balance <= threshold) {
        const supplyDef = getRandomSupplyDef();
        player.addConsumable(supplyDef);
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
