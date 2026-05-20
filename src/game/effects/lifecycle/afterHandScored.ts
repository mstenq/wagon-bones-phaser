// ─── after-hand-scored lifecycle handlers ───

import { effectRegistry } from '../registry';
import { getPlayerState } from '../../PlayerState';
import { checkLoadedChance } from '../../Constants';
import { getRandomSupplyDef } from '../../ConsumablesSystem';

effectRegistry.registerLifecycle('after-hand-scored', (equip, handType, _scoringDice) => {
  switch (equip.def.effectType) {
    case 'STATEFUL_ADD_MILES': {
      const decay = equip.def.effectParams.decayPerHand as number;
      equip.state.miles = Math.max(0, (equip.state.miles ?? 0) - decay);
      break;
    }
    case 'HAND_UPGRADE_CHANCE': {
      if (checkLoadedChance(equip.def.effectParams.chance as [number, number], equip.state as any)) {
        // Hand upgrade logic handled by caller
      }
      break;
    }
    case 'REPEAT_HAND_XMULT': {
      const handKey = `round_${handType}`;
      equip.state[handKey] = (equip.state[handKey] ?? 0) + 1;
      break;
    }
    case 'LOW_MONEY_SUPPLY': {
      const threshold = equip.def.effectParams.threshold as number;
      const player = getPlayerState();
      if (player.economy.balance <= threshold) {
        const supplyDef = getRandomSupplyDef();
        player.addConsumable(supplyDef);
      }
      break;
    }
  }
});
