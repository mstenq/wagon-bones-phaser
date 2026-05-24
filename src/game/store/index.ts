// ─── Game stores barrel (No Phaser imports) ───

export * from './types';
export { runStore, runActions, getRunState, subscribeRunState, createInitialRunState } from './runStore';
export {
  economyActions,
  diceActions,
  equipmentActions,
  consumableActions,
  tagActions,
  permitActions,
  bossActions,
  setupActions,
  progressionActions,
  shopActions,
  shopBuyActions,
} from './actions';
export * from './serialization';
export { roundActions } from './actions/roundActions';
export * from './resolve';
export * from './economy';
export {
  roundStore,
  getRoundState,
  subscribeRoundState,
  createInitialRoundState,
  patchRoundStore,
  type RoundStoreState,
} from './roundStore';
export { sceneStore, sceneActions, getSceneState, subscribeSceneState, createInitialSceneState } from './sceneStore';
export * from './selectors/index';
export {
  readRoundState,
  patchLegacyRoundState,
  getActiveRoundConfig,
  initRoundSession,
  startRoundSession,
} from './roundView';
export { computeRoundReward, computeTargetMiles, computePayoutBreakdown } from '../runProgression';
export type { ProfessionDef } from '../../data/professions';
export type { HandResult, ScoreResult, HandType, Die } from '../types';
export { resetAllGameStores } from './resetAll';
