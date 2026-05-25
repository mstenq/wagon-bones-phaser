// ─── GameScene ───
// Main round scene. Creates a GameState instance, subscribes to state changes,
// renders DRAW/ROLL/SCORE phases, dispatches player actions.
// Balatro-inspired layout: sidebar left, equipment top, dice center, pouch bottom-right.

import { Scene } from 'phaser';
import * as Phaser from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import {
  getActiveRoundConfig,
  initRoundSession,
  patchLegacyRoundState,
  readRoundState,
  startRoundSession,
} from '../../game/store/roundView';
import { getRoundHintContext } from '../../game/displayContext';
import { getRunState, runActions } from '../../game/store/runStore';
import { getRoundState } from '../../game/store/roundStore';
import { getSceneState, sceneActions } from '../../game/store/sceneStore';
import { enqueueConsumablePlayback } from '../../game/store/uiEffectHelpers';
import { roundActions } from '../../game/store/actions/roundActions';
import { milesToSave } from '../../game/scoreMath';
import { processBossPayoutTags, grantTag } from '../../game/TagSystem';
import { getTrailTagById } from '../../data/trail_tags';
import { grantGhostMedicine } from '../../game/ConsumablesSystem';
import { bindConsumableUiEffects } from '../store/consumableUiEffects';
import { Die, ScoreResult, HandType } from '../../game/types';
import { detectBestHand } from '../../game/DiceSystem';

import { diceActions } from '../../game/store/actions/diceActions';
import { economyActions } from '../../game/store/actions/economyActions';
import { resolveEquipmentList } from '../../game/store/resolve';
import { runHasLuckyNumberEquipment, getResolvedLoadedDieTarget, getRunHandStats } from '../../game/store/runReads';
import { selectAvailableDice } from '../../game/store/selectors/runSelectors';
import {
  selectHandStats,
  selectCurrentBoss,
  selectIsBossRound,
  selectProfession,
} from '../../game/store/selectors/runSelectors';
import { selectTargetMiles } from '../../game/store/selectors/runSelectors';
import { computePayoutBreakdown } from '../../game/runProgression';
import { addScore, D } from '../../game/scoreMath';
import { hasActiveTrailRoundEffects, trailRoundEffectsFromModifiers } from '../../game/TrailEventsSystem';
import { applyEquipmentModifierDestructions, processEquipmentModifiersEndOfRound } from '../../game/EquipmentModifiers';
import { isEquipmentLeased } from '../../game/ItemsSystem';
import { consumeNextRoundTags } from '../../game/TagSystem';
import { COLORS, TEXT_COLORS, FONTS, UI, GAMEPLAY, ANIM, DICE, MARQUEE } from '../../game/Constants';
import { DiceSprite } from '../ui/DiceSprite';
import { Button } from '../ui/Button';
import { Sidebar } from '../ui/Sidebar';
import { EquipmentBar } from '../ui/EquipmentBar';
import { ConsumableBar } from '../ui/ConsumableBar';
import { ConsumableDef, ConsumableInstance, executeConsumableEffect } from '../../game/ConsumablesSystem';
import {
  DiceSelectionConfig,
  applyDiceSelectionEffect,
  shouldUpdateDisplayedDiceValue,
} from '../../game/DiceSelectionSystem';
import { DicePouch } from '../ui/DicePouch';
import { createLayout } from '../ui/SceneLayout';
import { playRollAnimation } from '../animations/RollAnimation';
import { playDieAnimEvents, playScoreAnimation } from '../animations/ScoreAnimation';
import { processGoldHeldAtRoundEnd } from '../../game/EquipmentEffects';
import { playHandUpgradeAnimation } from '../animations/HandUpgradeAnimation';
import { ensureAuraTextures } from '../ui/AuraFX';
import {
  animateEquipmentFireDestruction,
  animateEquipmentFireDestructionSequence,
} from '../animations/EquipmentFireDestroyAnimation';
import { animateEquipmentPopIn } from '../animations/EquipmentPopInAnimation';
import { rngShuffle } from '../../game/RunRng';
import { getLoadedDiceMultiplier } from '../../game/equipmentUtils';
import { isDiceScoringDisabledByBoss, isDiceLockedByBoss, revealLandSlideHints } from '../../game/BossEffectsSystem';
import { isDevMode } from '../../game/DevMode';
import { getGameplayPreferences } from '../../game/GameplayPreferences';

const DICE_SPACING = UI.DICE_SPACING;

export class GameScene extends Scene {
  private roundSessionActive = false;
  private sidebar: Sidebar;
  private equipBar: EquipmentBar;
  private consumableBar: ConsumableBar;
  private dicePouch: DicePouch;

  // Layout helpers
  private contentCX: number = 0;
  private sidebarW: number = 0;

  // Dice sprites
  private rollSprites: DiceSprite[] = [];

  // Pre-roll hand row (SELECT phase)
  private playAreaSprites: DiceSprite[] = [];
  private playAreaY: number = 0;

  // Buttons
  private readyBtn: Button;
  private rollBtn: Button;
  private rerollBtn: Button;
  private scoreBtn: Button;
  private continueBtn: Button;
  private devWinBtn: Button | null = null;

  // Instruction text
  private instructionText: Phaser.GameObjects.Text;

  // Track selections
  private lockedDiceIds: Set<string> = new Set();

  // Sort controls
  private sortOrder: 'asc' | 'desc' = 'asc';
  private sortAscBtn: Button;
  private sortDescBtn: Button;

  // Animation lock
  private animating: boolean = false;

  /** Ambient fire sounds from equipment destruction — stopped on scene shutdown */
  private activeEquipDestroySounds: Phaser.Sound.BaseSound[] = [];

  // Drag-to-reorder (play area)
  private draggingSprite: DiceSprite | null = null;
  private wasDragging: boolean = false;
  private dragOffsetX: number = 0;
  private dragOffsetY: number = 0;
  private dragPrevX: number = 0;
  private dragVelocityX: number = 0;

  // Marquee lock selection (ROLL phase, empty-space drag)
  private rollMarqueeZone: Phaser.GameObjects.Zone | null = null;
  private marqueeGfx: Phaser.GameObjects.Graphics | null = null;
  private marqueeStartX: number = 0;
  private marqueeStartY: number = 0;
  private marqueeActive: boolean = false;
  private marqueePointerId: number | null = null;

  // Loaded die target control
  private loadedDiceValueBg: Phaser.GameObjects.Graphics;
  private loadedDiceValueText: Phaser.GameObjects.Text;
  private loadedDiceValueHitArea: Phaser.GameObjects.Zone;
  private loadedDiceDecBtn: Button;
  private loadedDiceIncBtn: Button;
  private loadedDicePicker: Phaser.GameObjects.Container | null = null;

  // Consumable targeting mode (inline dice selection for consumables like coffee_tin)
  private consumableTargeting: DiceSelectionConfig | null = null;
  private consumableTargetIds: Set<string> = new Set();
  private consumableConfirmBtn: Button | null = null;
  private consumableCancelBtn: Button | null = null;
  private savedInstructionText: string = '';
  private savedLockedDiceIds: Set<string> = new Set();

  constructor() {
    super('Game');
  }

  // Dice IDs to animate popping in on first draw phase (Mystery Crate, Quarry Stone, etc.)
  private pendingNewDiceIds: string[] = [];

  init(_data: Record<string, unknown> = {}) {
    // Round state lives in roundStore (hydrated by applySaveSnapshot or cleared between rounds).
    this.roundSessionActive = false;
  }

  /** Legacy die-object snapshot of active round (use patchRound for writes). */
  private rs() {
    return readRoundState();
  }

  private patchRound(
    partial: Parameters<typeof patchLegacyRoundState>[0],
    config?: Parameters<typeof patchLegacyRoundState>[1],
  ): void {
    patchLegacyRoundState(partial, config);
  }

  private takeDiceAddedUiEffects(): string[] {
    const effects = runActions.takeUiEffects((e) => e.kind === 'dice-added');
    return effects.flatMap((e) => (e.kind === 'dice-added' ? e.dieIds : []));
  }

  /** Consume one-shot round-start animations queued in the run store (with legacy save fallback). */
  private consumeRoundStartUiEffects(): void {
    const destructionEffects = runActions.takeUiEffects((e) => e.kind === 'round-start-destructions');
    for (const effect of destructionEffects) {
      if (effect.kind === 'round-start-destructions') {
        this.animateRoundStartDestructions(effect.entries);
      }
    }

    const createEffects = runActions.takeUiEffects((e) => e.kind === 'round-start-equipment-created');
    for (const effect of createEffects) {
      if (effect.kind === 'round-start-equipment-created') {
        this.animateJunkDealerCreation(effect.count);
      }
    }
  }

  create() {
    // Initialize game state only on first create (not on relayout)
    if (!this.roundSessionActive) {
      const run = getRunState();
      const restoredRound = getRoundState();
      if (restoredRound && getSceneState().activeScene === 'Game') {
        initRoundSession();
        this.roundSessionActive = true;
        this.pendingNewDiceIds = [];
        if (
          !hasActiveTrailRoundEffects(run.trailRoundEffects) &&
          hasActiveTrailRoundEffects(trailRoundEffectsFromModifiers(run.trailEventModifiers))
        ) {
          runActions.patch({
            trailRoundEffects: trailRoundEffectsFromModifiers(run.trailEventModifiers),
          });
        }
      } else {
        consumeNextRoundTags();
        initRoundSession({ targetMiles: selectTargetMiles(run) });
        startRoundSession({ targetMiles: selectTargetMiles(run) });
        this.roundSessionActive = true;
        // Pick up any dice added during leg transition or round start
        this.pendingNewDiceIds = this.takeDiceAddedUiEffects();
      }
      // Clear lock state from previous round (scene instance is reused)
      this.lockedDiceIds = new Set();
    }

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.destroyLoadedDicePicker();
      this.stopEquipDestroySounds();
      this.roundSessionActive = false;
    });

    this.setupDragHandlers();
    this.buildLayout(false);

    sceneActions.enterScene('Game');
    this.consumeRoundStartUiEffects();

    this.flashLeasedBadgeReminders();
  }

  /** Subtle leased-badge pulse at round start as an upkeep reminder. */
  private flashLeasedBadgeReminders(): void {
    for (const card of this.equipBar.getCards()) {
      const equip = card.equipment;
      if (equip && isEquipmentLeased(equip)) {
        card.flashLeasedPaid();
      }
    }
  }

  private buildLayout(isRelayout: boolean = false): void {
    const { height } = this.scale;

    const layout = createLayout(this, { bgKey: 'bg_1' });
    this.sidebar = layout.sidebar;
    this.equipBar = layout.equipBar;
    this.consumableBar = layout.consumableBar;
    this.consumableBar.setCanUsePredicate((def) => this.canUseConsumable(def));
    this.dicePouch = layout.dicePouch;
    this.sidebarW = layout.sidebarW;
    this.contentCX = layout.contentCX;

    this.equipBar.setHintRound(getRoundHintContext());
    this.equipBar.on('equipment-changed', () => {
      this.applyBossRollDiceState();
    });

    bindConsumableUiEffects(this, this.equipBar, {
      destroyDice: (diceIds) =>
        this.animateConsumableDiceDestruction(diceIds, {
          refillSelectHand: true,
          floatingText: `Raid destroyed ${diceIds.length} dice`,
        }),
    });

    this.consumableBar.on('consumable-used', (consumed: ConsumableInstance) => {
      void this.handleConsumableUsed(consumed);
    });

    // Instruction text
    this.instructionText = this.add
      .text(this.contentCX, height - 60, '', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '16px',
        color: TEXT_COLORS.SECONDARY,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(50);

    this.buildLoadedDiceControl();

    // Create buttons (all hidden initially)
    const btnY = height - 30;
    this.readyBtn = new Button(this, this.contentCX, btnY, 'Roll Selected', 200, 40).onClick(() =>
      this.onReadyToRoll(),
    );
    this.rollBtn = new Button(this, this.contentCX, btnY, 'Roll!', 160, 40).onClick(() => this.onRoll());
    this.scoreBtn = new Button(this, this.contentCX - 110, btnY, 'Score Hand', 160, 40).onClick(() => this.onScore());
    this.rerollBtn = new Button(this, this.contentCX + 110, btnY, 'Re-roll All', 200, 40).onClick(() =>
      this.onReroll(),
    );
    this.continueBtn = new Button(this, this.contentCX, btnY, 'Continue', 160, 40).onClick(() => this.onContinue());

    if (isDevMode()) {
      const devBtnX = this.scale.width - 70;
      this.devWinBtn = new Button(this, devBtnX, 280, 'Dev Win', 120, 32)
        .setColor(0x553388, 0x7744aa)
        .onClick(() => this.onDevWinRound());
      this.devWinBtn.setDepth(100);
    } else {
      this.devWinBtn = null;
    }

    // Sort buttons (small, positioned above the main buttons)
    const sortY = btnY - 50;
    this.sortAscBtn = new Button(this, this.contentCX - 50, sortY, '↑ Low', 80, 28).onClick(() =>
      this.setSortOrder('asc'),
    );
    this.sortDescBtn = new Button(this, this.contentCX + 50, sortY, '↓ High', 80, 28).onClick(() =>
      this.setSortOrder('desc'),
    );

    const hudDepth = 50;
    for (const btn of [
      this.readyBtn,
      this.rollBtn,
      this.scoreBtn,
      this.rerollBtn,
      this.continueBtn,
      this.sortAscBtn,
      this.sortDescBtn,
    ]) {
      btn.setDepth(hudDepth);
    }

    this.hideAllButtons();

    // Re-enter current phase
    this.enterCurrentPhase(isRelayout);

    EventBus.emit(Events.SCENE_READY, this);
  }

  private enterCurrentPhase(isRelayout: boolean = false): void {
    const phase = this.rs().phase;
    if (phase === 'SELECT') {
      this.enterDrawPhase(false, null, { autoRoll: !isRelayout });
    } else if (phase === 'ROLL') {
      this.enterRollPhaseLayout();
    } else if (phase === 'SCORE' || phase === 'DAY_END') {
      this.enterRollPhaseLayout();
      // Auto-advance on DAY_END (scoring already handled)
      if (phase === 'DAY_END') {
        this.onContinue();
      }
    } else {
      this.enterDrawPhase(false, null, { autoRoll: !isRelayout });
    }
    this.updateHUD();
  }

  private onResize(): void {
    // Preserve game state, destroy all display objects, rebuild layout
    this.rollSprites = [];
    this.playAreaSprites = [];
    this.children.removeAll(true);
    this.buildLayout(true);
  }

  // ─── Phase Rendering ───

  private enterDrawPhase(
    animateFromPouch: boolean = false,
    carryoverPositions: Map<string, { x: number; y: number; rotation: number }> | null = null,
    options: { autoRoll?: boolean } = {},
  ): void {
    this.clearSprites();
    this.hideAllButtons();
    roundActions.setSidebarOverlay({
      handName: '',
      handLevel: 0,
      milesBaseSave: milesToSave(0),
      multSave: milesToSave(0),
    });
    this.enterDrawPhaseLayout(animateFromPouch, carryoverPositions, options);
  }

  /** Show the actual SELECT phase UI (called after refresh prompt is resolved or not needed) */
  private enterDrawPhaseLayout(
    animateFromPouch: boolean = false,
    carryoverPositions: Map<string, { x: number; y: number; rotation: number }> | null = null,
    options: { autoRoll?: boolean } = {},
  ): void {
    const { height } = this.scale;
    this.playAreaY = height * UI.ROLL_Y_RATIO;

    const hand = this.rs().hand;
    this.playAreaSprites = this.createDiceRow(hand, this.playAreaY);
    for (const sprite of this.playAreaSprites) {
      this.setupPlayAreaSprite(sprite);
      sprite.disableInteractive();
    }

    if (animateFromPouch && this.playAreaSprites.length > 0) {
      const launch = this.getDicePouchLaunchPoint();
      this.animating = true;
      let completed = 0;
      let newDiceIndex = 0;
      const onPouchAnimDone = () => {
        this.animating = false;
        if (options.autoRoll) this.maybeAutoRollFirstHand();
      };
      for (let i = 0; i < this.playAreaSprites.length; i++) {
        const sprite = this.playAreaSprites[i];
        const finalX = sprite.x;
        const finalY = sprite.y;
        const finalRot = sprite.rotation;
        const carry = carryoverPositions?.get(sprite.dieData.id);
        const isCarryover = Boolean(carry);
        if (carry) {
          sprite.setPosition(carry.x, carry.y);
          sprite.rotation = carry.rotation;
          sprite.setAlpha(1);
          sprite.setScale(1);
        } else {
          sprite.setPosition(launch.x, launch.y);
          sprite.rotation = 0;
          sprite.setAlpha(0);
          sprite.setScale(0.2);
        }

        this.tweens.add({
          targets: sprite,
          x: finalX,
          y: finalY,
          rotation: finalRot,
          alpha: 1,
          scaleX: 1,
          scaleY: 1,
          duration: 320,
          delay: isCarryover ? 0 : newDiceIndex++ * 90,
          ease: 'Back.easeOut',
          onStart: () => {
            if (!isCarryover) this.sound.play('sfx_card1', { volume: 0.35 });
          },
          onComplete: () => {
            completed++;
            if (completed >= this.playAreaSprites.length) {
              onPouchAnimDone();
            }
          },
        });
      }
    }

    // Animate mystery crate dice appearing
    if (this.pendingNewDiceIds.length > 0) {
      this.animateNewDiceAppearing();
      this.pendingNewDiceIds = [];
    }

    // Show roll button
    this.readyBtn.setVisible(true);
    this.updateDrawButtons();

    const spent = this.rs().spent.length;
    this.instructionText.setText(`Roll ${hand.length} drawn dice (${spent} spent)`);

    this.updateHUD();

    if (options.autoRoll && !animateFromPouch) {
      this.time.delayedCall(0, () => this.maybeAutoRollFirstHand());
    }
  }

  /** Auto-roll when the preference is on and the player is in the pre-roll SELECT phase. */
  private maybeAutoRollFirstHand(): void {
    if (!getGameplayPreferences().autoRollFirstHand) return;
    if (this.animating) return;
    if (this.rs().phase !== 'SELECT') return;
    if (this.rs().hand.length === 0) return;
    this.onReadyToRoll();
  }

  private enterRollPhase(): void {
    this.clearSprites();
    this.lockedDiceIds.clear();
    this.hideAllButtons();

    // Create sprites for rolled dice
    const rolled = this.rs().rolledDice;
    this.rollSprites = this.createDiceRow(rolled, this.scale.height * UI.ROLL_Y_RATIO);

    // Play roll animation
    this.animating = true;
    playRollAnimation(this, this.rollSprites, rolled, () => {
      this.animating = false;
      this.sortAndRepositionDice();
      this.setupRollSpriteInteraction();
      this.setupRollMarqueeZone();

      this.rerollBtn.setVisible(true);
      this.scoreBtn.setVisible(true);
      this.showSortButtons();
      this.updateRollButtons();

      this.instructionText.setText('Lock dice you want to keep, then re-roll the rest');
      this.applyBossRollDiceState();
    });

    this.updateHUD();
  }

  /** Bounty lock + boss-disabled visuals on rolled dice */
  private applyBossRollDiceState(): void {
    for (const sprite of this.rollSprites) {
      const id = sprite.dieData.id;
      sprite.setDisabled(isDiceScoringDisabledByBoss(sprite.dieData));
      if (isDiceLockedByBoss(id)) {
        this.lockedDiceIds.add(id);
      }
    }
    this.syncSelectedForScore();
    this.repositionRollDice(true);
    this.updateRollButtons();
  }

  /** Toggle lock state for one rolled die (click or marquee batch). */
  private toggleDiceLock(sprite: DiceSprite, playSound = true, updateButtons = true): void {
    if (this.consumableTargeting) return;
    const id = sprite.dieData.id;
    if (isDiceLockedByBoss(id)) return;

    if (this.lockedDiceIds.has(id)) {
      this.lockedDiceIds.delete(id);
      if (playSound) this.sound.play('sfx_card_slide2', { volume: 0.25 });
    } else {
      this.lockedDiceIds.add(id);
      if (playSound) this.sound.play('sfx_highlight1', { volume: 0.3 });
    }
    const lockIdx = this.rollSprites.indexOf(sprite);
    if (lockIdx >= 0) this.animateRollDieLockLift(sprite, lockIdx);
    this.syncSelectedForScore();
    if (updateButtons) this.updateRollButtons();
  }

  private syncSelectedForScore(): void {
    this.patchRound({
      selectedForScore: this.rs().rolledDice.filter((d) => this.lockedDiceIds.has(d.id)),
    });
  }

  /** Shared: wire up click handlers on roll sprites (click to lock/unlock, drag to reorder) */
  private setupRollSpriteInteraction(): void {
    for (let i = 0; i < this.rollSprites.length; i++) {
      const sprite = this.rollSprites[i];
      this.input.setDraggable(sprite);

      sprite.on('pointerdown', () => {
        this.wasDragging = false;
      });

      sprite.on('pointerup', () => {
        if (this.wasDragging || this.animating || this.marqueeActive) return;

        // Consumable targeting mode takes over click behavior
        if (this.consumableTargeting) {
          this.onConsumableTargetClick(sprite);
          return;
        }

        this.toggleDiceLock(sprite);
      });
    }
  }

  private canUseMarquee(): boolean {
    return !this.animating && !this.consumableTargeting && this.rollSprites.length > 0 && this.rs().phase === 'ROLL';
  }

  private getRollMarqueeZoneBounds(): { width: number; height: number; cx: number; cy: number } {
    const width = this.scale.width - this.sidebarW;
    const height = this.scale.height - MARQUEE.BOTTOM_RESERVE;
    return { width, height, cx: this.contentCX, cy: height / 2 };
  }

  private createRollMarqueeZone(): void {
    this.destroyRollMarqueeZone();
    const { width, height, cx, cy } = this.getRollMarqueeZoneBounds();
    this.rollMarqueeZone = this.add.zone(cx, cy, width, height).setDepth(MARQUEE.ZONE_DEPTH).setInteractive();
  }

  private setupRollMarqueeZone(): void {
    this.createRollMarqueeZone();
    if (!this.rollMarqueeZone) return;

    this.rollMarqueeZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this.canUseMarquee()) return;

      this.marqueeStartX = pointer.worldX;
      this.marqueeStartY = pointer.worldY;
      this.marqueePointerId = pointer.id;
      this.marqueeActive = false;

      this.input.on('pointermove', this.onMarqueePointerMove);
      this.input.on('pointerup', this.onMarqueePointerUp);
    });
  }

  private onMarqueePointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (this.marqueePointerId === null || pointer.id !== this.marqueePointerId) return;

    const dx = pointer.worldX - this.marqueeStartX;
    const dy = pointer.worldY - this.marqueeStartY;
    if (!this.marqueeActive && Math.hypot(dx, dy) < this.input.dragDistanceThreshold) return;

    this.marqueeActive = true;
    this.wasDragging = true;
    this.drawMarqueeGfx(this.marqueeStartX, this.marqueeStartY, pointer.worldX, pointer.worldY);
  };

  private onMarqueePointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (this.marqueePointerId === null || pointer.id !== this.marqueePointerId) return;

    this.input.off('pointermove', this.onMarqueePointerMove);
    this.input.off('pointerup', this.onMarqueePointerUp);

    if (this.marqueeActive) {
      const rect = this.getMarqueeRect(this.marqueeStartX, this.marqueeStartY, pointer.worldX, pointer.worldY);
      const hits = this.getDiceInMarquee(rect);
      let playSound = true;
      for (const sprite of hits) {
        this.toggleDiceLock(sprite, playSound, false);
        playSound = false;
      }
      if (hits.length > 0) this.updateRollButtons();
    }

    this.cleanupMarquee();
  };

  private drawMarqueeGfx(x1: number, y1: number, x2: number, y2: number): void {
    if (!this.marqueeGfx) {
      this.marqueeGfx = this.add.graphics().setDepth(MARQUEE.GFX_DEPTH);
    }
    const rect = this.getMarqueeRect(x1, y1, x2, y2);
    this.marqueeGfx.clear();
    this.marqueeGfx.fillStyle(DICE.SELECTED_STROKE, MARQUEE.FILL_ALPHA);
    this.marqueeGfx.fillRect(rect.x, rect.y, rect.width, rect.height);
    this.marqueeGfx.lineStyle(2, DICE.SELECTED_STROKE, 1);
    this.marqueeGfx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  }

  private getDiceWorldBounds(sprite: DiceSprite): Phaser.Geom.Rectangle {
    const half = DICE.SIZE / 2;
    return new Phaser.Geom.Rectangle(sprite.x - half, sprite.y - half, DICE.SIZE, DICE.SIZE);
  }

  private getMarqueeRect(x1: number, y1: number, x2: number, y2: number): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  }

  private getDiceInMarquee(rect: Phaser.Geom.Rectangle): DiceSprite[] {
    const hits: DiceSprite[] = [];
    for (const sprite of this.rollSprites) {
      if (Phaser.Geom.Rectangle.Overlaps(rect, this.getDiceWorldBounds(sprite))) {
        hits.push(sprite);
      }
    }
    return hits;
  }

  private cleanupMarquee(): void {
    this.marqueeGfx?.clear();
    this.marqueeActive = false;
    this.marqueePointerId = null;
  }

  private destroyRollMarqueeZone(): void {
    this.input.off('pointermove', this.onMarqueePointerMove);
    this.input.off('pointerup', this.onMarqueePointerUp);
    this.cleanupMarquee();
    this.marqueeGfx?.destroy();
    this.marqueeGfx = null;
    this.rollMarqueeZone?.destroy();
    this.rollMarqueeZone = null;
  }

  /** Layout-only version for resize: shows rolled dice without replaying animation */
  private enterRollPhaseLayout(): void {
    this.clearSprites();
    this.lockedDiceIds.clear();
    this.hideAllButtons();

    const rolled = this.rs().rolledDice;
    this.rollSprites = this.createDiceRow(rolled, this.scale.height * UI.ROLL_Y_RATIO);
    this.setupRollSpriteInteraction();
    this.setupRollMarqueeZone();

    this.rerollBtn.setVisible(true);
    this.scoreBtn.setVisible(true);
    this.showSortButtons();
    this.sortAndRepositionDice();
    this.updateRollButtons();

    this.instructionText.setText('Lock dice you want to keep, then re-roll the rest');
    this.applyBossRollDiceState();
    this.updateHUD();
  }

  private enterScorePhase(result: ScoreResult): void {
    this.hideAllButtons();

    // Show hand name and level in sidebar
    const handType = result.handResult.type as HandType;
    const stats = selectHandStats(getRunState(), handType);
    roundActions.setSidebarOverlay({
      title: 'SCORING',
      handName: result.handResult.name,
      handLevel: stats.level,
    });

    // Store round score before this hand for the animation
    const roundScoreBefore = this.rs().totalMiles.minus(result.miles);
    result.roundScoreBefore = roundScoreBefore;

    // Play sequential scoring animation
    this.animating = true;
    playScoreAnimation({
      scene: this,
      diceSprites: this.rollSprites,
      result,
      sidebar: this.sidebar,
      equipBar: this.equipBar,
      consumableBar: this.consumableBar,
      onComplete: () => {
        revealLandSlideHints();
        this.equipBar.setHintRound(getRoundHintContext());

        // If hand upgrades occurred during scoring (e.g. Surveyor's Transit), animate them
        if (result.handUpgrades && result.handUpgrades.length > 0) {
          playHandUpgradeAnimation({
            scene: this,
            sidebar: this.sidebar,
            upgrades: result.handUpgrades,
            onComplete: () => {
              this.animating = false;
              this.instructionText.setText('');
              this.sidebar.clearHandDisplay();
              this.time.delayedCall(600, () => {
                this.onContinue();
              });
            },
          });
        } else {
          this.animating = false;
          this.instructionText.setText('');
          this.sidebar.clearHandDisplay();
          this.time.delayedCall(600, () => {
            this.onContinue();
          });
        }
      },
    });
  }

  // ─── Player Actions ───

  private onReadyToRoll(): void {
    if (this.animating) return;
    const ids = this.rs().hand.map((die) => die.id);
    const success = roundActions.selectForRoll(ids);
    if (success) {
      this.enterRollPhase();
    }
  }

  private onRoll(): void {
    // Not used in current flow — roll happens on selectForRoll
  }

  private onReroll(): void {
    if (this.animating) return;

    // Re-roll all dice that are NOT locked
    const allIds = this.rs().rolledDice.map((d) => d.id);
    const idsToReroll = allIds.filter((id) => !this.lockedDiceIds.has(id));
    if (idsToReroll.length === 0) return;

    const success = roundActions.reroll(idsToReroll);
    if (!success && this.rs().rerollsRemaining > 0 && !roundActions.canUseReroll()) {
      this.showFloatingText('No re-rolls on Day 1', 0xffaa44);
      return;
    }
    if (success) {
      this.animating = true;
      const rerolledSprites = this.rollSprites.filter((s) => idsToReroll.includes(s.dieData.id));
      const rolled = this.rs().rolledDice;

      playRollAnimation(
        this,
        rerolledSprites,
        rerolledSprites.map((s) => {
          return rolled.find((d) => d.id === s.dieData.id)!;
        }),
        () => {
          this.animating = false;
          for (const sprite of this.rollSprites) {
            const updated = rolled.find((d) => d.id === sprite.dieData.id);
            if (updated) sprite.setDieData(updated);
          }
          this.sortAndRepositionDice();
          this.applyBossRollDiceState();
          this.updateRollButtons();
        },
      );

      this.updateHUD();
    }
  }

  private onScore(): void {
    if (this.animating) return;
    // Use rollSprites order (user's visual/drag order) instead of rolledDice order
    const ids = this.rollSprites.filter((s) => this.lockedDiceIds.has(s.dieData.id)).map((s) => s.dieData.id);
    if (ids.length === 0) return;

    const validation = roundActions.validateScoreSelection(ids);
    if (!validation.allowed) {
      this.showFloatingText(validation.reason ?? 'Cannot play this hand', 0xff6644);
      return;
    }

    const success = roundActions.selectForScore(ids);
    if (!success) return;

    this.syncRolledDiceFromSprites();
    const result = roundActions.calculateScore();
    if (result) {
      this.enterScorePhase(result);
    } else {
      roundActions.cancelScore();
      this.showFloatingText('Cannot play this hand', 0xff6644);
      this.updateRollButtons();
    }
  }

  /** Developer profession: instantly win the round for faster testing. */
  private onDevWinRound(): void {
    if (!isDevMode() || this.animating) return;

    this.hideAllButtons();
    this.clearSprites();
    this.patchRound({ totalMiles: D(1_000_000), phase: 'DAY_END' });
    this.sidebar.syncRoundScoreFromStore();
    this.updateHUD();
    this.onContinue();
  }

  private onContinue(): void {
    if (this.animating) return;

    const scoredIds = new Set(this.rs().selectedForScore.map((d) => d.id));
    const heldDice = this.rs().rolledDice.filter((d) => !scoredIds.has(d.id));
    const goldHeld = processGoldHeldAtRoundEnd(heldDice, resolveEquipmentList());

    const { outcome, destroyedEquipment, deferredDestroyIndices } = roundActions.endDay({
      deferEquipmentDestructionAnimation: true,
    });

    const afterDestroyedEquipmentFeedback = () => {
      if (outcome === 'won' || outcome === 'lost') {
        this.finishDayEndAfterEquipmentDestroyed(outcome, goldHeld);
        return;
      }

      const carryover = new Map<string, { x: number; y: number; rotation: number }>();
      for (const sprite of this.rollSprites) {
        carryover.set(sprite.dieData.id, { x: sprite.x, y: sprite.y, rotation: sprite.rotation });
      }
      this.enterDrawPhase(true, carryover, { autoRoll: true });
    };

    if (deferredDestroyIndices.length > 0) {
      this.animating = true;
      this.animateEndOfRoundSelfDestructs(deferredDestroyIndices, () => {
        for (const name of destroyedEquipment) {
          this.showFloatingText(`💥 ${name} destroyed!`, 0xff4444);
        }
        const proceed = () => {
          this.animating = false;
          afterDestroyedEquipmentFeedback();
        };
        const holdMs = outcome === 'won' || outcome === 'lost' ? ANIM.EQUIP_FIRE_DESTROY_ROUND_END_HOLD_MS : 0;
        if (holdMs > 0) {
          this.time.delayedCall(holdMs, proceed);
        } else {
          proceed();
        }
      });
      return;
    }

    if (destroyedEquipment.length > 0) {
      for (const name of destroyedEquipment) {
        this.showFloatingText(`💥 ${name} destroyed!`, 0xff4444);
      }
    }

    afterDestroyedEquipmentFeedback();
  }

  private finishDayEndAfterEquipmentDestroyed(
    outcome: 'won' | 'lost',
    goldHeld: ReturnType<typeof processGoldHeldAtRoundEnd>,
  ): void {
    const playGoldThenFinish = () => {
      if (goldHeld.moneyEarned > 0) {
        economyActions.earn(goldHeld.moneyEarned);
      }
      this.runRoundEndModifierFeedback(() => this.transitionAfterRoundEnd(outcome));
    };

    if (goldHeld.animEvents.length > 0) {
      this.animating = true;
      playDieAnimEvents({
        scene: this,
        diceSprites: this.rollSprites,
        events: goldHeld.animEvents,
        onComplete: () => {
          this.animating = false;
          playGoldThenFinish();
        },
      });
    } else {
      playGoldThenFinish();
    }
  }

  private runRoundEndModifierFeedback(onComplete: () => void): void {
    const modifierResult = processEquipmentModifiersEndOfRound({ applyDestruction: false });
    const hasDestroy = modifierResult.perished.length > 0 || modifierResult.leaseDefaulted.length > 0;

    const showModifierFeedback = () => {
      for (const { index, equipmentName, cost } of modifierResult.leasePaid) {
        EventBus.emit(Events.LEASE_PAID, { equipmentName, index, cost });
        this.showFloatingText(`-$${cost} lease: ${equipmentName}`, COLORS.GOLD);
      }
      this.equipBar.flashLeasedUpkeepPaid(modifierResult.leasePaid.map((p) => p.index));

      for (const { index, equipmentName } of modifierResult.perished) {
        EventBus.emit(Events.EQUIPMENT_PERISHED, { equipmentName, index });
      }
      for (const { index, equipmentName } of modifierResult.leaseDefaulted) {
        EventBus.emit(Events.LEASE_DEFAULTED, { equipmentName, index });
      }

      if (!hasDestroy) {
        applyEquipmentModifierDestructions(modifierResult);
      }
      this.equipBar.setHintRound(getRoundHintContext());
      this.equipBar.flashPerishableWarnings();
      onComplete();
    };

    if (hasDestroy) {
      this.equipBar.animateModifierDestructions(modifierResult, showModifierFeedback);
    } else {
      showModifierFeedback();
    }
  }

  private transitionAfterRoundEnd(outcome: 'won' | 'lost'): void {
    if (outcome === 'won') {
      this.sound.play('sfx_win', { volume: 0.6 });
      const run = getRunState();
      const daysRemaining = getActiveRoundConfig().maxDays - this.rs().day;
      const rerollsRemaining = this.rs().rerollsRemaining;
      const totalMiles = this.rs().totalMiles;
      const targetMiles = getActiveRoundConfig().targetMiles;
      const payout = computePayoutBreakdown(run, daysRemaining, rerollsRemaining);
      let investmentBonus = 0;
      if (run.round === GAMEPLAY.ROUNDS_PER_LEG) {
        investmentBonus = processBossPayoutTags();
        const profMods = selectProfession(run)?.modifiers as Record<string, unknown> | undefined;
        if (profMods?.doubleTagOnBoss) {
          const twinWagonDef = getTrailTagById('tag_twin_wagon');
          if (twinWagonDef) grantTag(twinWagonDef);
        }
        if (profMods?.ghostMedicineOnBoss) {
          grantGhostMedicine();
        }
      }
      sceneActions.enterPayout({
        breakdown: payout,
        presentation: {
          totalMilesSave: milesToSave(totalMiles),
          targetMilesSave: milesToSave(targetMiles),
          daysRemaining,
          rerollsRemaining,
          leg: run.leg,
          round: run.round,
          isVictory: selectIsBossRound(run) && run.leg === GAMEPLAY.LEGS && !run.endlessMode,
          investmentBonus,
        },
      });
      this.scene.start('Payout', {});
    } else {
      this.sound.play('sfx_negative', { volume: 0.5 });
      const run = getRunState();
      this.scene.start('GameOver', {
        won: false,
        victory: false,
        totalMiles: this.rs().totalMiles,
        targetMiles: getActiveRoundConfig().targetMiles,
        leg: run.leg,
        round: run.round,
      });
    }
  }

  // ─── Helpers ───

  private createDiceRow(dice: Die[], y: number): DiceSprite[] {
    const sprites: DiceSprite[] = [];
    const totalWidth = (dice.length - 1) * DICE_SPACING;
    const startX = this.contentCX - totalWidth / 2;

    for (let i = 0; i < dice.length; i++) {
      const arc = this.getArcOffset(i, dice.length);
      const sprite = new DiceSprite(this, startX + i * DICE_SPACING, y + arc.y, dice[i]);
      sprite.rotation = arc.rotation;
      sprite.setDepth(10);
      sprites.push(sprite);
    }
    return sprites;
  }

  private clearSprites(): void {
    for (const s of this.rollSprites) s.destroy();
    for (const s of this.playAreaSprites) s.destroy();
    this.destroyRollMarqueeZone();
    this.rollSprites = [];
    this.playAreaSprites = [];
  }

  private hideAllButtons(): void {
    this.readyBtn.setVisible(false);
    this.rollBtn.setVisible(false);
    this.rerollBtn.setVisible(false);
    this.scoreBtn.setVisible(false);
    this.continueBtn.setVisible(false);
    this.sortAscBtn.setVisible(false);
    this.sortDescBtn.setVisible(false);
  }

  private updateDrawButtons(): void {
    const drawCount = this.rs().hand.length;
    this.readyBtn.setText(drawCount > 0 ? `Roll ${drawCount} Dice` : 'No Dice To Roll');
    this.readyBtn.setEnabled(drawCount > 0);
  }

  private updateRollButtons(): void {
    const lockedCount = this.lockedDiceIds.size;
    const totalCount = this.rs().rolledDice.length;
    const rerollCount = totalCount - lockedCount;
    const remaining = this.rs().rerollsRemaining;
    const hasRerolls = remaining > 0;
    const canUseReroll = roundActions.canUseReroll();

    this.rerollBtn.setEnabled(rerollCount > 0 && canUseReroll);
    this.rerollBtn.setText(
      !hasRerolls
        ? 'No Re-rolls'
        : !canUseReroll
          ? `Day 1: no re-rolls (${remaining} from Day 2)`
          : lockedCount === 0
            ? `Re-roll All (${remaining} remaining)`
            : `Re-roll ${rerollCount} (${remaining} remaining)`,
    );

    this.scoreBtn.setEnabled(lockedCount > 0);
    this.scoreBtn.setText(lockedCount > 0 ? `Score ${lockedCount} Dice` : 'Lock Dice to Score');

    // Preview hand type when dice are locked
    if (lockedCount > 0) {
      const lockedDice = this.rs().rolledDice.filter((d) => this.lockedDiceIds.has(d.id));
      const handResult = detectBestHand(lockedDice);
      const stats = getRunHandStats(handResult.type);
      const levelBonus = stats.level - 1;
      const baseMiles = addScore(handResult.baseMiles, stats.milesPerLevel * levelBonus);
      const baseMult = addScore(handResult.baseMult, stats.multPerLevel * levelBonus);
      roundActions.setSidebarOverlay({
        handName: handResult.name,
        handLevel: stats.level,
        milesBaseSave: milesToSave(baseMiles),
        multSave: milesToSave(baseMult),
      });
    } else {
      roundActions.setSidebarOverlay({
        handName: '',
        handLevel: 0,
        milesBaseSave: milesToSave(0),
        multSave: milesToSave(0),
      });
    }

    this.equipBar?.setHintRound(getRoundHintContext());
  }

  /** Sort roll sprites by die value and reposition them (locked dice stay raised) */
  private sortAndRepositionDice(): void {
    // Stone dice sort as highest (above 12s)
    const sortValue = (d: Die) => (d.enhancement === 'stone' ? 13 : d.value);
    const cmp =
      this.sortOrder === 'asc'
        ? (a: DiceSprite, b: DiceSprite) => sortValue(a.dieData) - sortValue(b.dieData)
        : (a: DiceSprite, b: DiceSprite) => sortValue(b.dieData) - sortValue(a.dieData);
    this.rollSprites.sort(cmp);
    this.repositionRollDice(true);
  }

  private isRollDieLocked(sprite: DiceSprite): boolean {
    return this.lockedDiceIds.has(sprite.dieData.id);
  }

  /** Y for a roll-row die: arc baseline minus Balatro-style lift when locked */
  private getRollDieY(index: number, locked: boolean): number {
    const rollY = this.scale.height * UI.ROLL_Y_RATIO;
    const arc = this.getArcOffset(index, this.rollSprites.length);
    const lift = locked ? UI.DICE_LOCKED_LIFT_Y : 0;
    return rollY + arc.y - lift;
  }

  private applyRollDieDepth(sprite: DiceSprite, locked: boolean): void {
    sprite.setDepth(locked ? 15 : 10);
  }

  /** Reposition all roll sprites (row layout + locked lift + depth) */
  private repositionRollDice(animated: boolean, duration = 250): void {
    if (this.rollSprites.length === 0) return;

    const totalWidth = (this.rollSprites.length - 1) * DICE_SPACING;
    const startX = this.contentCX - totalWidth / 2;
    for (let i = 0; i < this.rollSprites.length; i++) {
      const sprite = this.rollSprites[i];
      const locked = this.isRollDieLocked(sprite);
      const arc = this.getArcOffset(i, this.rollSprites.length);
      const targetX = startX + i * DICE_SPACING;
      const targetY = this.getRollDieY(i, locked);
      this.applyRollDieDepth(sprite, locked);

      if (animated) {
        this.tweens.add({
          targets: sprite,
          x: targetX,
          y: targetY,
          rotation: arc.rotation,
          duration,
          ease: 'Power2',
        });
      } else {
        sprite.setPosition(targetX, targetY);
        sprite.rotation = arc.rotation;
      }
    }
    this.syncRolledDiceFromSprites();
  }

  private animateRollDieLockLift(sprite: DiceSprite, index: number): void {
    const locked = this.isRollDieLocked(sprite);
    this.applyRollDieDepth(sprite, locked);
    this.tweens.add({
      targets: sprite,
      y: this.getRollDieY(index, locked),
      duration: 200,
      ease: 'Power2',
    });
  }

  /** Keep game-state dice order aligned with on-screen roll sprite order (held-in-hand scoring). */
  private syncRolledDiceFromSprites(): void {
    this.patchRound({ rolledDice: this.rollSprites.map((s) => s.dieData) });
  }

  private setSortOrder(order: 'asc' | 'desc'): void {
    this.sortOrder = order;
    this.sortAndRepositionDice();
    this.updateSortButtonStyles();
  }

  private showSortButtons(): void {
    this.sortAscBtn.setVisible(true);
    this.sortDescBtn.setVisible(true);
    this.updateSortButtonStyles();
  }

  private updateSortButtonStyles(): void {
    this.sortAscBtn.setEnabled(this.sortOrder !== 'asc');
    this.sortDescBtn.setEnabled(this.sortOrder !== 'desc');
  }

  private updateHUD(): void {
    const s = this.rs();
    const boss = selectCurrentBoss(getRunState());
    roundActions.setSidebarOverlay({
      title: boss
        ? boss.name
        : s.phase === 'SELECT'
          ? 'READY TO ROLL'
          : s.phase === 'ROLL'
            ? 'ROLL PHASE'
            : s.phase === 'SCORE'
              ? 'SCORING'
              : s.phase === 'DAY_END'
                ? 'DAY COMPLETE'
                : 'GAME',
      milesBaseSave: milesToSave(0),
      multSave: milesToSave(0),
    });
    this.equipBar.setHintRound(getRoundHintContext());
    this.updateLoadedDiceControl();
  }

  private buildLoadedDiceControl(): void {
    const { height } = this.scale;
    const controlLeft = this.sidebarW + 18;
    const controlY = height - 34;
    const boxWidth = 44;
    const boxHeight = 28;
    const boxCenterX = controlLeft + 50;

    this.add
      .text(controlLeft, controlY - 26, 'Loaded Die Number', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '11px',
        color: TEXT_COLORS.SECONDARY,
      })
      .setOrigin(0, 0.5)
      .setDepth(50);

    this.loadedDiceDecBtn = new Button(this, controlLeft + 12, controlY, '-', 24, 24).onClick(() => {
      this.adjustLoadedDieTarget(-1);
    });
    this.loadedDiceDecBtn.setDepth(50);
    (this.loadedDiceDecBtn as any).label?.setFontSize?.(14);

    this.loadedDiceValueBg = this.add.graphics().setDepth(50);
    this.loadedDiceValueBg.fillStyle(COLORS.BG_PANEL, 1);
    this.loadedDiceValueBg.fillRoundedRect(boxCenterX - boxWidth / 2, controlY - boxHeight / 2, boxWidth, boxHeight, 6);
    this.loadedDiceValueBg.lineStyle(1, COLORS.PANEL_BORDER, 1);
    this.loadedDiceValueBg.strokeRoundedRect(
      boxCenterX - boxWidth / 2,
      controlY - boxHeight / 2,
      boxWidth,
      boxHeight,
      6,
    );

    this.loadedDiceValueHitArea = this.add
      .zone(boxCenterX, controlY, boxWidth, boxHeight)
      .setOrigin(0.5)
      .setDepth(52)
      .setInteractive({ useHandCursor: true });
    this.loadedDiceValueHitArea.on('pointerdown', () => this.toggleLoadedDicePicker());

    this.loadedDiceValueText = this.add
      .text(boxCenterX, controlY, '-', {
        fontFamily: FONTS.HEADING,
        fontSize: '16px',
        color: TEXT_COLORS.PRIMARY,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(51);

    this.loadedDiceIncBtn = new Button(this, controlLeft + 88, controlY, '+', 24, 24).onClick(() => {
      this.adjustLoadedDieTarget(1);
    });
    this.loadedDiceIncBtn.setDepth(50);
    (this.loadedDiceIncBtn as any).label?.setFontSize?.(14);

    this.updateLoadedDiceControl();
  }

  private adjustLoadedDieTarget(delta: number): void {
    const run = getRunState();
    if (run.loadedDieSyncLucky) return;

    const current = run.loadedDieTarget;

    let nextValue: number | null;
    if (delta > 0) {
      nextValue = current === null ? 1 : Math.min(12, current + 1);
    } else {
      nextValue = current === null ? null : current === 1 ? null : current - 1;
    }

    diceActions.setLoadedDieTarget(nextValue);
    this.updateLoadedDiceControl();
    this.destroyLoadedDicePicker();
  }

  private updateLoadedDiceControl(): void {
    if (!this.loadedDiceValueText || !this.loadedDiceDecBtn || !this.loadedDiceIncBtn || !this.loadedDiceValueBg)
      return;

    const run = getRunState();
    const syncLucky = run.loadedDieSyncLucky && runHasLuckyNumberEquipment(run);
    const target = getResolvedLoadedDieTarget(run);

    if (syncLucky) {
      this.loadedDiceValueText.setText('🍀');
      this.loadedDiceValueText.setColor(TEXT_COLORS.GOLD);
    } else {
      this.loadedDiceValueText.setText(target === null ? '-' : String(target));
      this.loadedDiceValueText.setColor(target === null ? TEXT_COLORS.SECONDARY : TEXT_COLORS.PRIMARY);
    }
    this.loadedDiceDecBtn.setEnabled(!syncLucky && target !== null);
    this.loadedDiceIncBtn.setEnabled(!syncLucky && (target === null || target < 12));

    this.loadedDiceValueBg.clear();
    this.loadedDiceValueBg.fillStyle(COLORS.BG_PANEL, 1);
    this.loadedDiceValueBg.fillRoundedRect(
      this.loadedDiceValueHitArea.x - 22,
      this.loadedDiceValueHitArea.y - 14,
      44,
      28,
      6,
    );
    this.loadedDiceValueBg.lineStyle(1, this.loadedDicePicker ? COLORS.GOLD : COLORS.PANEL_BORDER, 1);
    this.loadedDiceValueBg.strokeRoundedRect(
      this.loadedDiceValueHitArea.x - 22,
      this.loadedDiceValueHitArea.y - 14,
      44,
      28,
      6,
    );
  }

  private toggleLoadedDicePicker(): void {
    if (this.loadedDicePicker) {
      this.destroyLoadedDicePicker();
      return;
    }

    const picker = this.buildLoadedDicePicker();
    this.loadedDicePicker = picker;
    this.updateLoadedDiceControl();
  }

  private destroyLoadedDicePicker(): void {
    if (!this.loadedDicePicker) return;
    this.loadedDicePicker.destroy();
    this.loadedDicePicker = null;
    this.updateLoadedDiceControl();
  }

  private buildLoadedDicePicker(): Phaser.GameObjects.Container {
    const controlX = this.loadedDiceValueHitArea.x;
    const controlY = this.loadedDiceValueHitArea.y;
    const run = getRunState();
    const showLuckySync = runHasLuckyNumberEquipment(run);
    const panelWidth = 208;
    const panelHeight = showLuckySync ? 248 : 214;
    const panelX = Phaser.Math.Clamp(controlX - panelWidth / 2, this.sidebarW + 12, this.scale.width - panelWidth - 12);
    const panelY = controlY - panelHeight - 14;
    const panelCenterX = panelX + panelWidth / 2;
    const picker = this.add.container(0, 0).setDepth(500);

    const panel = this.add.graphics();
    panel.fillStyle(COLORS.BG_PANEL, 0.98);
    panel.fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 10);
    panel.lineStyle(2, COLORS.PANEL_BORDER, 1);
    panel.strokeRoundedRect(panelX, panelY, panelWidth, panelHeight, 10);
    picker.add(panel);

    const title = this.add
      .text(panelCenterX, panelY + 16, 'Pick Loaded Number', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '11px',
        color: TEXT_COLORS.SECONDARY,
      })
      .setOrigin(0.5, 0.5);
    picker.add(title);

    const oddsNote = this.add
      .text(panelCenterX, panelY + 40, this.getLoadedDiceOddsNote(), {
        fontFamily: FONTS.PRIMARY,
        fontSize: '10px',
        color: TEXT_COLORS.GOLD,
        align: 'center',
        wordWrap: { width: panelWidth - 28 },
      })
      .setOrigin(0.5, 0.5);
    picker.add(oddsNote);

    const cols = 4;
    const cellWidth = 34;
    const cellHeight = 26;
    const cellGap = 8;
    const gridWidth = cols * cellWidth + (cols - 1) * cellGap;
    const gridStartX = panelX + (panelWidth - gridWidth) / 2 + cellWidth / 2;
    const gridStartY = panelY + 72 + cellHeight / 2;
    const syncLucky = run.loadedDieSyncLucky && showLuckySync;
    const selected = syncLucky ? null : run.loadedDieTarget;

    for (let value = 1; value <= 12; value++) {
      const col = (value - 1) % cols;
      const row = Math.floor((value - 1) / cols);
      const button = new Button(
        this,
        gridStartX + col * (cellWidth + cellGap),
        gridStartY + row * (cellHeight + cellGap),
        String(value),
        cellWidth,
        cellHeight,
      ).onClick(() => {
        diceActions.setLoadedDieTarget(value);
        this.destroyLoadedDicePicker();
      });
      button.setDepth(501);
      (button as any).label?.setFontSize?.(13);
      if (selected === value) {
        button.setColor(COLORS.GOLD, COLORS.GOLD);
        button.setEnabled(false);
      }
      picker.add(button);
    }

    let clearBtnY = panelY + panelHeight - 24;
    if (showLuckySync) {
      const syncBtnY = panelY + panelHeight - 58;
      const syncBtn = new Button(
        this,
        panelCenterX,
        syncBtnY,
        'Sync Loaded Die with Lucky Number',
        panelWidth - 28,
        26,
      ).onClick(() => {
        diceActions.setLoadedDieSyncLucky(true);
        this.destroyLoadedDicePicker();
      });
      syncBtn.setDepth(501);
      (syncBtn as any).label?.setFontSize?.(10);
      if (syncLucky) {
        syncBtn.setColor(COLORS.GOLD, COLORS.GOLD);
        syncBtn.setEnabled(false);
      }
      picker.add(syncBtn);
      clearBtnY = panelY + panelHeight - 24;
    }

    const clearBtn = new Button(this, panelCenterX, clearBtnY, 'Clear', 86, 26).onClick(() => {
      diceActions.setLoadedDieTarget(null);
      this.destroyLoadedDicePicker();
    });
    clearBtn.setDepth(501);
    (clearBtn as any).label?.setFontSize?.(13);
    clearBtn.setEnabled(syncLucky || selected !== null);
    picker.add(clearBtn);

    return picker;
  }

  private getLoadedDiceOddsNote(): string {
    const chance = Math.min(1, getLoadedDiceMultiplier(resolveEquipmentList()) / 6);
    if (chance >= 1) return 'Selected face is guaranteed to roll.';
    if (chance === 2 / 3) return 'Selected face rolls at 2 in 3.';
    if (chance === 1 / 3) return 'Selected face rolls at 1 in 3.';
    return 'Selected face rolls at 1 in 6.';
  }

  // ─── Pre-roll hand (SELECT phase) ───

  /** Pop-in + toast when round-start effects add dice to the pouch/hand */
  private animateNewDiceAppearing(): void {
    const newIds = new Set(this.pendingNewDiceIds);

    for (const sprite of this.playAreaSprites) {
      if (!newIds.has(sprite.dieData.id)) continue;
      const origScale = sprite.scaleX;
      sprite.setScale(0);
      sprite.setAlpha(0);
      this.tweens.add({
        targets: sprite,
        scaleX: origScale * 1.3,
        scaleY: origScale * 1.3,
        alpha: 1,
        duration: 300,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.tweens.add({
            targets: sprite,
            scaleX: origScale,
            scaleY: origScale,
            duration: 150,
            ease: 'Sine.easeOut',
          });
        },
      });
    }

    // Wiggle the Mystery Crate equipment card
    const crateIndex = resolveEquipmentList().findIndex((e) => e.def.effectType === 'ROUND_START_ADD_DICE');
    if (crateIndex >= 0) {
      const card = this.equipBar.getCardByEquipIndex(crateIndex);
      if (card) {
        const origX = card.x;
        this.tweens.add({
          targets: card,
          x: origX - 3,
          duration: 40,
          yoyo: true,
          repeat: 3,
          ease: 'Sine.easeInOut',
          onComplete: () => {
            card.x = origX;
          },
        });
      }
    }

    // Show floating text
    const text = this.add
      .text(this.contentCX, this.playAreaY - 50, '✨ New Die Added!', {
        fontFamily: FONTS.HEADING,
        fontSize: '20px',
        color: '#ffd700',
        stroke: '#000000',
        strokeThickness: 3,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(100)
      .setAlpha(0);

    this.tweens.add({
      targets: text,
      alpha: 1,
      y: text.y - 10,
      duration: 300,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: text,
          alpha: 0,
          y: text.y - 20,
          duration: 800,
          delay: 600,
          ease: 'Sine.easeIn',
          onComplete: () => text.destroy(),
        });
      },
    });

    this.sound.play('sfx_foil1', { volume: 0.4 });
  }

  private stopEquipDestroySounds(): void {
    for (const sound of this.activeEquipDestroySounds) {
      sound.stop();
      sound.destroy();
    }
    this.activeEquipDestroySounds = [];
  }

  /** Animate an equipment card being destroyed by fire (used by Funeral Pyre, Haunted Totem, etc.) */
  private animateEquipmentFireDestruction(sourceIndex: number, victimIndex: number, onComplete?: () => void): void {
    animateEquipmentFireDestruction(this, this.equipBar, sourceIndex, victimIndex, onComplete);
  }

  /** Animate a sequence of round-start equipment destructions in order, adjusting indices after each splice */
  private animateRoundStartDestructions(destructions: { sourceIdx: number; victimIdx: number }[]): void {
    animateEquipmentFireDestructionSequence(this, this.equipBar, destructions);
  }

  /** Animate end-of-round self-destructs (Dynamite, Nitro) using the same fire burst as Haunted Totem. */
  private animateEndOfRoundSelfDestructs(indices: number[], onComplete: () => void): void {
    const sorted = [...indices].sort((a, b) => a - b);
    if (sorted.length === 0) {
      onComplete();
      return;
    }

    const idx = sorted[0];
    const remaining = sorted.slice(1).map((i) => (i > idx ? i - 1 : i));

    this.animateEquipmentFireDestruction(idx, idx, () => {
      this.time.delayedCall(200, () => {
        this.animateEndOfRoundSelfDestructs(remaining, onComplete);
      });
    });
  }

  /** Animate Junk Dealer equipment cards popping into the equipment bar */
  private animateJunkDealerCreation(count: number): void {
    void animateEquipmentPopIn(this, this.equipBar, count);
  }

  /** Calculate X positions for dice in the play area */
  private getPlayAreaXPositions(count: number): number[] {
    if (count === 0) return [];
    const totalWidth = (count - 1) * DICE_SPACING;
    const startX = this.contentCX - totalWidth / 2;
    return Array.from({ length: count }, (_, i) => startX + i * DICE_SPACING);
  }

  /** Reposition play area sprites */
  private repositionPlayArea(animated: boolean): void {
    const positions = this.getPlayAreaXPositions(this.playAreaSprites.length);
    for (let i = 0; i < this.playAreaSprites.length; i++) {
      const arc = this.getArcOffset(i, this.playAreaSprites.length);
      if (animated) {
        this.tweens.add({
          targets: this.playAreaSprites[i],
          x: positions[i],
          y: this.playAreaY + arc.y,
          rotation: arc.rotation,
          duration: 200,
          ease: 'Power2',
        });
      } else {
        this.playAreaSprites[i].setPosition(positions[i], this.playAreaY + arc.y);
        this.playAreaSprites[i].rotation = arc.rotation;
      }
    }
  }

  // ─── Drag-to-Reorder (ROLL phase) ───

  /** Get the active draggable sprite list (roll sprites during ROLL) */
  private getDraggableList(): DiceSprite[] | null {
    if (this.rollSprites.length > 0) return this.rollSprites;
    return null;
  }

  /** Get the row Y and position calculator for the active draggable list */
  private getDraggableRowY(): number {
    const phase = this.rs().phase;
    if (phase === 'SELECT') return this.playAreaY;
    return this.scale.height * UI.ROLL_Y_RATIO;
  }

  /** Get X positions for a row of count dice */
  private getRowXPositions(count: number): number[] {
    if (count === 0) return [];
    const totalWidth = (count - 1) * DICE_SPACING;
    const startX = this.contentCX - totalWidth / 2;
    return Array.from({ length: count }, (_, i) => startX + i * DICE_SPACING);
  }

  /** Get Balatro-style arc Y offset and rotation for a die at index i in a row of count */
  private getArcOffset(i: number, count: number): { y: number; rotation: number } {
    if (count <= 1) return { y: 0, rotation: 0 };
    const t = i / (count - 1) - 0.5; // -0.5 to 0.5
    const y = -UI.DICE_ARC_HEIGHT * (1 - 4 * t * t); // negative = up, parabola peak at center
    const rotation = t * UI.DICE_ARC_ROTATION * 2; // fan out from center
    return { y, rotation };
  }

  private setupDragHandlers(): void {
    this.input.dragDistanceThreshold = 8;

    this.input.on('dragstart', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (this.animating) return;
      const sprite = gameObject as DiceSprite;
      const list = this.getDraggableList();
      if (!list || list.indexOf(sprite) === -1) return;

      this.draggingSprite = sprite;
      this.wasDragging = true;
      this.dragOffsetX = pointer.worldX - sprite.x;
      this.dragOffsetY = pointer.worldY - sprite.y;
      this.dragPrevX = pointer.worldX;
      this.dragVelocityX = 0;

      // Hide tooltip during drag
      sprite.emit('pointerout');
      DiceSprite.suppressTooltips = true;

      sprite.setDepth(30);
      sprite.scaleX = 1.1;
      sprite.scaleY = 1.1;
    });

    this.input.on('drag', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (!this.draggingSprite || gameObject !== this.draggingSprite) return;
      const list = this.getDraggableList();
      if (!list) return;

      // Track velocity for momentum swing
      const dx = pointer.worldX - this.dragPrevX;
      this.dragVelocityX = this.dragVelocityX * ANIM.CARD_DRAG_SWING_DAMPING + dx * (1 - ANIM.CARD_DRAG_SWING_DAMPING);
      this.dragPrevX = pointer.worldX;

      // Apply swing rotation
      const swing = Phaser.Math.Clamp(
        this.dragVelocityX * ANIM.CARD_DRAG_SWING_FACTOR,
        -ANIM.CARD_DRAG_SWING_MAX,
        ANIM.CARD_DRAG_SWING_MAX,
      );
      this.draggingSprite.rotation = swing;

      // Follow pointer with offset
      this.draggingSprite.x = pointer.worldX - this.dragOffsetX;
      this.draggingSprite.y = pointer.worldY - this.dragOffsetY + ANIM.CARD_DRAG_LIFT_Y;

      // Calculate which slot the dragged sprite should occupy
      const positions = this.getRowXPositions(list.length);
      let newIndex = 0;
      let minDist = Infinity;
      for (let i = 0; i < positions.length; i++) {
        const dist = Math.abs(this.draggingSprite.x - positions[i]);
        if (dist < minDist) {
          minDist = dist;
          newIndex = i;
        }
      }

      const currentIndex = list.indexOf(this.draggingSprite);
      if (newIndex !== currentIndex) {
        list.splice(currentIndex, 1);
        list.splice(newIndex, 0, this.draggingSprite);

        // Animate non-dragged sprites to their new slots
        const rowY = this.getDraggableRowY();
        for (let i = 0; i < list.length; i++) {
          if (list[i] === this.draggingSprite) continue;
          const arc = this.getArcOffset(i, list.length);
          const targetY = list === this.rollSprites ? this.getRollDieY(i, this.isRollDieLocked(list[i])) : rowY + arc.y;
          this.tweens.add({
            targets: list[i],
            x: positions[i],
            y: targetY,
            rotation: arc.rotation,
            duration: 150,
            ease: 'Power2',
          });
        }
      }
    });

    this.input.on('dragend', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (!this.draggingSprite || gameObject !== this.draggingSprite) return;
      const list = this.getDraggableList();
      if (!list) return;

      const sprite = this.draggingSprite;
      const finalVelocity = this.dragVelocityX;
      const locked = list === this.rollSprites && this.isRollDieLocked(sprite);
      sprite.setDepth(list === this.rollSprites ? (locked ? 15 : 10) : 20);
      this.draggingSprite = null;
      this.dragVelocityX = 0;
      DiceSprite.suppressTooltips = false;

      // Spring settle with overshoot like equipment cards
      const positions = this.getRowXPositions(list.length);
      const idx = list.indexOf(sprite);
      const rowY = this.getDraggableRowY();
      const arc = this.getArcOffset(idx, list.length);
      const settleY = list === this.rollSprites ? this.getRollDieY(idx, locked) : rowY + arc.y;

      const overshoot = Phaser.Math.Clamp(
        finalVelocity * ANIM.CARD_DRAG_SWING_FACTOR * 2,
        -ANIM.CARD_DRAG_SWING_MAX,
        ANIM.CARD_DRAG_SWING_MAX,
      );
      const dur = ANIM.CARD_DRAG_SETTLE_DURATION;

      this.tweens.chain({
        targets: sprite,
        tweens: [
          {
            x: positions[idx],
            y: settleY,
            rotation: overshoot + arc.rotation,
            scaleX: 1,
            scaleY: 1,
            duration: dur * 0.3,
            ease: 'Sine.easeOut',
          },
          {
            rotation: -overshoot * 0.4 + arc.rotation,
            duration: dur * 0.25,
            ease: 'Sine.easeInOut',
          },
          {
            rotation: overshoot * 0.1 + arc.rotation,
            duration: dur * 0.2,
            ease: 'Sine.easeInOut',
          },
          {
            rotation: arc.rotation,
            duration: dur * 0.25,
            ease: 'Sine.easeIn',
          },
        ],
      });

      if (list === this.rollSprites) {
        this.syncRolledDiceFromSprites();
      }
    });
  }

  /** Wire consumable targeting clicks on pre-roll hand dice */
  private setupPlayAreaSprite(sprite: DiceSprite): void {
    sprite.on('pointerup', () => {
      if (this.consumableTargeting) {
        this.onConsumableTargetClick(sprite);
      }
    });
  }

  private async handleConsumableUsed(consumed: ConsumableInstance): Promise<void> {
    const result = executeConsumableEffect(consumed, {
      visibleDiceIds: this.getVisibleConsumableDiceIds(),
    });

    enqueueConsumablePlayback(result);

    if (!result.success && result.failReason) {
      const text = this.add
        .text(this.contentCX, this.consumableBar.y, result.failReason, {
          fontFamily: 'sans-serif',
          fontSize: '24px',
          color: '#fff',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(1000);
      this.sound.play('sfx_cancel', { volume: 0.5 });
      this.tweens.add({
        targets: text,
        y: text.y - 15,
        alpha: 0,
        duration: 2000,
        ease: 'Power2',
        onComplete: () => text.destroy(),
      });
    }

    if (result.diceSelection) {
      this.enterConsumableTargeting(result.diceSelection);
    }

    // Play hand upgrade animation for trail guides / Spiritual Journey
    const upgrades = result.handUpgrades ?? (result.handUpgrade ? [result.handUpgrade] : []);
    if (upgrades.length > 0) {
      this.animating = true;
      playHandUpgradeAnimation({
        scene: this,
        sidebar: this.sidebar,
        upgrades,
        onComplete: () => {
          this.animating = false;
        },
      });
    }
  }

  private canUseConsumable(def: ConsumableDef): boolean {
    if (this.consumableTargeting) return false;
    if (def.id !== 'raid') return true;
    return this.getVisibleConsumableDiceIds().length > 0;
  }

  private getVisibleConsumableDiceIds(): string[] {
    return this.getTargetableDice().dice.map((d) => d.id);
  }

  private animateConsumableDiceDestruction(
    destroyedIds: string[],
    options: { refillSelectHand?: boolean; floatingText?: string } = {},
  ): Promise<void> {
    const destroyedSet = new Set(destroyedIds);
    const phase = this.rs().phase;

    this.removeDestroyedDiceFromRoundState(destroyedSet);

    const targetSprites = (phase === 'SELECT' ? this.playAreaSprites : this.rollSprites).filter((sprite) =>
      destroyedSet.has(sprite.dieData.id),
    );

    return new Promise((resolve) => {
      if (targetSprites.length === 0) {
        if (phase === 'SELECT' && options.refillSelectHand) {
          void this.refillSelectHandAfterRaid();
        }
        resolve();
        return;
      }

      ensureAuraTextures(this);
      this.animating = true;
      const fireSound = this.sound.add('sfx_ambient_fire', { volume: 1.2 });
      fireSound.play();
      let finished = 0;
      for (const sprite of targetSprites) {
        const fireEmitter = this.add.particles(sprite.x, sprite.y, 'aura_soft', {
          speed: { min: 20, max: 60 },
          angle: { min: -110, max: -70 },
          scale: { start: 0.55, end: 0 },
          alpha: { start: 0.85, end: 0 },
          lifespan: { min: 350, max: 700 },
          frequency: 24,
          quantity: 2,
          tint: [0xff2200, 0xff4500, 0xff6600, 0xffaa00, 0xffdd00],
          blendMode: 'ADD',
          maxAliveParticles: 20,
        });
        fireEmitter.setDepth(500);

        this.time.delayedCall(260, () => {
          const sparkEmitter = this.add.particles(sprite.x, sprite.y, 'aura_soft', {
            speed: { min: 70, max: 150 },
            angle: { min: 0, max: 360 },
            scale: { start: 0.35, end: 0 },
            alpha: { start: 1, end: 0 },
            lifespan: { min: 220, max: 500 },
            frequency: -1,
            quantity: 10,
            tint: [0xff4400, 0xffaa00, 0xffdd00],
            blendMode: 'ADD',
          });
          sparkEmitter.setDepth(500);
          sparkEmitter.explode(10);
          this.time.delayedCall(500, () => sparkEmitter.destroy());
        });

        this.tweens.add({
          targets: sprite,
          delay: 260,
          y: sprite.y - 45,
          angle: sprite.angle + 16,
          scaleX: 0.2,
          scaleY: 0.2,
          alpha: 0,
          duration: 280,
          ease: 'Back.easeIn',
          onComplete: () => {
            fireEmitter.stop();
            this.time.delayedCall(400, () => fireEmitter.destroy());
            const idxPlay = this.playAreaSprites.indexOf(sprite);
            if (idxPlay >= 0) this.playAreaSprites.splice(idxPlay, 1);
            const idxRoll = this.rollSprites.indexOf(sprite);
            if (idxRoll >= 0) this.rollSprites.splice(idxRoll, 1);
            sprite.destroy();
            finished++;
            if (finished >= targetSprites.length) {
              this.animating = false;
              this.tweens.add({
                targets: fireSound,
                volume: 0,
                duration: 250,
                onComplete: () => fireSound.destroy(),
              });
              this.sound.play('sfx_slice1', { volume: 0.65 });
              if (options.floatingText) {
                this.showFloatingText(options.floatingText, 0xff6666);
              }
              if (phase === 'SELECT' && options.refillSelectHand) {
                void this.refillSelectHandAfterRaid().then(resolve);
                return;
              }
              if (phase === 'ROLL') {
                this.enterRollPhaseLayout();
              }
              resolve();
            }
          },
        });
      }
    });
  }

  private removeDestroyedDiceFromRoundState(destroyedSet: Set<string>): void {
    const phase = this.rs().phase;
    if (phase === 'SELECT') {
      this.patchRound({ hand: this.rs().hand.filter((d) => !destroyedSet.has(d.id)) });
      return;
    }
    if (phase === 'ROLL') {
      this.patchRound({
        rolledDice: this.rs().rolledDice.filter((d) => !destroyedSet.has(d.id)),
        selectedForScore: this.rs().selectedForScore.filter((d) => !destroyedSet.has(d.id)),
      });
      this.lockedDiceIds = new Set([...this.lockedDiceIds].filter((id) => !destroyedSet.has(id)));
    }
  }

  private getDicePouchLaunchPoint(): { x: number; y: number } {
    const matrix = this.dicePouch.getWorldTransformMatrix();
    return {
      x: matrix.tx + UI.POUCH_SIZE * 0.5,
      y: matrix.ty + UI.POUCH_SIZE * 0.5,
    };
  }

  private refillSelectHandAfterRaid(): Promise<void> {
    if (this.rs().phase !== 'SELECT') return Promise.resolve();

    const run = getRunState();
    const currentIds = new Set(this.rs().hand.map((d) => d.id));
    const needed = Math.max(0, getActiveRoundConfig().rollSize - this.rs().hand.length);
    if (needed <= 0) {
      this.repositionPlayArea(true);
      this.updateDrawButtons();
      return Promise.resolve();
    }

    const refillPool = rngShuffle(
      'dice',
      selectAvailableDice(run).filter((d) => !currentIds.has(d.id)),
    );
    const toAdd = refillPool.slice(0, needed);
    if (toAdd.length === 0) return Promise.resolve();

    const launch = this.getDicePouchLaunchPoint();
    const startingLength = this.playAreaSprites.length;
    const nextHand = [...this.rs().hand];
    for (const die of toAdd) {
      nextHand.push(die);
      const sprite = new DiceSprite(this, launch.x, launch.y, die);
      sprite.setDepth(20);
      sprite.setAlpha(0);
      sprite.setScale(0.2);
      this.setupPlayAreaSprite(sprite);
      sprite.disableInteractive();
      this.playAreaSprites.push(sprite);
    }
    this.patchRound({ hand: nextHand.slice(0, getActiveRoundConfig().rollSize) });

    const positions = this.getPlayAreaXPositions(this.playAreaSprites.length);
    for (let i = 0; i < startingLength; i++) {
      const arc = this.getArcOffset(i, this.playAreaSprites.length);
      this.tweens.add({
        targets: this.playAreaSprites[i],
        x: positions[i],
        y: this.playAreaY + arc.y,
        rotation: arc.rotation,
        duration: 220,
        ease: 'Power2',
      });
    }

    return new Promise((resolve) => {
      let completed = 0;
      for (let i = 0; i < toAdd.length; i++) {
        const sprite = this.playAreaSprites[startingLength + i];
        const idx = startingLength + i;
        const arc = this.getArcOffset(idx, this.playAreaSprites.length);
        this.tweens.add({
          targets: sprite,
          x: positions[idx],
          y: this.playAreaY + arc.y,
          rotation: arc.rotation,
          alpha: 1,
          scaleX: 1,
          scaleY: 1,
          duration: 320,
          delay: i * 90,
          ease: 'Back.easeOut',
          onStart: () => this.sound.play('sfx_card1', { volume: 0.35 }),
          onComplete: () => {
            completed++;
            if (completed >= toAdd.length) {
              this.updateDrawButtons();
              this.showFloatingText('Refilled from pouch', 0xffd700);
              resolve();
            }
          },
        });
      }
    });
  }

  // ─── Consumable Targeting Mode ───
  // When a consumable with diceSelection is used, we enter a targeting mode
  // where the player selects dice from the visible roll/play area to apply the effect.

  private enterConsumableTargeting(config: DiceSelectionConfig): void {
    this.consumableTargeting = config;
    this.consumableTargetIds = new Set();

    // In pre-roll SELECT phase, hand dice are normally non-interactive.
    // Consumable targeting needs temporary interaction to pick targets.
    if (this.rs().phase === 'SELECT') {
      for (const sprite of this.playAreaSprites) {
        sprite.setInteractive({ useHandCursor: true });
      }
    }

    // Save current state so we can restore
    this.savedInstructionText = this.instructionText.text;
    this.savedLockedDiceIds = new Set(this.lockedDiceIds);

    // Clear existing lock selections — we repurpose selection for targeting
    this.lockedDiceIds.clear();
    this.repositionRollDice(true, 150);

    // Hide normal game buttons
    this.hideAllButtons();

    // Show targeting UI
    const btnY = this.scale.height - 30;

    // For BUMP_VALUE, show two confirm buttons (+1 / -1)
    if (config.effectType === 'BUMP_VALUE') {
      this.consumableConfirmBtn = new Button(this, this.contentCX - 70, btnY, '+1 Up', 120, 40);
      this.consumableConfirmBtn.setEnabled(false);
      this.consumableConfirmBtn.onClick(() => {
        config.effectParams.bumpDirection = 'up';
        this.applyConsumableTargeting();
      });

      this.consumableCancelBtn = new Button(this, this.contentCX + 70, btnY, '-1 Down', 120, 40);
      this.consumableCancelBtn.onClick(() => {
        config.effectParams.bumpDirection = 'down';
        this.applyConsumableTargeting();
      });
      (this.consumableCancelBtn as Button).setEnabled(false);
    } else {
      this.consumableConfirmBtn = new Button(this, this.contentCX - 80, btnY, 'Apply', 140, 40);
      this.consumableConfirmBtn.setEnabled(false);
      this.consumableConfirmBtn.onClick(() => this.applyConsumableTargeting());

      this.consumableCancelBtn = new Button(this, this.contentCX + 80, btnY, 'Cancel', 120, 40);
      this.consumableCancelBtn.onClick(() => this.cancelConsumableTargeting());
    }

    this.updateConsumableTargetingText();
  }

  /** Get the dice sprites currently visible for targeting */
  private getTargetableDice(): { sprites: DiceSprite[]; dice: Die[] } {
    const phase = this.rs().phase;
    if (phase === 'ROLL' && this.rollSprites.length > 0) {
      return {
        sprites: this.rollSprites,
        dice: this.rs().rolledDice,
      };
    }
    if (phase === 'SELECT' && this.playAreaSprites.length > 0) {
      return {
        sprites: this.playAreaSprites,
        dice: this.rs().hand,
      };
    }
    // Fallback — roll sprites if available
    if (this.rollSprites.length > 0) {
      return {
        sprites: this.rollSprites,
        dice: this.rs().rolledDice,
      };
    }
    return { sprites: [], dice: [] };
  }

  /** Called when a die is clicked during consumable targeting mode */
  private onConsumableTargetClick(sprite: DiceSprite): void {
    if (!this.consumableTargeting) return;
    const id = sprite.dieData.id;
    const required = this.consumableTargeting.pickCount;

    if (this.consumableTargetIds.has(id)) {
      // Deselect
      this.consumableTargetIds.delete(id);
      sprite.setSelected(false);
      this.sound.play('sfx_card_slide2', { volume: 0.25 });
    } else if (this.consumableTargetIds.size < required) {
      // Select
      this.consumableTargetIds.add(id);
      sprite.setSelected(true);
      this.sound.play('sfx_highlight1', { volume: 0.3 });
    }

    const enough = this.consumableTargetIds.size === required;
    if (this.consumableConfirmBtn) this.consumableConfirmBtn.setEnabled(enough);
    // For BUMP_VALUE, the cancel button is actually the -1 Down button
    if (this.consumableTargeting.effectType === 'BUMP_VALUE' && this.consumableCancelBtn) {
      (this.consumableCancelBtn as Button).setEnabled(enough);
    }
    this.updateConsumableTargetingText();
  }

  private updateConsumableTargetingText(): void {
    if (!this.consumableTargeting) return;
    const required = this.consumableTargeting.pickCount;
    const selected = this.consumableTargetIds.size;
    const remaining = required - selected;
    const name = this.consumableTargeting.cardName || 'Effect';
    if (remaining > 0) {
      this.instructionText.setText(`${name}: Select ${remaining} more dice`);
    } else {
      this.instructionText.setText(`${name}: Ready! Click Apply`);
    }
  }

  private async applyConsumableTargeting(): Promise<void> {
    if (!this.consumableTargeting) return;
    const required = this.consumableTargeting.pickCount;
    if (this.consumableTargetIds.size !== required) return;
    const effectType = this.consumableTargeting.effectType;

    // Get the actual dice objects from the targetable set
    const { dice } = this.getTargetableDice();
    const selectedDice = dice.filter((d) => this.consumableTargetIds.has(d.id));

    // Apply the effect
    const resultMsg = applyDiceSelectionEffect(this.consumableTargeting, selectedDice);

    // Save affected IDs before exit clears them
    const affectedIds = new Set(this.consumableTargetIds);

    // Show result feedback
    const text = this.add
      .text(this.contentCX, this.scale.height * UI.ROLL_Y_RATIO - 60, resultMsg, {
        fontFamily: FONTS.HEADING,
        fontSize: '24px',
        color: '#66ff66',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(1000);
    this.tweens.add({
      targets: text,
      y: text.y - 30,
      alpha: 0,
      duration: 2000,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });

    this.exitConsumableTargeting();

    if (effectType === 'DESTROY') {
      await this.animateConsumableDiceDestruction([...affectedIds], {
        refillSelectHand: false,
        floatingText: `Destroyed ${affectedIds.size} dice`,
      });
      return;
    }

    // Refresh dice visuals — update only affected sprites to reflect changes
    this.refreshDiceSpritesAfterEffect(affectedIds, effectType);
  }

  private cancelConsumableTargeting(): void {
    this.exitConsumableTargeting();
  }

  private exitConsumableTargeting(): void {
    // Cleanup targeting UI
    if (this.consumableConfirmBtn) {
      this.consumableConfirmBtn.destroy();
      this.consumableConfirmBtn = null;
    }
    if (this.consumableCancelBtn) {
      this.consumableCancelBtn.destroy();
      this.consumableCancelBtn = null;
    }

    // Clear targeting selections
    const { sprites } = this.getTargetableDice();
    for (const s of sprites) {
      s.setSelected(false);
    }

    this.consumableTargeting = null;
    this.consumableTargetIds.clear();

    // Restore saved state
    this.lockedDiceIds = new Set(this.savedLockedDiceIds);
    this.instructionText.setText(this.savedInstructionText);

    // Restore locked-die lift positions
    if (this.rollSprites.length > 0) {
      this.repositionRollDice(true, 150);
    }

    // Restore game buttons for current phase
    const phase = this.rs().phase;
    if (phase === 'ROLL') {
      this.rerollBtn.setVisible(true);
      this.scoreBtn.setVisible(true);
      this.showSortButtons();
      this.updateRollButtons();
    } else if (phase === 'SELECT') {
      for (const sprite of this.playAreaSprites) {
        sprite.disableInteractive();
      }
      this.readyBtn.setVisible(true);
      this.updateDrawButtons();
    }
  }

  /** Refresh dice sprites in-place after a consumable effect changes dice data */
  private refreshDiceSpritesAfterEffect(affectedIds: Set<string>, effectType: DiceSelectionConfig['effectType']): void {
    const runDice = getRunState().dice;
    const shouldUpdateVisibleValue = shouldUpdateDisplayedDiceValue(effectType);

    // Update roll sprites if in ROLL phase — only update affected dice
    for (const sprite of this.rollSprites) {
      if (!affectedIds.has(sprite.dieData.id)) continue;
      const updated = runDice.find((d) => d.id === sprite.dieData.id);
      if (updated) {
        // Keep rolled face value stable unless the effect explicitly changes values.
        sprite.setDieData({
          ...sprite.dieData,
          ...updated,
          value: shouldUpdateVisibleValue ? updated.value : sprite.dieData.value,
        });
      }
    }

    const rolledDice = [...this.rs().rolledDice];
    for (let i = 0; i < rolledDice.length; i++) {
      const rd = rolledDice[i]!;
      if (!affectedIds.has(rd.id)) continue;
      const updated = runDice.find((d) => d.id === rd.id);
      if (updated) {
        rolledDice[i] = {
          ...rd,
          ...updated,
          value: shouldUpdateVisibleValue ? updated.value : rd.value,
        };
      }
    }
    this.patchRound({ rolledDice });

    // Update play area sprites if in SELECT phase
    for (const sprite of this.playAreaSprites) {
      if (!affectedIds.has(sprite.dieData.id)) continue;
      const updated = runDice.find((d) => d.id === sprite.dieData.id);
      if (updated) {
        sprite.setDieData({
          ...sprite.dieData,
          ...updated,
          value: shouldUpdateVisibleValue ? updated.value : sprite.dieData.value,
        });
      }
    }
  }

  private showFloatingText(message: string, color: number = 0xffd700): void {
    const hex = `#${color.toString(16).padStart(6, '0')}`;
    const text = this.add
      .text(this.contentCX, this.scale.height / 2, message, {
        fontFamily: FONTS.HEADING,
        fontSize: '24px',
        color: hex,
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(1000);

    this.tweens.add({
      targets: text,
      y: text.y - 40,
      alpha: 0,
      duration: 2000,
      ease: 'Power2',
      onComplete: () => text.destroy(),
    });
  }
}
