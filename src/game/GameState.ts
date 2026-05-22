// ─── GameState (No Phaser imports) ───
// Central state machine for a single round of Wagon Bones.
// Owns the round lifecycle: SELECT → ROLL → SCORE → DAY_END → (repeat or ROUND_END).
// Emits callbacks so the rendering layer can react to state changes.

import {
  Die,
  RoundState,
  GameConfig,
  DEFAULT_CONFIG,
  HandResult,
  ScoreResult,
  GameEventType,
  GameEventCallback,
  HandType,
} from './types';
import { rollDice, rollDie, detectBestHand, scoreHand, createDie, drawFromPouch } from './DiceSystem';
import { multiplyScore } from './scoreMath';
import { getPlayerState } from './PlayerState';
import {
  applyEquipmentEffects,
  getConfigModifiers,
  processEndOfRound,
  processHeldInHand,
  processEquipmentOnHandPlayed,
  processEquipmentAfterHandScored,
  processEquipmentOnReroll,
  processEquipmentOnDiceSpent,
  processEquipmentOnRoundStart,
  processEquipmentOnDayEnd,
  findDeathPrevention,
} from './EquipmentEffects';
import { getRandomSupplyDef } from './ConsumablesSystem';
import { createEmptyScoringMutations, mergeMutations } from './effects/applyMutations';
import { applyScoringMutations } from './effects/applyMutations';
import { createEmptyModifiers, trailRoundEffectsFromModifiers } from './TrailEventsSystem';
import {
  getBossRoundConfigMods,
  initBossRoundState,
  resetBossRoundState,
  applyBossOnDayStart,
  applyBossAfterRoll,
  applyBossOnScore,
  applyBossAfterScore,
  applyBossHandRestriction,
  getBossAdjustedHandStats,
  canPlayHandType,
  recordBossHandPlayed,
} from './BossEffectsSystem';
import { generateRandomEquipment } from './ItemsSystem';
import { acquireRewardEquipmentInstance } from './EquipmentModifiers';

export class GameState {
  config: GameConfig;
  state: RoundState;
  private listeners: Map<GameEventType, GameEventCallback[]> = new Map();

  constructor(config: Partial<GameConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = this.createInitialState();
  }

  // ─── Event System ───

  on(event: GameEventType, cb: GameEventCallback): void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event)!.push(cb);
  }

  off(event: GameEventType, cb: GameEventCallback): void {
    const cbs = this.listeners.get(event);
    if (cbs) {
      const idx = cbs.indexOf(cb);
      if (idx !== -1) cbs.splice(idx, 1);
    }
  }

  private emit(event: GameEventType, data?: unknown): void {
    const cbs = this.listeners.get(event);
    if (cbs) cbs.forEach((cb) => cb(data));
  }

  // ─── Initialization ───

  private createInitialState(): RoundState {
    const player = getPlayerState();
    const hand = this.drawRandomHand(player);
    return {
      phase: 'SELECT',
      day: 1,
      rerollsRemaining: this.config.maxRerolls,
      totalMiles: 0,
      spent: [...player.spentDice],
      hand,
      selectedForRoll: [],
      rolledDice: [],
      selectedForScore: [],
      currentHandType: null,
      handHistory: [],
    };
  }

  private drawRandomHand(player = getPlayerState()): Die[] {
    const available = player.availableDice;
    const drawCount = Math.min(this.config.rollSize, available.length);
    const drawn = drawFromPouch(available, drawCount).drawn;
    const handIds = new Set(drawn.map((d) => d.id));

    // Day 1: Mystery Crate dice are extra cards in hand (not Quarry Stone)
    for (const id of player.pendingHandDiceIds) {
      if (handIds.has(id)) continue;
      const die = available.find((d) => d.id === id);
      if (die) {
        drawn.push(die);
        handIds.add(id);
      }
    }
    player.pendingHandDiceIds = [];

    return drawn;
  }

  /** Restore mid-round state from a save without re-running round-start hooks. */
  restoreRound(config: GameConfig, state: RoundState): void {
    this.config = { ...config };
    this.state = {
      ...state,
      spent: [...state.spent],
      hand: [...state.hand],
      selectedForRoll: [...state.selectedForRoll],
      rolledDice: [...state.rolledDice],
      selectedForScore: [...state.selectedForScore],
      handHistory: [...state.handHistory],
    };
  }

  startRound(config?: Partial<GameConfig>): void {
    if (config) this.config = { ...this.config, ...config };

    // Apply equipment config modifiers (rerolls)
    const player = getPlayerState();
    const mods = getConfigModifiers(player.equipment);
    const trailMods = player.trailEventModifiers;
    const wideSaddleBonus = player.wideSaddleBonus;
    player.wideSaddleBonus = 0;

    this.config = {
      ...this.config,
      maxRerolls: player.effectiveRerolls + mods.rerollsBonus,
      maxDays: Math.max(1, player.effectiveDays - mods.daysPenalty),
      rollSize: Math.max(1, player.handSize + mods.rollSizeBonus - trailMods.handSizePenalty + wideSaddleBonus),
    };

    // Apply trail event: target miles multiplier (score multiplier means harder target)
    if (trailMods.scoreMultiplier !== 1.0) {
      this.config.targetMiles = Math.ceil(this.config.targetMiles * trailMods.scoreMultiplier);
    }

    // Apply trail event: boss upgrade multiplier
    if (trailMods.bossUpgradeMultiplier !== 1.0) {
      this.config.targetMiles = Math.ceil(this.config.targetMiles * trailMods.bossUpgradeMultiplier);
    }

    // Apply boss round modifiers (negated by Saint Elmo's Shield / Sheriff's Badge)
    resetBossRoundState();
    initBossRoundState();
    const bossMods = getBossRoundConfigMods();
    if (bossMods.targetMilesMultiplier !== 1) {
      this.config.targetMiles = Math.ceil(this.config.targetMiles * bossMods.targetMilesMultiplier);
    }
    if (bossMods.setMaxRerolls !== null) {
      this.config.maxRerolls = bossMods.setMaxRerolls;
    }
    if (bossMods.setMaxDays !== null) {
      this.config.maxDays = bossMods.setMaxDays;
    }

    // Persist round-duration trail penalties; clear pending modifiers
    player.trailRoundEffects = trailRoundEffectsFromModifiers(trailMods);
    player.trailEventModifiers = createEmptyModifiers();
    player.bossEffectDisabled = false;

    applyBossOnDayStart(1);

    // Process round-start equipment effects (Fading Memory decay, Lucky Number randomize, Funeral Pyre, etc.)
    const roundStartEffects = processEquipmentOnRoundStart(player.equipment, player.isBossRound);
    for (const idx of roundStartEffects.destroyedIndices.sort((a, b) => b - a)) {
      player.equipment.splice(idx, 1);
    }
    // Defer animated destructions for GameScene (Funeral Pyre, Haunted Totem, etc.)
    // Adjust indices to account for any non-animated destroys (destroyedIndices) that were already spliced
    const splicedIndices = roundStartEffects.destroyedIndices.sort((a, b) => a - b);
    player.pendingAnimatedDestructions = roundStartEffects.animatedDestructions.map((d) => {
      let { sourceIdx, victimIdx } = d;
      for (const spliced of splicedIndices) {
        if (spliced < sourceIdx) sourceIdx--;
        if (spliced < victimIdx) victimIdx--;
      }
      return { sourceIdx, victimIdx };
    });

    // Junk Dealer: create equipment and defer for animation
    if (roundStartEffects.equipmentToCreate > 0) {
      let created = 0;
      for (let i = 0; i < roundStartEffects.equipmentToCreate; i++) {
        if (player.usedEquipmentSlots < player.maxEquipmentSlots) {
          const def = generateRandomEquipment({ rarity: roundStartEffects.equipmentCreateRarity });
          player.equipment.push(acquireRewardEquipmentInstance(def, player.purchasedPermits));
          created++;
        }
      }
      player.pendingJunkDealerCount = created;
    } else {
      player.pendingJunkDealerCount = 0;
    }

    // Quarry Stone: add stone dice at round start
    for (let i = 0; i < roundStartEffects.stoneDiceToAdd; i++) {
      const stoneDie = createDie({ enhancement: 'stone' });
      const addedStone = player.addDie(stoneDie);
      player.pendingNewDiceIds.push(addedStone.id);
    }

    // Hardtack: +days, lose all rerolls
    if (roundStartEffects.daysBonus > 0) {
      this.config.maxDays += roundStartEffects.daysBonus;
    }
    if (roundStartEffects.loseAllRerolls) {
      this.config.maxRerolls = 0;
    }

    // Mystery Crate (and mirror/echo copies): add dice with random stickers at round start
    const mysteryStickers = ['purple_flower', 'red_bullet', 'golden_dollar', 'blue_moon'] as const;
    for (let i = 0; i < roundStartEffects.stickerDiceToAdd; i++) {
      const sticker = mysteryStickers[Math.floor(Math.random() * mysteryStickers.length)];
      const added = player.addDie(createDie({ sticker }));
      player.pendingNewDiceIds.push(added.id);
      player.pendingHandDiceIds.push(added.id);
    }

    // Supply Drop (and copies): create random supply cards at start of round
    for (let i = 0; i < roundStartEffects.supplyCardsToAdd; i++) {
      const supplyDef = getRandomSupplyDef();
      player.addConsumable(supplyDef);
    }

    this.state = this.createInitialState();
    this.emit('phase-change', this.state.phase);
    this.emit('hand-updated', this.state.hand);
  }

  // ─── SELECT Phase ───
  // No discards — player simply picks up to 5 dice from hand to roll.

  // ─── Transition to ROLL Phase ───

  /** Player confirms hand selection and moves to ROLL. Selects which dice to roll. */
  selectForRoll(diceIds: string[]): boolean {
    if (this.state.phase !== 'SELECT') {
      console.log('[DEBUG selectForRoll] BLOCKED: phase is', this.state.phase);
      return false;
    }
    if (diceIds.length < 1 || diceIds.length > this.state.hand.length) {
      console.log(
        '[DEBUG selectForRoll] BLOCKED: diceIds.length',
        diceIds.length,
        'hand.length',
        this.state.hand.length,
      );
      return false;
    }

    const selected = this.state.hand.filter((d) => diceIds.includes(d.id));
    if (selected.length !== diceIds.length) {
      const handIds = this.state.hand.map((d) => d.id);
      const missing = diceIds.filter((id) => !handIds.includes(id));
      const dupes = handIds.filter((id, i) => handIds.indexOf(id) !== i);
      console.log('[DEBUG selectForRoll] BLOCKED: selected', selected.length, 'vs diceIds', diceIds.length);
      console.log('[DEBUG selectForRoll] missing from hand:', missing);
      console.log('[DEBUG selectForRoll] duplicate IDs in hand:', [...new Set(dupes)]);
      return false;
    }

    this.state.selectedForRoll = selected;
    this.state.phase = 'ROLL';

    // Roll them
    this.state.rolledDice = rollDice(selected);
    this.state.currentHandType = detectBestHand(this.state.rolledDice).type;
    applyBossAfterRoll(this.state.rolledDice);
    this.emit('phase-change', this.state.phase);
    this.emit('dice-rolled', this.state.rolledDice);
    return true;
  }

  // ─── ROLL Phase ───

  /** True when rerolls remain and trail/day rules allow spending one (Heavy Fog: blocked on day 1 only). */
  canUseReroll(): boolean {
    if (this.state.rerollsRemaining <= 0) return false;
    const player = getPlayerState();
    if (this.state.day === 1 && player.trailRoundEffects.disableRerollDay1) return false;
    return true;
  }

  /** Re-roll specific dice during the ROLL phase. */
  reroll(diceIds: string[]): boolean {
    if (this.state.phase !== 'ROLL') return false;
    if (diceIds.length === 0) return false;
    if (!this.canUseReroll()) return false;

    const player = getPlayerState();
    this.state.rolledDice = this.state.rolledDice.map((d) => {
      if (diceIds.includes(d.id)) {
        return rollDie(d);
      }
      return d;
    });

    this.state.rerollsRemaining--;

    // Update stateful equipment on reroll (e.g. Worn Deck)
    processEquipmentOnReroll(player.equipment, diceIds.length);

    this.state.currentHandType = detectBestHand(this.state.rolledDice).type;
    this.emit('reroll-updated', this.state.rerollsRemaining);
    this.emit('dice-rolled', this.state.rolledDice);
    return true;
  }

  // ─── Transition to SCORE Phase ───

  /** Select which of the rolled dice to score. */
  selectForScore(diceIds: string[]): boolean {
    if (this.state.phase !== 'ROLL') return false;
    if (diceIds.length < 1 || diceIds.length > this.config.scoreSize) return false;

    // Preserve the caller's order (visual drag order from UI)
    const diceMap = new Map(this.state.rolledDice.map((d) => [d.id, d]));
    const selected = diceIds.map((id) => diceMap.get(id)).filter((d): d is Die => d !== undefined);
    if (selected.length !== diceIds.length) return false;

    this.state.selectedForScore = selected;
    this.state.phase = 'SCORE';
    this.emit('phase-change', this.state.phase);
    return true;
  }

  // ─── SCORE Phase ───

  /** Preview hand + boss legality before entering SCORE phase */
  validateScoreSelection(diceIds: string[]): { allowed: boolean; reason?: string } {
    const diceMap = new Map(this.state.rolledDice.map((d) => [d.id, d]));
    const selected = diceIds.map((id) => diceMap.get(id)).filter((d): d is Die => d !== undefined);
    if (selected.length !== diceIds.length) return { allowed: false, reason: 'Invalid dice selection' };
    const handResult = applyBossHandRestriction(detectBestHand(selected), selected);
    return canPlayHandType(handResult.type as HandType);
  }

  /** Revert to ROLL after a failed score (e.g. Call Girl duplicate hand) */
  cancelScore(): void {
    if (this.state.phase !== 'SCORE') return;
    this.state.phase = 'ROLL';
    this.emit('phase-change', this.state.phase);
  }

  /** Calculate score and advance to DAY_END. Returns the score result. */
  calculateScore(): ScoreResult | null {
    if (this.state.phase !== 'SCORE') return null;
    if (this.state.selectedForScore.length === 0) return null;

    const selectedDice = this.state.selectedForScore;
    let handResult: HandResult = detectBestHand(selectedDice);

    // Boss: River — non-straights downgrade to high card
    handResult = applyBossHandRestriction(handResult, selectedDice);

    const handType = handResult.type as HandType;
    const playCheck = canPlayHandType(handType);
    if (!playCheck.allowed) {
      console.log('[SCORE] Blocked by boss:', playCheck.reason);
      this.cancelScore();
      return null;
    }

    // Open Palm: all played dice count as scoring
    const hasOpenPalm = getPlayerState().equipment.some((e) => e.def.effectType === 'ALL_DICE_SCORE');
    if (hasOpenPalm) {
      handResult.scoringDice = [...this.state.selectedForScore];
    }

    this.state.currentHandType = handResult.type;
    this.state.handHistory.push(handResult.type);
    console.log(
      '[SCORE] Step 0: Hand detected:',
      handResult.name,
      '| baseMiles:',
      handResult.baseMiles,
      '| baseMult:',
      handResult.baseMult,
    );
    console.log(
      '[SCORE] Scoring dice:',
      this.state.selectedForScore
        .map((d) => `${d.id}(value:${d.value}, aura:${d.aura}, enh:${d.enhancement}, sticker:${d.sticker})`)
        .join(', '),
    );

    // Apply hand level scaling before scoring
    const player = getPlayerState();
    const stats = getBossAdjustedHandStats(handType, player.getHandStats(handType));

    recordBossHandPlayed(handType);
    applyBossOnScore(handType, selectedDice);

    // Each level above 1 adds milesPerLevel/multPerLevel from trail guide data
    const levelBonus = stats.level - 1;
    const leveledResult = {
      ...handResult,
      baseMiles: handResult.baseMiles + stats.milesPerLevel * levelBonus,
      baseMult: handResult.baseMult + stats.multPerLevel * levelBonus,
    };
    if (levelBonus > 0) {
      console.log(
        '[SCORE] Hand level:',
        stats.level,
        '| +miles/lvl:',
        stats.milesPerLevel * levelBonus,
        '| +mult/lvl:',
        stats.multPerLevel * levelBonus,
      );
    }
    console.log('[SCORE] After leveling: baseMiles:', leveledResult.baseMiles, '| baseMult:', leveledResult.baseMult);

    // Step 2: "On Played" items activate before scoring (Card Counter, Square Dance, etc.)
    processEquipmentOnHandPlayed(player.equipment, handType, this.state.selectedForScore);

    const baseResult = scoreHand(leveledResult, player.equipment, {
      currentDay: this.state.day,
      maxDays: this.config.maxDays,
      allDice: player.dice,
    });
    console.log(
      '[SCORE] After scoreHand: totalValue:',
      baseResult.totalValue,
      '| mult:',
      baseResult.mult,
      '| miles:',
      baseResult.miles,
    );

    // Determine held-in-hand dice (rolled but not scored)
    const scoredIds = new Set(this.state.selectedForScore.map((d) => d.id));
    const heldDice = this.state.rolledDice.filter((d) => !scoredIds.has(d.id));

    // Step 4: Process held-in-hand abilities (steel dice, held equipment)
    const heldResult = processHeldInHand(heldDice, player.equipment, handType);

    // Apply held-in-hand mult bonuses to the base result before independent equipment
    const heldMult = multiplyScore(baseResult.mult + heldResult.bonusMult, heldResult.xMult);
    const mergedMutations = createEmptyScoringMutations();
    mergeMutations(mergedMutations, baseResult.mutations);
    mergeMutations(mergedMutations, heldResult.mutations);
    const afterHeldResult: ScoreResult = {
      handResult: baseResult.handResult,
      totalValue: baseResult.totalValue,
      miles: multiplyScore(baseResult.handResult.baseMiles + baseResult.totalValue, heldMult),
      mult: heldMult,
      animEvents: [...baseResult.animEvents, ...heldResult.animEvents],
      mutations: mergedMutations,
    };
    console.log('[SCORE] After held-in-hand: mult:', afterHeldResult.mult, '| miles:', afterHeldResult.miles);

    // Step 5: Apply independent equipment effects (Dynamite, Horseshoe, auras, etc.)
    console.log(
      '[SCORE] Equipment:',
      player.equipment.map((e) => `${e.def.name}(${e.def.effectType}, aura:${e.def.aura?.id ?? 'none'})`).join(', ') ||
        'none',
    );
    const finalResult = applyEquipmentEffects(afterHeldResult, player.equipment, {
      handResult: leveledResult,
      scoringDice: this.state.selectedForScore,
      heldDice,
      rerollsRemaining: this.state.rerollsRemaining,
      equipmentCount: player.equipment.length,
      playerBalance: player.economy.balance,
      currentDay: this.state.day,
      maxDays: this.config.maxDays,
      allDice: player.dice,
      handType,
    });

    console.log('[SCORE] Final result: miles:', finalResult.miles, '| mult:', finalResult.mult);

    applyScoringMutations(finalResult.mutations);

    // Record hand played
    player.recordHandPlayed(handType);
    applyBossAfterScore();

    // Post-scoring equipment updates (Steam Engine decay, Surveyor's Transit, Repeat Offender, Emergency Supplies)
    const handUpgrades = processEquipmentAfterHandScored(player.equipment, handType);

    this.state.totalMiles += Math.floor(finalResult.miles);
    player.daysScored++;
    this.state.phase = 'DAY_END';
    if (handUpgrades.length > 0) {
      finalResult.handUpgrades = handUpgrades;
    }
    this.emit('score-calculated', finalResult);
    this.emit('phase-change', this.state.phase);
    return finalResult;
  }

  // ─── DAY_END ───

  /** Advance to next day or end the round. */
  endDay(): { outcome: 'next-day' | 'won' | 'lost'; destroyedEquipment: string[] } {
    if (this.state.phase !== 'DAY_END') return { outcome: 'lost', destroyedEquipment: [] };

    // Process end-of-round equipment effects (destruction only)
    // END_ROUND_MONEY is handled by the payout system, not here.
    const player = getPlayerState();
    const endEffects = processEndOfRound(player.equipment);
    // Capture destroyed equipment names before splicing
    const destroyedEquipment = endEffects.destroyedIndices.map((i) => player.equipment[i].def.name);
    for (const idx of endEffects.destroyedIndices) {
      if (player.equipment[idx]?.def.id === 'dynamite') {
        player.dynamiteSelfDestructed = true;
      }
    }
    // Destroy risky equipment (iterate in reverse to keep indices valid)
    for (const idx of endEffects.destroyedIndices.sort((a, b) => b - a)) {
      player.equipment.splice(idx, 1);
    }

    // Mark dice as spent:
    // - Normal day: only scored dice are spent (unscored stay available)
    // - Round over (won/lost): all rolled dice are spent (prevents gold dice farming)
    const rolledIds = this.state.rolledDice.map((d) => d.id);
    const scoredIds = this.state.selectedForScore.map((d) => d.id);
    const scoredDice = this.state.selectedForScore;
    const roundOver = this.state.totalMiles >= this.config.targetMiles || this.state.day >= this.config.maxDays;
    player.markDiceSpent(roundOver ? rolledIds : scoredIds);

    // Track enhanced dice spent (Bone Collector)
    processEquipmentOnDiceSpent(player.equipment, scoredDice);

    // Process day-end equipment effects (War Drums counter)
    processEquipmentOnDayEnd(player.equipment);

    if (this.state.totalMiles >= this.config.targetMiles) {
      // Round complete: refresh pouch for post-round scenes (payout/shop).
      player.spentDiceIds.clear();
      player.unusedRerollsTotal += this.state.rerollsRemaining;
      this.state.phase = 'ROUND_END';
      this.emit('round-won', { totalMiles: this.state.totalMiles, target: this.config.targetMiles });
      this.emit('phase-change', this.state.phase);
      return { outcome: 'won', destroyedEquipment };
    }

    if (this.state.day >= this.config.maxDays) {
      // Check for death prevention (Guardian Totem)
      const preventIdx = findDeathPrevention(player.equipment, this.state.totalMiles, this.config.targetMiles);
      if (preventIdx >= 0) {
        // Destroy the totem and continue
        player.equipment.splice(preventIdx, 1);
        this.emit('death-prevented', { totalMiles: this.state.totalMiles, target: this.config.targetMiles });
        // Don't end — give them one more day
      } else {
        // Round complete: refresh pouch for post-round scenes (game over/shop parity).
        player.spentDiceIds.clear();
        this.state.phase = 'ROUND_END';
        this.emit('round-lost', { totalMiles: this.state.totalMiles, target: this.config.targetMiles });
        this.emit('phase-change', this.state.phase);
        return { outcome: 'lost', destroyedEquipment };
      }
    }

    // Next day — fail if we cannot draw a full hand.
    if (player.availableDice.length < this.config.rollSize) {
      // Round complete: refresh pouch for post-round scenes (payout/shop parity).
      player.spentDiceIds.clear();
      this.state.phase = 'ROUND_END';
      this.emit('round-lost', { totalMiles: this.state.totalMiles, target: this.config.targetMiles });
      this.emit('phase-change', this.state.phase);
      return { outcome: 'lost', destroyedEquipment };
    }

    // Trail: per-day money loss when advancing to the next day
    const perDayLoss = player.trailRoundEffects.moneyPerDayLoss;
    if (perDayLoss > 0) {
      player.economy.spend(perDayLoss);
    }

    // Next day — keep unscored rolled dice on hand, fill the rest from pouch
    this.state.day++;
    applyBossOnDayStart(this.state.day);
    const scoredSet = new Set(scoredIds);
    const carryover = this.state.rolledDice.filter((d) => !scoredSet.has(d.id));
    const carryoverIds = new Set(carryover.map((d) => d.id));
    const needed = Math.max(0, this.config.rollSize - carryover.length);
    const refillPool = player.availableDice.filter((d) => !carryoverIds.has(d.id));
    const refill = needed > 0 ? drawFromPouch(refillPool, Math.min(needed, refillPool.length)).drawn : [];
    this.state.hand = [...carryover, ...refill];
    this.state.spent = [...player.spentDice];
    this.state.selectedForRoll = [];
    this.state.rolledDice = [];
    this.state.selectedForScore = [];
    this.state.currentHandType = null;

    // Rerolls are per-round (not per-day) — do NOT reset here

    this.state.phase = 'SELECT';
    this.emit('day-ended', { day: this.state.day });
    this.emit('phase-change', this.state.phase);
    this.emit('hand-updated', this.state.hand);
    return { outcome: 'next-day', destroyedEquipment };
  }
}
