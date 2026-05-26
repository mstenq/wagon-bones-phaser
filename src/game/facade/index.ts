// ─── Game facade — blessed UI orchestration entry (No Phaser imports) ───

export { gameFacade } from './gameFacade';
export { gameRound, initRoundSession, startRoundSession } from './round';
export { gameRun } from './run';
export { gameConsumable } from './consumable';
export { gameBoss } from './boss';
export { gameDiceSelection } from './diceSelection';
export { gameEquipment } from './equipment';
export { gameDice } from './dice';
export { gameShop } from './shop';
export { gamePack } from './pack';
export { gameTrail } from './trail';
export { gameMeta } from './meta';
export * from './types';
export { enqueuePlayback, takePlayback, clearPlayback } from './playback';
