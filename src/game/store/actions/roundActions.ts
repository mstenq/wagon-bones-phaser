// ─── Round store actions (No Phaser imports) ───
// Active-round FSM; replaces GameState method ownership.

import {
  DEFAULT_CONFIG,
  type GameConfig,
  type HandResult,
  type HandType,
  type RoundState,
  type ScoreResult,
} from '../../types';
import { rollDice, rollDie, detectBestHand, createDie } from '../../DiceSystem';
import { buildHandDiceIds } from '../../handBuilding';
import { scoreHand } from '../../scoring/scoreHand';
import { multiplyScore, addScore, D, ZERO, floorScore, ceilScore, gte } from '../../scoreMath';
import {
  applyEquipmentEffects,
  getConfigModifiers,
  processEndOfRound,
  willEndLegRoundOnDayEnd,
  processHeldInHand,
  processEquipmentOnHandPlayed,
  processEquipmentAfterHandScored,
  processPreScoreHandUpgrades,
  processEquipmentOnReroll,
  processEquipmentOnDiceSpent,
  processEquipmentOnRoundStart,
  processEquipmentOnDayEnd,
  processEquipmentOnDayStart,
  findDeathPrevention,
  processGoldHeldAtRoundEnd,
  processBlueMoonHeldAtRoundEnd,
} from '../../EquipmentEffects';
import type { TrailGuideEatEvent } from '../../effects/lifecycle/onRoundStart';
import { DICE_STICKER_IDS } from '../../../data/dice_stickers';
import { getRandomSupplyDef } from '../../ConsumablesSystem';
import { createEmptyScoringMutations, mergeMutations, applyScoringMutations } from '../../effects/applyMutations';
import { rngPick } from '../../RunRng';
import { createEmptyModifiers, trailRoundEffectsFromModifiers } from '../../TrailEventsSystem';
import {
  getBossRoundConfigMods,
  getBossEquipmentDisplayOrder,
  initBossRoundState,
  resetBossRoundState,
  applyBossOnDayStart,
  applyBossAfterRoll,
  applyBossOnScore,
  applyBossAfterScore,
  getBossAdjustedHandStats,
  recordBossHandPlayed,
  previewBossScoreSelection,
  getBossRoundState,
  isBossScoreForfeit,
  applyBossTricksterDowngrade,
  initInspectorRollSize,
  getInspectorRollSizeForDay,
} from '../../BossEffectsSystem';
import { generateRandomEquipment, isEquipmentCursed } from '../../ItemsSystem';
import { getEquipmentPackExcludeIds } from '../../BoosterPackSystem';
import { applySurveyorsScopeScoring, getPermitAuraMultiplier } from '../../PermitsSystem';
import { acquireRewardEquipmentInstance } from '../../EquipmentModifiers';
import { pickGameRoundBackgroundIndex } from '../../roundBackgrounds';
import { getRunState, runActions } from '../runStore';
import { getRoundState, roundStore, createInitialRoundState, patchRoundStore } from '../roundStore';
import type { RoundRuntimeState, RoundSidebarOverlay } from '../types';
import type { Die } from '../../types';
import {
  legacyRoundStateToRuntime,
  resolveDiceByIds,
  rolledRefsToDice,
  syncDieValuesFromDice,
  syncDieValuesFromRefs,
} from '../roundResolve';
import {
  selectAvailableDice,
  selectEffectiveDays,
  selectEffectiveRerolls,
  selectHandStats,
  selectIsBossRound,
  selectTargetMiles,
} from '../selectors/runSelectors';
import { replaceEquipmentList, resolveConsumableList, resolveEquipmentList } from '../resolve';
import { diceActions } from './diceActions';
import { consumableActions } from './consumableActions';
import { progressionActions } from './progressionActions';
import { economyActions, syncPawnBrokerSellValueFromStore } from './economyActions';

function requireRound(): RoundRuntimeState {
  const round = getRoundState();
  if (!round) throw new Error('No active round in roundStore');
  return round;
}

function setRound(next: RoundRuntimeState): void {
  roundStore.setState(next, true);
}

function patchRound(partial: Partial<RoundRuntimeState>): void {
  patchRoundStore(partial);
}

function drawRandomHandIds(run = getRunState(), rollSize: number): string[] {
  const handIds = buildHandDiceIds({
    run,
    rollSize,
    priorityIds: run.priorityHandDiceIds,
    extraHandIds: run.pendingHandDiceIds,
  });

  if (run.priorityHandDiceIds.length > 0 || run.pendingHandDiceIds.length > 0) {
    runActions.patch({ priorityHandDiceIds: [], pendingHandDiceIds: [] });
  }

  return handIds;
}

function createInitialRound(config: GameConfig, run = getRunState()): RoundRuntimeState {
  const handDiceIds = drawRandomHandIds(run, config.rollSize);
  const available = selectAvailableDice(run);
  const dieValuesByDieId: Record<string, number> = {};
  for (const id of handDiceIds) {
    const d = available.find((die) => die.id === id);
    if (d) dieValuesByDieId[id] = d.value;
  }

  return {
    config: { ...config },
    phase: 'SELECT',
    day: 1,
    rerollsRemaining: config.maxRerolls,
    totalMiles: ZERO,
    spentDiceIds: [...run.spentDiceIds],
    handDiceIds,
    dieValuesByDieId,
    selectedForRollIds: [],
    rolledDice: [],
    selectedForScoreIds: [],
    currentHandType: null,
    handHistory: [],
    lastScoreResult: null,
  };
}

function removeEquipmentAtIndices(indices: number[]): void {
  if (indices.length === 0) return;
  const sorted = [...indices].sort((a, b) => b - a);
  const equipment = resolveEquipmentList();
  for (const idx of sorted) {
    if (idx < 0 || idx >= equipment.length) continue;
    if (isEquipmentCursed(equipment[idx]!)) continue;
    equipment.splice(idx, 1);
  }
  replaceEquipmentList(equipment);
}

function adjustDestructionIndices(
  animated: { sourceIdx: number; victimIdx: number }[],
  splicedIndices: number[],
): { sourceIdx: number; victimIdx: number }[] {
  const sorted = [...splicedIndices].sort((a, b) => a - b);
  return animated.map((d) => {
    let { sourceIdx, victimIdx } = d;
    for (const spliced of sorted) {
      if (spliced < sourceIdx) sourceIdx--;
      if (spliced < victimIdx) victimIdx--;
    }
    return { sourceIdx, victimIdx };
  });
}

function adjustEquipIndex(equipIndex: number, splicedIndices: number[]): number {
  let adjusted = equipIndex;
  const sorted = [...splicedIndices].sort((a, b) => a - b);
  for (const spliced of sorted) {
    if (spliced < adjusted) adjusted--;
  }
  return adjusted;
}

function adjustTrailGuideEatEvents(events: TrailGuideEatEvent[], splicedIndices: number[]): TrailGuideEatEvent[] {
  return events.map((event) => ({
    ...event,
    equipIndex: adjustEquipIndex(event.equipIndex, splicedIndices),
  }));
}

export const roundActions = {
  /** Legacy constructor behavior: initial SELECT hand without round-start hooks. */
  seedConstructorRound(config: Partial<GameConfig> = {}): void {
    const run = getRunState();
    const fullConfig: GameConfig = {
      ...DEFAULT_CONFIG,
      targetMiles: selectTargetMiles(run),
      ...config,
    };
    setRound(createInitialRound(fullConfig));
  },

  reset(): void {
    roundStore.setState(null, true);
  },

  clearRound(): void {
    roundStore.setState(null, true);
  },

  startFresh(): void {
    roundStore.setState(createInitialRoundState(), true);
  },

  hydrate(state: RoundRuntimeState): void {
    roundStore.setState(state, true);
  },

  patch(partial: Partial<RoundRuntimeState>): void {
    patchRoundStore(partial);
  },

  setSidebarOverlay(overlay: Partial<RoundSidebarOverlay> | null): void {
    roundStore.setState((round) => {
      if (!round) return round;
      if (overlay === null) return { ...round, sidebarOverlay: null };
      return { ...round, sidebarOverlay: { ...round.sidebarOverlay, ...overlay } };
    });
  },

  restoreRound(config: GameConfig, state: RoundState): void {
    setRound(legacyRoundStateToRuntime(config, state));
  },

  startRound(configOverride: Partial<GameConfig> = {}): void {
    const run = getRunState();
    let config: GameConfig = {
      ...DEFAULT_CONFIG,
      targetMiles: selectTargetMiles(run),
      ...configOverride,
    };

    const equipment = resolveEquipmentList();
    const mods = getConfigModifiers(equipment);
    const trailMods = run.trailEventModifiers;
    const wideSaddleBonus = run.wideSaddleBonus;

    runActions.patch({ wideSaddleBonus: 0 });

    config = {
      ...config,
      maxRerolls: selectEffectiveRerolls(run) + mods.rerollsBonus,
      maxDays: Math.max(1, selectEffectiveDays(run) - mods.daysPenalty),
      rollSize: Math.max(1, run.handSize + mods.rollSizeBonus - trailMods.handSizePenalty + wideSaddleBonus),
    };

    if (trailMods.scoreMultiplier !== 1.0) {
      config.targetMiles = ceilScore(multiplyScore(config.targetMiles, trailMods.scoreMultiplier));
    }
    if (trailMods.bossUpgradeMultiplier !== 1.0) {
      config.targetMiles = ceilScore(multiplyScore(config.targetMiles, trailMods.bossUpgradeMultiplier));
    }

    resetBossRoundState();
    initBossRoundState();
    const bossMods = getBossRoundConfigMods();
    if (bossMods.targetMilesMultiplier !== 1) {
      config.targetMiles = ceilScore(multiplyScore(config.targetMiles, bossMods.targetMilesMultiplier));
    }
    if (bossMods.setMaxRerolls !== null) {
      config.maxRerolls = bossMods.setMaxRerolls;
    }
    if (bossMods.setMaxDays !== null) {
      config.maxDays = bossMods.setMaxDays;
    }

    runActions.patch({
      trailRoundEffects: trailRoundEffectsFromModifiers(trailMods),
      trailEventModifiers: createEmptyModifiers(),
      statusTraitTokens: getRunState().statusTraitTokens.filter((t) => t.id !== 'all_in'),
      bossEffectDisabled: false,
      roundBackgroundIndex: pickGameRoundBackgroundIndex(),
    });

    applyBossOnDayStart(1);

    const dayStartEquipment = resolveEquipmentList();
    const dayOneStart = processEquipmentOnDayStart(dayStartEquipment);
    let priorityHandDiceIds = [...getRunState().priorityHandDiceIds, ...dayOneStart.priorityHandDiceIds];

    const roundStartEquipment = resolveEquipmentList();
    const roundStartEffects = processEquipmentOnRoundStart(roundStartEquipment, selectIsBossRound(getRunState()));
    removeEquipmentAtIndices([...roundStartEffects.destroyedIndices].sort((a, b) => b - a));

    const splicedIndices = roundStartEffects.destroyedIndices.sort((a, b) => a - b);
    const trailGuideEatEvents = adjustTrailGuideEatEvents(roundStartEffects.trailGuideEats, splicedIndices);
    if (trailGuideEatEvents.length > 0) {
      runActions.enqueuePlayback({ kind: 'round-start-trail-guide-eats', events: trailGuideEatEvents });
    }
    const destructionEntries = adjustDestructionIndices(roundStartEffects.animatedDestructions, splicedIndices);
    if (destructionEntries.length > 0) {
      runActions.enqueuePlayback({ kind: 'round-start-destructions', entries: destructionEntries });
    }

    let pendingJunkDealerCount = 0;
    if (roundStartEffects.equipmentToCreate > 0) {
      let created = 0;
      const freshRun = getRunState();
      const equip = resolveEquipmentList();
      const allowedRarities =
        roundStartEffects.equipmentCreateRarities.length > 0 ? roundStartEffects.equipmentCreateRarities : ['common'];
      const auraMultiplier = getPermitAuraMultiplier(freshRun.purchasedPermits);
      const ownedExcludeIds = getEquipmentPackExcludeIds(freshRun);
      const usedIds = new Set(ownedExcludeIds ?? []);
      for (let i = 0; i < roundStartEffects.equipmentToCreate; i++) {
        const used = equip.filter((e) => e.def.aura?.id !== 'ghost').length;
        if (used < freshRun.maxEquipmentSlots) {
          const rarity = rngPick('createRandomEquipment', allowedRarities);
          const def = generateRandomEquipment({
            rarity,
            auraMultiplier,
            excludeIds: usedIds.size > 0 ? [...usedIds] : undefined,
          });
          equip.push(acquireRewardEquipmentInstance(def, freshRun.purchasedPermits));
          if (ownedExcludeIds) usedIds.add(def.id);
          created++;
        }
      }
      replaceEquipmentList(equip);
      pendingJunkDealerCount = created;
    }
    if (pendingJunkDealerCount > 0) {
      runActions.enqueuePlayback({ kind: 'round-start-equipment-created', count: pendingJunkDealerCount });
    }

    const pendingNewDiceIds = [...getRunState().pendingNewDiceIds];
    for (let i = 0; i < roundStartEffects.stoneDiceToAdd; i++) {
      const addedStone = diceActions.addDie(createDie({ enhancement: 'stone' }));
      pendingNewDiceIds.push(addedStone.id);
    }

    if (roundStartEffects.daysBonus > 0) {
      config.maxDays += roundStartEffects.daysBonus;
    }
    if (roundStartEffects.loseAllRerolls) {
      config.maxRerolls = 0;
    }

    const pendingHandDiceIdsRound = [...getRunState().pendingHandDiceIds];
    for (let i = 0; i < roundStartEffects.stickerDiceToAdd; i++) {
      const sticker = rngPick('sticker', [...DICE_STICKER_IDS]);
      const added = diceActions.addDie(createDie({ sticker }));
      pendingNewDiceIds.push(added.id);
      pendingHandDiceIdsRound.push(added.id);
    }

    for (let i = 0; i < roundStartEffects.supplyCardsToAdd; i++) {
      consumableActions.addConsumable(getRandomSupplyDef());
    }

    runActions.patch({ pendingNewDiceIds, pendingHandDiceIds: pendingHandDiceIdsRound, priorityHandDiceIds });
    if (pendingNewDiceIds.length > 0) {
      runActions.enqueuePlayback({ kind: 'dice-added', dieIds: [...pendingNewDiceIds] });
    }
    runActions.patch({ pendingNewDiceIds: [], pendingAnimatedDestructions: [], pendingJunkDealerCount: 0 });

    initInspectorRollSize(config.rollSize);
    setRound(createInitialRound(config));
  },

  selectForRoll(diceIds: string[]): boolean {
    const round = requireRound();
    if (round.phase !== 'SELECT') return false;
    if (diceIds.length < 1 || diceIds.length > round.handDiceIds.length) return false;

    const handSet = new Set(round.handDiceIds);
    if (!diceIds.every((id) => handSet.has(id))) return false;

    const selected = resolveDiceByIds(diceIds, round);
    if (selected.length !== diceIds.length) return false;

    const rolledDice = rollDice(selected).map((d) => ({ id: d.id, value: d.value }));
    const dieValuesByDieId = syncDieValuesFromRefs(round.dieValuesByDieId, rolledDice);
    const currentHandType = detectBestHand(
      rolledRefsToDice(rolledDice, { ...round, rolledDice, dieValuesByDieId }),
    ).type;

    applyBossAfterRoll(rolledRefsToDice(rolledDice, { ...round, rolledDice, dieValuesByDieId }));

    patchRound({
      selectedForRollIds: diceIds,
      rolledDice,
      dieValuesByDieId,
      currentHandType,
      phase: 'ROLL',
    });
    return true;
  },

  canUseReroll(): boolean {
    const round = getRoundState();
    if (!round || round.rerollsRemaining <= 0) return false;
    const run = getRunState();
    if (round.day === 1 && run.trailRoundEffects.disableRerollDay1) return false;
    return true;
  },

  reroll(diceIds: string[]): boolean {
    const round = requireRound();
    if (round.phase !== 'ROLL') return false;
    if (diceIds.length === 0) return false;
    if (!roundActions.canUseReroll()) return false;

    const rolledDice = round.rolledDice.map((ref) => {
      if (!diceIds.includes(ref.id)) return ref;
      const die = resolveDiceByIds([ref.id], round)[0];
      if (!die) return ref;
      const rolled = rollDie(die);
      return { id: rolled.id, value: rolled.value };
    });

    const equipment = resolveEquipmentList();
    processEquipmentOnReroll(equipment, diceIds.length);
    replaceEquipmentList(equipment);

    const dieValuesByDieId = syncDieValuesFromRefs(round.dieValuesByDieId, rolledDice);
    const rolledAsDice = rolledRefsToDice(rolledDice, { ...round, rolledDice, dieValuesByDieId });

    patchRound({
      rolledDice,
      dieValuesByDieId,
      rerollsRemaining: round.rerollsRemaining - 1,
      currentHandType: detectBestHand(rolledAsDice).type,
    });
    return true;
  },

  selectForScore(diceIds: string[]): boolean {
    const round = requireRound();
    if (round.phase !== 'ROLL') return false;
    if (diceIds.length < 1 || diceIds.length > round.config.scoreSize) return false;

    const diceMap = new Map(round.rolledDice.map((r) => [r.id, r]));
    if (!diceIds.every((id) => diceMap.has(id))) return false;

    patchRound({
      selectedForScoreIds: diceIds,
      phase: 'SCORE',
    });
    return true;
  },

  validateScoreSelection(diceIds: string[]): { allowed: boolean; reason?: string; warning?: string } {
    const round = getRoundState();
    if (!round) return { allowed: false, reason: 'No active round' };
    const rolledIds = new Set(round.rolledDice.map((r) => r.id));
    const bountyLockedIds = getBossRoundState().lockedDiceIds.filter((id) => rolledIds.has(id));
    const missingBountyDie = bountyLockedIds.find((id) => !diceIds.includes(id));
    if (missingBountyDie) {
      return { allowed: false, reason: 'Marked die must be played' };
    }
    const selected = resolveDiceByIds(
      diceIds.filter((id) => rolledIds.has(id)),
      round,
    );
    if (selected.length !== diceIds.length) return { allowed: false, reason: 'Invalid dice selection' };
    const preview = previewBossScoreSelection(selected);
    return { allowed: true, warning: preview.warning ?? undefined };
  },

  cancelScore(): void {
    const round = getRoundState();
    if (!round || round.phase !== 'SCORE') return;
    patchRound({ phase: 'ROLL', selectedForScoreIds: [] });
  },

  calculateScore(options?: { deferConsumableGrants?: boolean }): ScoreResult | null {
    const round = requireRound();
    if (round.phase !== 'SCORE') return null;
    if (round.selectedForScoreIds.length === 0) return null;

    const selectedDice = resolveDiceByIds(round.selectedForScoreIds, round);
    const handResult: HandResult = detectBestHand(selectedDice);
    const handType = handResult.type as HandType;
    const preview = previewBossScoreSelection(selectedDice);
    const forfeit = isBossScoreForfeit(preview);

    const run = getRunState();

    if (forfeit) {
      const forfeitResult: ScoreResult = {
        handResult,
        totalValue: 0,
        miles: ZERO,
        mult: D(1),
        animEvents: [],
        mutations: createEmptyScoringMutations(),
      };

      runActions.patch({
        daysScored: run.daysScored + 1,
        statusTraitTokens: run.statusTraitTokens.filter((t) => t.id !== 'echo_of_the_damned'),
      });
      applyBossAfterScore();

      patchRound({
        currentHandType: handResult.type,
        handHistory: [...round.handHistory, handResult.type],
        phase: 'DAY_END',
        lastScoreResult: forfeitResult,
      });

      runActions.enqueuePlayback({ kind: 'score', result: forfeitResult });
      return forfeitResult;
    }

    const equipment = resolveEquipmentList();
    const displayOrder = getBossEquipmentDisplayOrder();
    const scoringEquipment =
      displayOrder && displayOrder.length === equipment.length
        ? displayOrder.map((index) => equipment[index]).filter((e): e is (typeof equipment)[number] => Boolean(e))
        : equipment;
    const hasOpenPalm = equipment.some((e) => e.def.effectType === 'ALL_DICE_SCORE');
    let scoringHandResult = handResult;
    if (hasOpenPalm) {
      scoringHandResult = { ...handResult, scoringDice: [...selectedDice] };
    }

    const tricksterDowngrade = applyBossTricksterDowngrade(handType);
    const { upgrades: preScoreHandUpgrades, misses: preScoreHandUpgradeMisses } = processPreScoreHandUpgrades(
      scoringEquipment,
      handType,
    );
    const stats = getBossAdjustedHandStats(handType, selectHandStats(getRunState(), handType));
    recordBossHandPlayed(handType);
    applyBossOnScore(handType, selectedDice);

    const levelBonus = stats.level - 1;
    const leveledResult = {
      ...scoringHandResult,
      baseMiles: addScore(scoringHandResult.baseMiles, D(stats.milesPerLevel * levelBonus)),
      baseMult: addScore(scoringHandResult.baseMult, D(stats.multPerLevel * levelBonus)),
    };

    processEquipmentOnHandPlayed(scoringEquipment, handType, scoringHandResult.scoringDice);

    const baseResult = scoreHand(leveledResult, scoringEquipment, {
      currentDay: round.day,
      maxDays: round.config.maxDays,
      allDice: run.dice,
      selectedForScoreDice: selectedDice,
    });

    const scoredIds = new Set(round.selectedForScoreIds);
    const rolledAsDice = rolledRefsToDice(round.rolledDice, round);
    const heldDice = rolledAsDice.filter((d) => !scoredIds.has(d.id));

    const heldResult = processHeldInHand(heldDice, scoringEquipment, handType);
    const heldMult = multiplyScore(addScore(baseResult.mult, heldResult.bonusMult), heldResult.xMult);
    const mergedMutations = createEmptyScoringMutations();
    mergeMutations(mergedMutations, baseResult.mutations);
    mergeMutations(mergedMutations, heldResult.mutations);
    const afterHeldResult: ScoreResult = {
      handResult: baseResult.handResult,
      totalValue: baseResult.totalValue,
      miles: multiplyScore(addScore(baseResult.handResult.baseMiles, baseResult.totalValue), heldMult),
      mult: heldMult,
      animEvents: [...baseResult.animEvents, ...heldResult.animEvents],
      mutations: mergedMutations,
    };

    const afterEquipmentResult = applyEquipmentEffects(afterHeldResult, scoringEquipment, {
      handResult: leveledResult,
      scoringDice: selectedDice,
      heldDice,
      rerollsRemaining: round.rerollsRemaining,
      equipmentCount: equipment.length,
      playerBalance: run.balance,
      currentDay: round.day,
      maxDays: round.config.maxDays,
      allDice: run.dice,
      handType,
      professionId: run.professionId,
    });

    const finalResult = applySurveyorsScopeScoring(
      afterEquipmentResult,
      handType,
      resolveConsumableList(),
      run.purchasedPermits,
    );

    applyScoringMutations(finalResult.mutations, {
      deferConsumableGrants: options?.deferConsumableGrants,
    });
    syncPawnBrokerSellValueFromStore(equipment);

    progressionActions.recordHandPlayed(handType);
    applyBossAfterScore();

    const postScoreHandUpgrades = processEquipmentAfterHandScored(scoringEquipment, handType);
    replaceEquipmentList(equipment);

    const allHandUpgrades = [
      ...(tricksterDowngrade ? [tricksterDowngrade] : []),
      ...preScoreHandUpgrades,
      ...postScoreHandUpgrades,
    ];
    if (preScoreHandUpgradeMisses.length > 0) {
      runActions.enqueuePlayback({ kind: 'hand-upgrade-misses', misses: preScoreHandUpgradeMisses });
    }
    if (allHandUpgrades.length > 0) {
      finalResult.handUpgrades = allHandUpgrades;
      runActions.enqueuePlayback({ kind: 'hand-upgrades', upgrades: allHandUpgrades });
    }

    runActions.patch({
      daysScored: run.daysScored + 1,
      statusTraitTokens: run.statusTraitTokens.filter((t) => t.id !== 'echo_of_the_damned'),
    });

    patchRound({
      currentHandType: handResult.type,
      handHistory: [...round.handHistory, handResult.type],
      totalMiles: round.totalMiles.plus(floorScore(finalResult.miles)),
      phase: 'DAY_END',
      lastScoreResult: finalResult,
    });

    runActions.enqueuePlayback({ kind: 'score', result: finalResult });
    return finalResult;
  },

  /** Gold / blue-moon held dice at leg end — mutations before playback enqueue. */
  processRoundEndHeldDice(round: RoundRuntimeState, outcome: 'won' | 'lost'): void {
    const scoredIds = new Set(round.selectedForScoreIds);
    const heldDice = rolledRefsToDice(round.rolledDice, round).filter((d) => !scoredIds.has(d.id));
    const equipment = resolveEquipmentList();
    const lastHandType = round.currentHandType;

    const goldHeld = processGoldHeldAtRoundEnd(heldDice, equipment);
    const blueMoonHeld =
      outcome === 'won'
        ? processBlueMoonHeldAtRoundEnd(heldDice, equipment, lastHandType)
        : { consumablesGranted: [] as string[], animEvents: [] };

    if (blueMoonHeld.consumablesGranted.length > 0) {
      const mutations = createEmptyScoringMutations();
      mutations.consumablesGranted.push(...blueMoonHeld.consumablesGranted);
      applyScoringMutations(mutations, { deferConsumableGrants: true });
    }

    if (goldHeld.moneyEarned > 0) {
      economyActions.earn(goldHeld.moneyEarned);
    }

    const events = [...goldHeld.animEvents, ...blueMoonHeld.animEvents];
    if (events.length > 0) {
      runActions.enqueuePlayback({ kind: 'score-events', events, label: 'round-end-held' });
    }
  },

  applyEndOfRoundDestructions(indices: number[]): void {
    const equipment = resolveEquipmentList();
    for (const idx of [...indices].sort((a, b) => b - a)) {
      if (equipment[idx]?.def.id === 'dynamite') {
        runActions.patch({ dynamiteSelfDestructed: true });
      }
      if (equipment[idx] && isEquipmentCursed(equipment[idx]!)) continue;
      equipment.splice(idx, 1);
    }
    replaceEquipmentList(equipment);
  },

  endDay(options?: { deferEquipmentDestructionAnimation?: boolean }): {
    outcome: 'next-day' | 'won' | 'lost';
    destroyedEquipment: string[];
    deferredDestroyIndices: number[];
  } {
    const round = requireRound();
    if (round.phase !== 'DAY_END') {
      return { outcome: 'lost', destroyedEquipment: [], deferredDestroyIndices: [] };
    }

    const equipment = resolveEquipmentList();
    const isLegRoundEnd = willEndLegRoundOnDayEnd(round, getRunState(), equipment);
    const endEffects = processEndOfRound(equipment, { isLegRoundEnd });
    const destroyedEquipment = endEffects.destroyedIndices.map((i) => equipment[i]?.def.name ?? '');
    const deferAnimation = options?.deferEquipmentDestructionAnimation ?? false;
    const deferredDestroyIndices = deferAnimation ? [...endEffects.destroyedIndices] : [];

    if (deferAnimation) {
      for (const idx of endEffects.destroyedIndices) {
        if (equipment[idx]?.def.id === 'dynamite') {
          runActions.patch({ dynamiteSelfDestructed: true });
        }
      }
      replaceEquipmentList(equipment);
    } else {
      for (const idx of [...endEffects.destroyedIndices].sort((a, b) => b - a)) {
        if (equipment[idx]?.def.id === 'dynamite') {
          runActions.patch({ dynamiteSelfDestructed: true });
        }
        if (equipment[idx] && isEquipmentCursed(equipment[idx]!)) continue;
        equipment.splice(idx, 1);
      }
      replaceEquipmentList(equipment);
    }

    const rolledIds = round.rolledDice.map((d) => d.id);
    const scoredIds = round.selectedForScoreIds;
    const scoredDice = resolveDiceByIds(scoredIds, round);
    const roundOver = gte(round.totalMiles, round.config.targetMiles) || round.day >= round.config.maxDays;

    diceActions.markDiceSpent(roundOver ? rolledIds : scoredIds);
    const equipmentAfterRoundEnd = resolveEquipmentList();
    processEquipmentOnDiceSpent(equipmentAfterRoundEnd, scoredDice);
    processEquipmentOnDayEnd(equipmentAfterRoundEnd);
    replaceEquipmentList(equipmentAfterRoundEnd);

    if (gte(round.totalMiles, round.config.targetMiles)) {
      runActions.patch({ spentDiceIds: [] });
      runActions.patch({ unusedRerollsTotal: getRunState().unusedRerollsTotal + round.rerollsRemaining });
      patchRound({ phase: 'ROUND_END' });
      roundActions.processRoundEndHeldDice(round, 'won');
      return { outcome: 'won', destroyedEquipment, deferredDestroyIndices };
    }

    if (round.day >= round.config.maxDays) {
      const preventIdx = findDeathPrevention(equipmentAfterRoundEnd, round.totalMiles, round.config.targetMiles);
      if (preventIdx < 0) {
        runActions.patch({ spentDiceIds: [] });
        patchRound({ phase: 'ROUND_END' });
        roundActions.processRoundEndHeldDice(round, 'lost');
        return { outcome: 'lost', destroyedEquipment, deferredDestroyIndices };
      }
      equipmentAfterRoundEnd.splice(preventIdx, 1);
      replaceEquipmentList(equipmentAfterRoundEnd);
    }

    const nextDay = round.day + 1;
    const inspectorRollSize = getInspectorRollSizeForDay(nextDay);
    const nextConfig = inspectorRollSize !== null ? { ...round.config, rollSize: inspectorRollSize } : round.config;

    const run = getRunState();
    if (selectAvailableDice(run).length < nextConfig.rollSize) {
      runActions.patch({ spentDiceIds: [] });
      patchRound({ phase: 'ROUND_END' });
      roundActions.processRoundEndHeldDice(round, 'lost');
      return { outcome: 'lost', destroyedEquipment, deferredDestroyIndices };
    }

    const perDayLoss = run.trailRoundEffects.moneyPerDayLoss;
    if (perDayLoss > 0) {
      economyActions.trySpend(perDayLoss);
    }

    applyBossOnDayStart(nextDay);

    const dayStartEquipment = resolveEquipmentList();
    const dayStartEffects = processEquipmentOnDayStart(dayStartEquipment);

    const scoredSet = new Set(scoredIds);
    const carryoverRefs = round.rolledDice.filter((r) => !scoredSet.has(r.id));
    const carryoverIds = carryoverRefs.map((r) => r.id);
    const handDiceIds = buildHandDiceIds({
      run,
      rollSize: nextConfig.rollSize,
      carryoverIds,
      priorityIds: dayStartEffects.priorityHandDiceIds,
    });

    const carryoverSet = new Set(carryoverIds);
    const refillDice = handDiceIds
      .filter((id) => !carryoverSet.has(id))
      .map((id) => selectAvailableDice(run).find((d) => d.id === id))
      .filter((d): d is Die => d != null);

    let dieValuesByDieId = syncDieValuesFromRefs(round.dieValuesByDieId, carryoverRefs);
    dieValuesByDieId = syncDieValuesFromDice(dieValuesByDieId, refillDice);

    patchRound({
      day: nextDay,
      config: nextConfig,
      phase: 'SELECT',
      handDiceIds,
      dieValuesByDieId,
      selectedForRollIds: [],
      rolledDice: [],
      selectedForScoreIds: [],
      currentHandType: null,
      spentDiceIds: [...getRunState().spentDiceIds],
    });

    return { outcome: 'next-day', destroyedEquipment, deferredDestroyIndices };
  },
};
