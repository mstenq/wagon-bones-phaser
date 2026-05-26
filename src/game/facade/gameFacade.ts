import { gameBoss } from './boss';
import { gameConsumable } from './consumable';
import { gameDice } from './dice';
import { gameDiceSelection } from './diceSelection';
import { gameEquipment } from './equipment';
import { gameMeta } from './meta';
import { gamePack } from './pack';
import { gameRound } from './round';
import { gameRun } from './run';
import { gameShop } from './shop';
import { gameTrail } from './trail';

export const gameFacade = {
  round: gameRound,
  run: gameRun,
  consumable: gameConsumable,
  boss: gameBoss,
  diceSelection: gameDiceSelection,
  equipment: gameEquipment,
  dice: gameDice,
  shop: gameShop,
  pack: gamePack,
  trail: gameTrail,
  meta: gameMeta,
};
