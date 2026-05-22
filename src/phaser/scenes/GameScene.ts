// ─── GameScene ───
// Main round scene. Creates a GameState instance, subscribes to state changes,
// renders DRAW/ROLL/SCORE phases, dispatches player actions.
// Balatro-inspired layout: sidebar left, equipment top, dice center, pouch bottom-right.

import { Scene } from 'phaser';
import * as Phaser from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { GameState } from '../../game/GameState';
import type { GameRoundSaveData } from '../../game/SaveLoad';
import { Die, ScoreResult, HandType } from '../../game/types';
import { detectBestHand } from '../../game/DiceSystem';
import { getPlayerState } from '../../game/PlayerState';
import { hasActiveTrailRoundEffects, trailRoundEffectsFromModifiers, getPlayerTrailDebuffLines } from '../../game/TrailEventsSystem';
import { applyEquipmentModifierDestructions, processEquipmentModifiersEndOfRound } from '../../game/EquipmentModifiers';
import { isEquipmentLeased } from '../../game/ItemsSystem';
import { consumeNextRoundTags } from '../../game/TagSystem';
import { COLORS, TEXT_COLORS, FONTS, UI, GAMEPLAY, ANIM } from '../../game/Constants';
import { DiceSprite } from '../ui/DiceSprite';
import { Button } from '../ui/Button';
import { Sidebar } from '../ui/Sidebar';
import { EquipmentBar } from '../ui/EquipmentBar';
import { ConsumableBar } from '../ui/ConsumableBar';
import {
  ConsumableAnimEvent,
  ConsumableDef,
  ConsumableInstance,
  executeConsumableEffect,
} from '../../game/ConsumablesSystem';
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
import { getLoadedDiceMultiplier } from '../../game/Constants';
import { isDiceScoringDisabledByBoss, isDiceLockedByBoss, revealLandSlideHints } from '../../game/BossEffectsSystem';
import { isDevMode } from '../../game/DevMode';

const DICE_SPACING = UI.DICE_SPACING;

interface DiceStackData {
  key: string;
  dice: Die[];
  sprites: DiceSprite[];
  countText: Phaser.GameObjects.Text;
  addBtn: Button | null;
  targetX: number;
}

export class GameScene extends Scene {
  private gameState: GameState;
  private sidebar: Sidebar;
  private equipBar: EquipmentBar;
  private consumableBar: ConsumableBar;
  private dicePouch: DicePouch;

  /** Dynamic roll size that respects permits and trail event penalties */
  private get maxSelectForRoll(): number {
    return this.gameState.config.rollSize;
  }

  // Layout helpers
  private contentCX: number = 0;
  private sidebarW: number = 0;

  // Dice sprites
  private handSprites: DiceSprite[] = [];
  private rollSprites: DiceSprite[] = [];

  // Dice stacking (SELECT phase)
  private availableStacks: DiceStackData[] = [];
  private playAreaSprites: DiceSprite[] = [];
  private playAreaY: number = 0;
  private availableY: number = 0;

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
  private selectedHandIds: Set<string> = new Set();
  private lockedDiceIds: Set<string> = new Set();

  // Lock icons
  private lockIcons: Phaser.GameObjects.Text[] = [];

  // Sort controls
  private sortOrder: 'asc' | 'desc' = 'asc';
  private sortAscBtn: Button;
  private sortDescBtn: Button;

  // Animation lock
  private animating: boolean = false;

  // Drag-to-reorder (play area)
  private draggingSprite: DiceSprite | null = null;
  private wasDragging: boolean = false;
  private dragOffsetX: number = 0;
  private dragOffsetY: number = 0;
  private dragPrevX: number = 0;
  private dragVelocityX: number = 0;

  // Loaded die target control
  private loadedDiceLabel: Phaser.GameObjects.Text;
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
  private pendingRestore: GameRoundSaveData | null = null;

  init(data: { restore?: GameRoundSaveData } = {}) {
    // Always discard prior round state — the scene instance is reused across rounds and
    // shutdown may not run before the next start (e.g. after autosave restore → win → new round).
    this.pendingRestore = data.restore ?? null;
    this.gameState = null!;
  }

  getGameState(): GameState {
    return this.gameState;
  }

  create() {
    // Initialize game state only on first create (not on relayout)
    if (!this.gameState) {
      const player = getPlayerState();
      if (this.pendingRestore) {
        this.gameState = new GameState();
        this.gameState.restoreRound(this.pendingRestore.config, this.pendingRestore.state);
        this.pendingRestore = null;
        this.pendingNewDiceIds = [];
        // Autosave from Shop may have pending modifiers not yet copied by startRound
        if (
          !hasActiveTrailRoundEffects(player.trailRoundEffects) &&
          hasActiveTrailRoundEffects(trailRoundEffectsFromModifiers(player.trailEventModifiers))
        ) {
          player.trailRoundEffects = trailRoundEffectsFromModifiers(player.trailEventModifiers);
        }
      } else {
        consumeNextRoundTags(player);
        this.gameState = new GameState({ targetMiles: player.targetMiles });
        this.gameState.startRound();
        // Pick up any dice added during leg transition or round start
        this.pendingNewDiceIds = player.pendingNewDiceIds.splice(0);
      }
      // Clear selection state from previous round (scene instance is reused)
      this.selectedHandIds = new Set();
      this.lockedDiceIds = new Set();
    }

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.destroyLoadedDicePicker();
      this.gameState = null!;
    });

    this.setupDragHandlers();
    this.buildLayout();

    // Animate round-start equipment destructions (Funeral Pyre, Haunted Totem, etc.)
    const pyrePlayer = getPlayerState();
    if (pyrePlayer.pendingAnimatedDestructions.length > 0) {
      this.animateRoundStartDestructions([...pyrePlayer.pendingAnimatedDestructions]);
      pyrePlayer.pendingAnimatedDestructions = [];
    }

    // Animate Junk Dealer equipment creation if pending
    if (pyrePlayer.pendingJunkDealerCount > 0) {
      this.animateJunkDealerCreation(pyrePlayer.pendingJunkDealerCount);
      pyrePlayer.pendingJunkDealerCount = 0;
    }

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

  private buildLayout(): void {
    const { height } = this.scale;

    const layout = createLayout(this, { bgKey: 'bg_1' });
    this.sidebar = layout.sidebar;
    this.equipBar = layout.equipBar;
    this.consumableBar = layout.consumableBar;
    this.consumableBar.setCanUsePredicate((def) => this.canUseConsumable(def));
    this.dicePouch = layout.dicePouch;
    this.sidebarW = layout.sidebarW;
    this.contentCX = layout.contentCX;

    // Refresh displays when equipment is sold from the bar
    this.equipBar.on('equipment-changed', () => {
      this.sidebar.refreshMoney();
      this.dicePouch.refresh();
      this.equipBar.updateHints(this.gameState, getPlayerState());
    });

    // Refresh displays when consumables change
    this.consumableBar.on('consumable-changed', () => {
      this.sidebar.refreshMoney();
      this.dicePouch.refresh();
      this.equipBar.updateHints(this.gameState, getPlayerState());
    });

    // Execute consumable effect when used
    this.consumableBar.on('consumable-used', (consumed: ConsumableInstance) => {
      this.handleConsumableUsed(consumed);
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

    this.hideAllButtons();

    // Re-enter current phase
    this.enterCurrentPhase();

    EventBus.emit(Events.SCENE_READY, this);
  }

  private enterCurrentPhase(): void {
    const phase = this.gameState.state.phase;
    if (phase === 'SELECT') {
      this.enterDrawPhase();
    } else if (phase === 'ROLL') {
      this.enterRollPhaseLayout();
    } else if (phase === 'SCORE' || phase === 'DAY_END') {
      this.enterRollPhaseLayout();
      // Auto-advance on DAY_END (scoring already handled)
      if (phase === 'DAY_END') {
        this.onContinue();
      }
    } else {
      this.enterDrawPhase();
    }
    this.updateHUD();
  }

  private onResize(): void {
    // Preserve game state, destroy all display objects, rebuild layout
    this.handSprites = [];
    this.rollSprites = [];
    this.availableStacks = [];
    this.playAreaSprites = [];
    this.children.removeAll(true);
    this.buildLayout();
  }

  // ─── Phase Rendering ───

  private enterDrawPhase(
    animateFromPouch: boolean = false,
    carryoverPositions: Map<string, { x: number; y: number; rotation: number }> | null = null,
  ): void {
    this.clearSprites();
    this.selectedHandIds = new Set(this.gameState.state.hand.map((die) => die.id));
    this.hideAllButtons();
    this.sidebar.clearHandDisplay();
    this.sidebar.updateData({ milesBase: 0, mult: 0 });
    this.enterDrawPhaseLayout(animateFromPouch, carryoverPositions);
  }

  /** Show the actual SELECT phase UI (called after refresh prompt is resolved or not needed) */
  private enterDrawPhaseLayout(
    animateFromPouch: boolean = false,
    carryoverPositions: Map<string, { x: number; y: number; rotation: number }> | null = null,
  ): void {
    const { height } = this.scale;
    this.playAreaY = height * UI.ROLL_Y_RATIO;
    this.availableY = height * UI.HAND_Y_RATIO;

    const hand = this.gameState.state.hand;
    this.handSprites = this.createDiceRow(hand, this.playAreaY);
    this.playAreaSprites = [...this.handSprites];
    for (const sprite of this.playAreaSprites) {
      this.setupPlayAreaSprite(sprite);
      sprite.disableInteractive();
    }

    if (animateFromPouch && this.playAreaSprites.length > 0) {
      const launch = this.getDicePouchLaunchPoint();
      this.animating = true;
      let completed = 0;
      let newDiceIndex = 0;
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
              this.animating = false;
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

    const spent = this.gameState.state.spent.length;
    this.instructionText.setText(`Roll ${hand.length} drawn dice (${spent} spent)`);

    this.updateHUD();
  }

  private enterRollPhase(): void {
    this.clearSprites();
    this.lockedDiceIds.clear();
    this.hideAllButtons();

    // Create sprites for rolled dice
    const rolled = this.gameState.state.rolledDice;
    this.rollSprites = this.createDiceRow(rolled, this.scale.height * UI.ROLL_Y_RATIO);
    this.createLockIcons();

    // Play roll animation
    this.animating = true;
    playRollAnimation(this, this.rollSprites, rolled, () => {
      this.animating = false;
      this.sortAndRepositionDice();
      this.setupRollSpriteInteraction();

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
        sprite.setForced(true);
        const lockIdx = this.rollSprites.indexOf(sprite);
        if (this.lockIcons[lockIdx]) this.lockIcons[lockIdx].setVisible(true);
      }
    }
    this.gameState.state.selectedForScore = this.gameState.state.rolledDice.filter((d) => this.lockedDiceIds.has(d.id));
    this.updateRollButtons();
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
        if (this.wasDragging || this.animating) return;

        // Consumable targeting mode takes over click behavior
        if (this.consumableTargeting) {
          this.onConsumableTargetClick(sprite);
          return;
        }

        const id = sprite.dieData.id;
        if (isDiceLockedByBoss(id)) return;
        const lockIdx = this.rollSprites.indexOf(sprite);
        const lockIcon = this.lockIcons[lockIdx];
        if (this.lockedDiceIds.has(id)) {
          this.lockedDiceIds.delete(id);
          sprite.setSelected(false);
          if (lockIcon) lockIcon.setVisible(false);
          this.sound.play('sfx_card_slide2', { volume: 0.25 });
        } else {
          this.lockedDiceIds.add(id);
          sprite.setSelected(true);
          if (lockIcon) lockIcon.setVisible(true);
          this.sound.play('sfx_highlight1', { volume: 0.3 });
        }
        // Keep selectedForScore in sync with locked dice so equipment hints can read it
        this.gameState.state.selectedForScore = this.gameState.state.rolledDice.filter((d) =>
          this.lockedDiceIds.has(d.id),
        );
        this.updateRollButtons();
      });
    }
  }

  /** Create lock icons below each roll sprite (hidden initially) */
  private createLockIcons(): void {
    this.clearLockIcons();
    for (const sprite of this.rollSprites) {
      const lockIcon = this.add
        .text(sprite.x, sprite.y + 46, '🔒', {
          fontSize: '14px',
        })
        .setOrigin(0.5)
        .setDepth(11)
        .setVisible(false);
      this.lockIcons.push(lockIcon);
    }
  }

  /** Destroy all lock icons */
  private clearLockIcons(): void {
    for (const icon of this.lockIcons) icon.destroy();
    this.lockIcons = [];
  }

  /** Layout-only version for resize: shows rolled dice without replaying animation */
  private enterRollPhaseLayout(): void {
    this.clearSprites();
    this.lockedDiceIds.clear();
    this.hideAllButtons();

    const rolled = this.gameState.state.rolledDice;
    this.rollSprites = this.createDiceRow(rolled, this.scale.height * UI.ROLL_Y_RATIO);
    this.createLockIcons();
    this.setupRollSpriteInteraction();

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
    this.clearLockIcons();

    // Show hand name and level in sidebar
    const player = getPlayerState();
    const handType = result.handResult.type as HandType;
    const stats = player.getHandStats(handType);
    this.sidebar.updateData({
      title: 'SCORING',
      handName: result.handResult.name,
      handLevel: stats.level,
    });

    // Store round score before this hand for the animation
    const roundScoreBefore = this.gameState.state.totalMiles - result.miles;
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
      lockedDiceIds: new Set(this.lockedDiceIds),
      contentCX: this.contentCX,
      onComplete: () => {
        revealLandSlideHints();
        this.equipBar.updateHints(this.gameState, getPlayerState());

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
    const ids = this.gameState.state.hand.map((die) => die.id);
    const success = this.gameState.selectForRoll(ids);
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
    const allIds = this.gameState.state.rolledDice.map((d) => d.id);
    const idsToReroll = allIds.filter((id) => !this.lockedDiceIds.has(id));
    if (idsToReroll.length === 0) return;

    const success = this.gameState.reroll(idsToReroll);
    if (!success && this.gameState.state.rerollsRemaining > 0 && !this.gameState.canUseReroll()) {
      this.showFloatingText('No re-rolls on Day 1', 0xffaa44);
      return;
    }
    if (success) {
      this.animating = true;
      const rerolledSprites = this.rollSprites.filter((s) => idsToReroll.includes(s.dieData.id));
      const rolled = this.gameState.state.rolledDice;

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

    const validation = this.gameState.validateScoreSelection(ids);
    if (!validation.allowed) {
      this.showFloatingText(validation.reason ?? 'Cannot play this hand', 0xff6644);
      return;
    }

    const success = this.gameState.selectForScore(ids);
    if (!success) return;

    const result = this.gameState.calculateScore();
    if (result) {
      this.enterScorePhase(result);
    } else {
      this.gameState.cancelScore();
      this.showFloatingText('Cannot play this hand', 0xff6644);
      this.updateRollButtons();
    }
  }

  /** Developer profession: instantly win the round for faster testing. */
  private onDevWinRound(): void {
    if (!isDevMode() || this.animating) return;

    this.hideAllButtons();
    this.clearSprites();
    this.gameState.state.totalMiles = 1_000_000;
    this.gameState.state.phase = 'DAY_END';
    this.updateHUD();
    this.onContinue();
  }

  private onContinue(): void {
    if (this.animating) return;

    const scoredIds = new Set(this.gameState.state.selectedForScore.map((d) => d.id));
    const heldDice = this.gameState.state.rolledDice.filter((d) => !scoredIds.has(d.id));
    const player = getPlayerState();
    const goldHeld = processGoldHeldAtRoundEnd(heldDice, player.equipment);

    const { outcome, destroyedEquipment } = this.gameState.endDay();

    // Show destroyed equipment animation (e.g. dynamite explosion)
    if (destroyedEquipment.length > 0) {
      this.equipBar.refresh();
      for (const name of destroyedEquipment) {
        this.showFloatingText(`💥 ${name} destroyed!`, 0xff4444);
      }
    }

    if (outcome === 'won' || outcome === 'lost') {
      const playGoldThenFinish = () => {
        if (goldHeld.moneyEarned > 0) {
          player.economy.earn(goldHeld.moneyEarned);
          this.sidebar.refreshMoney();
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
      return;
    }

    const carryover = new Map<string, { x: number; y: number; rotation: number }>();
    for (const sprite of this.rollSprites) {
      carryover.set(sprite.dieData.id, { x: sprite.x, y: sprite.y, rotation: sprite.rotation });
    }
    this.enterDrawPhase(true, carryover);
  }

  private runRoundEndModifierFeedback(onComplete: () => void): void {
    const player = getPlayerState();
    const modifierResult = processEquipmentModifiersEndOfRound(player, { applyDestruction: false });
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
        applyEquipmentModifierDestructions(player, modifierResult);
        this.equipBar.refresh();
      }
      this.equipBar.updateHints(this.gameState, player);
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
      const player = getPlayerState();
      const daysRemaining = this.gameState.config.maxDays - this.gameState.state.day;
      const rerollsRemaining = this.gameState.state.rerollsRemaining;
      this.scene.start('Payout', {
        totalMiles: this.gameState.state.totalMiles,
        targetMiles: this.gameState.config.targetMiles,
        daysRemaining,
        rerollsRemaining,
        leg: player.leg,
        round: player.round,
        isVictory: player.isBossRound && player.leg === GAMEPLAY.LEGS,
      });
    } else {
      this.sound.play('sfx_negative', { volume: 0.5 });
      const player = getPlayerState();
      this.scene.start('GameOver', {
        won: false,
        victory: false,
        totalMiles: this.gameState.state.totalMiles,
        targetMiles: this.gameState.config.targetMiles,
        leg: player.leg,
        round: player.round,
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
    for (const s of this.handSprites) s.destroy();
    for (const s of this.rollSprites) s.destroy();
    for (const stack of this.availableStacks) {
      for (const s of stack.sprites) s.destroy();
      stack.countText.destroy();
      if (stack.addBtn) stack.addBtn.destroy();
    }
    for (const s of this.playAreaSprites) s.destroy();
    this.clearLockIcons();
    this.handSprites = [];
    this.rollSprites = [];
    this.availableStacks = [];
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
    const drawCount = this.gameState.state.hand.length;
    this.readyBtn.setText(drawCount > 0 ? `Roll ${drawCount} Dice` : 'No Dice To Roll');
    this.readyBtn.setEnabled(drawCount > 0);
  }

  private updateRollButtons(): void {
    const lockedCount = this.lockedDiceIds.size;
    const totalCount = this.gameState.state.rolledDice.length;
    const rerollCount = totalCount - lockedCount;
    const remaining = this.gameState.state.rerollsRemaining;
    const hasRerolls = remaining > 0;
    const canUseReroll = this.gameState.canUseReroll();

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
      const lockedDice = this.gameState.state.rolledDice.filter((d) => this.lockedDiceIds.has(d.id));
      const handResult = detectBestHand(lockedDice);
      const player = getPlayerState();
      const stats = player.getHandStats(handResult.type);
      const levelBonus = stats.level - 1;
      const baseMiles = handResult.baseMiles + stats.milesPerLevel * levelBonus;
      const baseMult = handResult.baseMult + stats.multPerLevel * levelBonus;
      this.sidebar.updateData({
        handName: handResult.name,
        handLevel: stats.level,
        milesBase: baseMiles,
        mult: baseMult,
      });
    } else {
      this.sidebar.clearHandDisplay();
      this.sidebar.updateData({ milesBase: 0, mult: 0 });
    }

    // Refresh equipment hints so items reading selectedForScore update live
    if (this.equipBar) {
      this.equipBar.updateHints(this.gameState, getPlayerState());
    }
  }

  /** Sort roll sprites by die value and reposition them with lock icons */
  private sortAndRepositionDice(): void {
    // Stone dice sort as highest (above 12s)
    const sortValue = (d: Die) => (d.enhancement === 'stone' ? 13 : d.value);
    const cmp =
      this.sortOrder === 'asc'
        ? (a: DiceSprite, b: DiceSprite) => sortValue(a.dieData) - sortValue(b.dieData)
        : (a: DiceSprite, b: DiceSprite) => sortValue(b.dieData) - sortValue(a.dieData);
    this.rollSprites.sort(cmp);

    const rollY = this.scale.height * UI.ROLL_Y_RATIO;
    const totalWidth = (this.rollSprites.length - 1) * DICE_SPACING;
    const startX = this.contentCX - totalWidth / 2;
    for (let i = 0; i < this.rollSprites.length; i++) {
      const sprite = this.rollSprites[i];
      const arc = this.getArcOffset(i, this.rollSprites.length);
      const targetX = startX + i * DICE_SPACING;
      const targetY = rollY + arc.y;

      this.tweens.add({
        targets: sprite,
        x: targetX,
        y: targetY,
        rotation: arc.rotation,
        duration: 250,
        ease: 'Power2',
      });

      // Animate lock icon position
      if (this.lockIcons[i]) {
        this.tweens.add({
          targets: this.lockIcons[i],
          x: targetX,
          y: targetY + 46,
          duration: 250,
          ease: 'Power2',
        });
        this.lockIcons[i].setVisible(this.lockedDiceIds.has(sprite.dieData.id));
      }
    }
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
    const s = this.gameState.state;
    const player = getPlayerState();
    const boss = player.currentBoss;
    this.sidebar.updateData({
      boss: boss ?? null,
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
      roundScore: s.totalMiles,
      milesBase: 0,
      mult: 0,
      daysRemaining: this.gameState.config.maxDays - s.day + 1,
      rerolls: s.rerollsRemaining,
      leg: player.leg,
      totalLegs: GAMEPLAY.LEGS,
      round: player.round,
      totalRounds: GAMEPLAY.ROUNDS_PER_LEG,
      targetMiles: this.gameState.config.targetMiles,
      trailDebuffs: getPlayerTrailDebuffLines(player),
    });
    if (this.dicePouch) this.dicePouch.refresh();
    if (this.equipBar) {
      this.equipBar.refresh();
      this.equipBar.updateHints(this.gameState, player);
    }
    this.updateLoadedDiceControl();
  }

  private buildLoadedDiceControl(): void {
    const { height } = this.scale;
    const controlLeft = this.sidebarW + 18;
    const controlY = height - 34;
    const boxWidth = 44;
    const boxHeight = 28;
    const boxCenterX = controlLeft + 50;

    this.loadedDiceLabel = this.add
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
    const player = getPlayerState();
    const current = player.loadedDieTarget;

    let nextValue: number | null;
    if (delta > 0) {
      nextValue = current === null ? 1 : Math.min(12, current + 1);
    } else {
      nextValue = current === null ? null : current === 1 ? null : current - 1;
    }

    player.setLoadedDieTarget(nextValue);
    this.updateLoadedDiceControl();
    this.destroyLoadedDicePicker();
  }

  private updateLoadedDiceControl(): void {
    if (!this.loadedDiceValueText || !this.loadedDiceDecBtn || !this.loadedDiceIncBtn || !this.loadedDiceValueBg)
      return;

    const target = getPlayerState().loadedDieTarget;
    this.loadedDiceValueText.setText(target === null ? '-' : String(target));
    this.loadedDiceValueText.setColor(target === null ? TEXT_COLORS.SECONDARY : TEXT_COLORS.PRIMARY);
    this.loadedDiceDecBtn.setEnabled(target !== null);
    this.loadedDiceIncBtn.setEnabled(target === null || target < 12);

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
    const panelWidth = 208;
    const panelHeight = 214;
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
    const selected = getPlayerState().loadedDieTarget;

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
        getPlayerState().setLoadedDieTarget(value);
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

    const clearBtn = new Button(this, panelCenterX, panelY + panelHeight - 24, 'Clear', 86, 26).onClick(() => {
      getPlayerState().setLoadedDieTarget(null);
      this.destroyLoadedDicePicker();
    });
    clearBtn.setDepth(501);
    (clearBtn as any).label?.setFontSize?.(13);
    clearBtn.setEnabled(selected !== null);
    picker.add(clearBtn);

    return picker;
  }

  private getLoadedDiceOddsNote(): string {
    const chance = Math.min(1, getLoadedDiceMultiplier(getPlayerState().equipment) / 6);
    if (chance >= 1) return 'Selected face is guaranteed to roll.';
    if (chance === 2 / 3) return 'Selected face rolls at 2 in 3.';
    if (chance === 1 / 3) return 'Selected face rolls at 1 in 3.';
    return 'Selected face rolls at 1 in 6.';
  }

  // ─── Dice Stacking & Play Area ───

  /** Generate a grouping key for dice with the same properties (ignoring current face value) */
  private getDiceGroupKey(die: Die): string {
    return `${die.enhancement || ''}|${die.aura || ''}|${die.sticker || ''}|${die.isGrimy}`;
  }

  /** Calculate target X positions for all non-empty stacks */
  private layoutStacks(): void {
    const visibleStacks = this.availableStacks.filter((s) => s.dice.length > 0);
    const spacing = DICE_SPACING + 16;
    const totalWidth = Math.max(0, visibleStacks.length - 1) * spacing;
    const startX = this.contentCX - totalWidth / 2;

    for (let i = 0; i < visibleStacks.length; i++) {
      visibleStacks[i].targetX = startX + i * spacing;
    }
  }

  /** Render all stacks at their target positions */
  private renderAllStacks(): void {
    for (const stack of this.availableStacks) {
      this.renderStack(stack);
    }
  }

  /** Render a single stack's sprites at its targetX */
  private renderStack(stack: DiceStackData): void {
    // Destroy old sprites
    for (const s of stack.sprites) s.destroy();
    stack.sprites = [];

    if (stack.dice.length === 0) {
      stack.countText.setVisible(false);
      return;
    }

    const maxVisible = Math.min(stack.dice.length, 3);
    const representativeDie = stack.dice[0]; // All visually identical

    // Stacking offsets for depth effect
    const rotations = maxVisible === 1 ? [0] : maxVisible === 2 ? [-0.07, 0.03] : [-0.07, 0.04, -0.01];
    const yOffsets = maxVisible === 1 ? [0] : maxVisible === 2 ? [5, 0] : [8, 4, 0];
    const xOffsets = maxVisible === 1 ? [0] : maxVisible === 2 ? [-2, 0] : [-3, 1, 0];

    for (let i = 0; i < maxVisible; i++) {
      const sprite = new DiceSprite(
        this,
        stack.targetX + xOffsets[i],
        this.availableY + yOffsets[i],
        representativeDie,
      );
      sprite.setRotation(rotations[i]);
      sprite.setDepth(10 + i);

      if (i < maxVisible - 1) {
        sprite.disableInteractive();
        sprite.setAlpha(0.55 + i * 0.15);
      }

      stack.sprites.push(sprite);
    }

    // Wire click on top sprite
    const topSprite = stack.sprites[stack.sprites.length - 1];
    topSprite.on('pointerdown', () => this.onStackDiceClick(stack));

    // Update count text
    stack.countText.setText(`\u00d7${stack.dice.length}`);
    stack.countText.setX(stack.targetX);
    stack.countText.setY(this.availableY + 44);
    stack.countText.setVisible(stack.dice.length > 1);

    // Add "Add X" button below the stack
    if (stack.addBtn) {
      stack.addBtn.destroy();
      stack.addBtn = null;
    }
    const remaining = this.maxSelectForRoll - this.selectedHandIds.size;
    if (remaining > 0 && stack.dice.length > 0) {
      const addCount = Math.min(remaining, stack.dice.length);
      stack.addBtn = new Button(
        this,
        stack.targetX,
        this.availableY + (stack.dice.length > 1 ? 72 : 56),
        `Add ${addCount}`,
        72,
        28,
      );
      stack.addBtn.setDepth(15);
      // Smaller font for this button
      (stack.addBtn as any).label?.setFontSize?.(13);
      stack.addBtn.onClick(() => this.onAddAllClick(stack));
    }
  }

  /** Animate all stacks' existing sprites to their targetX positions */
  private animateStacksToTargets(): void {
    for (const stack of this.availableStacks) {
      if (stack.dice.length === 0 || stack.sprites.length === 0) continue;
      const topSprite = stack.sprites[stack.sprites.length - 1];
      const deltaX = stack.targetX - topSprite.x;
      for (const sprite of stack.sprites) {
        this.tweens.add({
          targets: sprite,
          x: sprite.x + deltaX,
          duration: 200,
          ease: 'Power2',
        });
      }
      this.tweens.add({
        targets: stack.countText,
        x: stack.targetX,
        duration: 200,
        ease: 'Power2',
      });
      if (stack.addBtn) {
        this.tweens.add({
          targets: stack.addBtn,
          x: stack.targetX,
          duration: 200,
          ease: 'Power2',
        });
      }
    }
  }

  /** Animate new dice popping into existence (Mystery Crate, Quarry Stone, etc.) */
  private animateNewDiceAppearing(): void {
    const newIds = new Set(this.pendingNewDiceIds);

    // Find stacks containing the new dice and animate their sprites
    for (const stack of this.availableStacks) {
      const hasNewDie = stack.dice.some((d) => newIds.has(d.id));
      if (!hasNewDie) continue;

      // Animate all sprites in this stack with a pop-in
      for (const sprite of stack.sprites) {
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

      // Also pop the count text
      stack.countText.setScale(0);
      this.tweens.add({
        targets: stack.countText,
        scaleX: 1,
        scaleY: 1,
        duration: 300,
        delay: 150,
        ease: 'Back.easeOut',
      });
    }

    // Wiggle the Mystery Crate equipment card
    const player = getPlayerState();
    const crateIndex = player.equipment.findIndex((e) => e.def.effectType === 'ROUND_START_ADD_DICE');
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
      .text(this.contentCX, this.availableY - 50, '✨ New Die Added!', {
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

  /** Animate an equipment card being destroyed by fire (used by Funeral Pyre, Haunted Totem, etc.) */
  private animateEquipmentFireDestruction(sourceIndex: number, victimIndex: number, onComplete?: () => void): void {
    ensureAuraTextures(this);
    const sourceCard = this.equipBar.getCardByEquipIndex(sourceIndex);
    const victimCard = this.equipBar.getCardByEquipIndex(victimIndex);
    if (!sourceCard || !victimCard) {
      // Fallback: just remove immediately if cards aren't available
      const player = getPlayerState();
      player.equipment.splice(victimIndex, 1);
      this.equipBar.refresh();
      onComplete?.();
      return;
    }

    // Get world position of victim card
    const victimMatrix = victimCard.getWorldTransformMatrix();
    const victimWorldX = victimMatrix.tx;
    const victimWorldY = victimMatrix.ty;

    // Phase 1: Fire aura glow on victim + ambient fire sound
    const fireSound = this.sound.add('sfx_ambient_fire', { volume: 1.5 });
    fireSound.play();

    // Create fire particles on the victim card (in scene space)
    const fireEmitter = this.add.particles(victimWorldX, victimWorldY, 'aura_soft', {
      speed: { min: 20, max: 60 },
      angle: { min: -110, max: -70 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 0.9, end: 0 },
      lifespan: { min: 500, max: 900 },
      frequency: 30,
      quantity: 3,
      tint: [0xff2200, 0xff4500, 0xff6600, 0xffaa00, 0xffdd00],
      blendMode: 'ADD',
      emitZone: {
        type: 'random',
        source: new Phaser.Geom.Rectangle(-40, -50, 80, 100),
      } as any,
      maxAliveParticles: 40,
    });
    fireEmitter.setDepth(500);

    // Shake the source card
    const sourceOrigX = sourceCard.x;
    this.tweens.add({
      targets: sourceCard,
      x: sourceOrigX - 3,
      duration: 50,
      yoyo: true,
      repeat: 5,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        sourceCard.x = sourceOrigX;
      },
    });

    // Phase 2: After brief fire buildup, play slice and destroy
    this.time.delayedCall(600, () => {
      this.sound.play('sfx_slice1', { volume: 0.7 });

      // Flash victim card red
      this.tweens.add({
        targets: victimCard,
        alpha: 0,
        scaleX: 0.3,
        scaleY: 0.3,
        rotation: victimCard.rotation + 0.3,
        duration: 400,
        ease: 'Power2',
      });

      // Burst of sparks
      const sparkEmitter = this.add.particles(victimWorldX, victimWorldY, 'aura_soft', {
        speed: { min: 80, max: 180 },
        angle: { min: 0, max: 360 },
        scale: { start: 0.5, end: 0 },
        alpha: { start: 1, end: 0 },
        lifespan: { min: 300, max: 600 },
        frequency: -1,
        quantity: 20,
        tint: [0xff4400, 0xffaa00, 0xffdd00],
        blendMode: 'ADD',
      });
      sparkEmitter.setDepth(500);
      sparkEmitter.explode(20);

      // Phase 3: Cleanup and actually remove equipment
      this.time.delayedCall(500, () => {
        fireEmitter.stop();
        // Fade out the ambient fire sound
        this.tweens.add({
          targets: fireSound,
          volume: 0,
          duration: 300,
          onComplete: () => fireSound.destroy(),
        });
        this.time.delayedCall(1000, () => {
          fireEmitter.destroy();
          sparkEmitter.destroy();
        });

        // Actually remove the equipment
        const player = getPlayerState();
        player.equipment.splice(victimIndex, 1);
        this.equipBar.refresh();
        onComplete?.();
      });
    });
  }

  /** Animate a sequence of round-start equipment destructions in order, adjusting indices after each splice */
  private animateRoundStartDestructions(destructions: { sourceIdx: number; victimIdx: number }[]): void {
    if (destructions.length === 0) return;

    const { sourceIdx, victimIdx } = destructions[0];

    // Adjust remaining destructions' indices after this victim is spliced out
    const remaining = destructions.slice(1).map((d) => ({
      sourceIdx: d.sourceIdx > victimIdx ? d.sourceIdx - 1 : d.sourceIdx,
      victimIdx: d.victimIdx > victimIdx ? d.victimIdx - 1 : d.victimIdx,
    }));

    this.animateEquipmentFireDestruction(sourceIdx, victimIdx, () => {
      // Small delay between sequential destructions
      this.time.delayedCall(200, () => {
        this.animateRoundStartDestructions(remaining);
      });
    });
  }

  /** Animate Junk Dealer equipment cards popping into the equipment bar */
  private animateJunkDealerCreation(count: number): void {
    // Equipment is already in player.equipment — refresh to render them
    this.equipBar.refresh();

    const cards = this.equipBar.getCards();
    const newCards = cards.slice(cards.length - count);

    for (let i = 0; i < newCards.length; i++) {
      const card = newCards[i];
      card.setScale(0);
      card.setAlpha(0);

      this.time.delayedCall(i * 150, () => {
        this.sound.play('sfx_card1', { volume: 0.5 });
        this.tweens.add({
          targets: card,
          scaleX: UI.EQUIP_CARD_SCALE,
          scaleY: UI.EQUIP_CARD_SCALE,
          alpha: 1,
          duration: 300,
          ease: 'Back.easeOut',
        });
      });
    }
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

  /** Handle clicking a stack to send a die to the play area */
  private onStackDiceClick(stack: DiceStackData): void {
    console.log(
      '[DEBUG] onStackDiceClick: animating:',
      this.animating,
      'selectedCount:',
      this.selectedHandIds.size,
      'stackKey:',
      stack.key,
      'stackDice:',
      stack.dice.length,
    );
    if (this.animating) {
      console.log('[DEBUG] BLOCKED by animating flag');
      return;
    }
    if (this.selectedHandIds.size >= this.maxSelectForRoll) {
      console.log('[DEBUG] BLOCKED: max selected');
      return;
    }
    // Sound
    this.sound.play('sfx_card_slide1', { volume: 0.4 });

    // Pop a die from the stack
    const die = stack.dice.pop()!;
    this.selectedHandIds.add(die.id);

    // Get position of top sprite before refresh
    const topSprite = stack.sprites[stack.sprites.length - 1];
    const fromX = topSprite.x;
    const fromY = topSprite.y;

    // Refresh stack visuals at current position
    this.renderStack(stack);

    // If stack is now empty, recalculate and animate remaining stacks
    if (stack.dice.length === 0) {
      this.layoutStacks();
      this.animateStacksToTargets();
    }

    // Create play area sprite at stack position
    const newSprite = new DiceSprite(this, fromX, fromY, die);
    newSprite.setDepth(20);
    this.playAreaSprites.push(newSprite);
    this.setupPlayAreaSprite(newSprite);

    // Calculate target positions
    const positions = this.getPlayAreaXPositions(this.playAreaSprites.length);
    const targetIdx = this.playAreaSprites.length - 1;

    // Animate new sprite to play area
    this.animating = true;
    const newArc = this.getArcOffset(targetIdx, this.playAreaSprites.length);
    this.tweens.add({
      targets: newSprite,
      x: positions[targetIdx],
      y: this.playAreaY + newArc.y,
      rotation: newArc.rotation,
      duration: 300,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.animating = false;
      },
    });

    // Reposition existing play area sprites to accommodate
    for (let i = 0; i < this.playAreaSprites.length - 1; i++) {
      const arc = this.getArcOffset(i, this.playAreaSprites.length);
      this.tweens.add({
        targets: this.playAreaSprites[i],
        x: positions[i],
        y: this.playAreaY + arc.y,
        rotation: arc.rotation,
        duration: 200,
        ease: 'Power2',
      });
    }

    this.updateDrawButtons();
  }

  /** Handle clicking "Add X" to send multiple dice from a stack to the play area */
  private onAddAllClick(stack: DiceStackData): void {
    if (this.animating) return;
    const remaining = this.maxSelectForRoll - this.selectedHandIds.size;
    if (remaining <= 0) return;

    const addCount = Math.min(remaining, stack.dice.length);
    if (addCount === 0) return;

    // Pop dice from stack
    const diceToAdd = stack.dice.splice(stack.dice.length - addCount, addCount);
    for (const die of diceToAdd) {
      this.selectedHandIds.add(die.id);
    }

    // Get position of top sprite before refresh
    const fromX = stack.targetX;
    const fromY = this.availableY;

    // Refresh stack visuals
    this.renderStack(stack);
    if (stack.dice.length === 0) {
      this.layoutStacks();
      this.animateStacksToTargets();
    }

    // Create play area sprites and animate them
    this.animating = true;
    let completed = 0;
    const total = diceToAdd.length;

    for (let i = 0; i < diceToAdd.length; i++) {
      const die = diceToAdd[i];
      const newSprite = new DiceSprite(this, fromX, fromY, die);
      newSprite.setDepth(20);
      this.playAreaSprites.push(newSprite);
      this.setupPlayAreaSprite(newSprite);
    }

    // Animate all to final positions
    const positions = this.getPlayAreaXPositions(this.playAreaSprites.length);
    for (let i = 0; i < this.playAreaSprites.length; i++) {
      const sprite = this.playAreaSprites[i];
      const arc = this.getArcOffset(i, this.playAreaSprites.length);
      this.tweens.add({
        targets: sprite,
        x: positions[i],
        y: this.playAreaY + arc.y,
        rotation: arc.rotation,
        duration: 300,
        ease: 'Back.easeOut',
        delay: i >= this.playAreaSprites.length - total ? (i - (this.playAreaSprites.length - total)) * 40 : 0,
        onComplete: () => {
          completed++;
          if (completed >= this.playAreaSprites.length) {
            this.animating = false;
          }
        },
      });
    }

    this.updateDrawButtons();
  }

  /** Refresh the add buttons on all stacks to reflect current remaining slots */
  private refreshAllAddButtons(): void {
    for (const stack of this.availableStacks) {
      if (stack.addBtn) {
        stack.addBtn.destroy();
        stack.addBtn = null;
      }
      const remaining = this.maxSelectForRoll - this.selectedHandIds.size;
      if (remaining > 0 && stack.dice.length > 0) {
        const addCount = Math.min(remaining, stack.dice.length);
        stack.addBtn = new Button(
          this,
          stack.targetX,
          this.availableY + (stack.dice.length > 1 ? 72 : 56),
          `Add ${addCount}`,
          72,
          28,
        );
        stack.addBtn.setDepth(15);
        stack.addBtn.onClick(() => this.onAddAllClick(stack));
      }
    }
  }

  /** Handle clicking a die in the play area to send it back to a stack */
  private onPlayAreaDiceClick(sprite: DiceSprite): void {
    console.log('[DEBUG] onPlayAreaDiceClick: animating:', this.animating, 'dieId:', sprite.dieData.id);
    if (this.animating) {
      console.log('[DEBUG] BLOCKED by animating flag');
      return;
    }
    const die = sprite.dieData;

    // Sound
    this.sound.play('sfx_card_slide2', { volume: 0.35 });

    // Remove from play area
    const idx = this.playAreaSprites.indexOf(sprite);
    if (idx === -1) return;
    this.playAreaSprites.splice(idx, 1);
    this.selectedHandIds.delete(die.id);

    // Find or create the matching stack
    const key = this.getDiceGroupKey(die);
    let stack = this.availableStacks.find((s) => s.key === key);

    if (!stack) {
      const countText = this.add
        .text(0, this.availableY + 44, '', {
          fontFamily: FONTS.PRIMARY,
          fontSize: '14px',
          color: TEXT_COLORS.SECONDARY,
        })
        .setOrigin(0.5)
        .setDepth(15);
      stack = { key, dice: [], sprites: [], countText, addBtn: null, targetX: 0 };
      this.availableStacks.push(stack);
    }

    // Push die back to stack
    stack.dice.push(die);

    // Recalculate stack positions
    this.layoutStacks();

    // Animate sprite to stack target
    this.animating = true;
    const targetStack = stack;
    this.tweens.add({
      targets: sprite,
      x: targetStack.targetX,
      y: this.availableY,
      rotation: 0,
      duration: 300,
      ease: 'Power2',
      onComplete: () => {
        sprite.destroy();
        this.renderStack(targetStack);
        this.animating = false;
      },
    });

    // Animate other stacks to new positions
    this.animateStacksToTargets();

    // Reposition play area
    const positions = this.getPlayAreaXPositions(this.playAreaSprites.length);
    for (let i = 0; i < this.playAreaSprites.length; i++) {
      const arc = this.getArcOffset(i, this.playAreaSprites.length);
      this.tweens.add({
        targets: this.playAreaSprites[i],
        x: positions[i],
        y: this.playAreaY + arc.y,
        rotation: arc.rotation,
        duration: 200,
        ease: 'Power2',
      });
    }

    this.updateDrawButtons();
  }

  // ─── Drag-to-Reorder (Play Area) ───

  /** Get the active draggable sprite list (play area in SELECT, roll sprites in ROLL) */
  private getDraggableList(): DiceSprite[] | null {
    if (this.rollSprites.length > 0) return this.rollSprites;
    return null;
  }

  /** Get the row Y and position calculator for the active draggable list */
  private getDraggableRowY(): number {
    const phase = this.gameState.state.phase;
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
          this.tweens.add({
            targets: list[i],
            x: positions[i],
            y: rowY + arc.y,
            rotation: arc.rotation,
            duration: 150,
            ease: 'Power2',
          });
        }

        // Move lock icons with roll sprites
        if (list === this.rollSprites) {
          this.repositionLockIcons(positions);
        }
      }
    });

    this.input.on('dragend', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (!this.draggingSprite || gameObject !== this.draggingSprite) return;
      const list = this.getDraggableList();
      if (!list) return;

      const sprite = this.draggingSprite;
      const finalVelocity = this.dragVelocityX;
      sprite.setDepth(list === this.rollSprites ? 10 : 20);
      this.draggingSprite = null;
      this.dragVelocityX = 0;
      DiceSprite.suppressTooltips = false;

      // Spring settle with overshoot like equipment cards
      const positions = this.getRowXPositions(list.length);
      const idx = list.indexOf(sprite);
      const rowY = this.getDraggableRowY();
      const arc = this.getArcOffset(idx, list.length);

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
            y: rowY + arc.y,
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
        this.repositionLockIcons(positions);
        // Sync game state order to match visual drag order so held-in-hand scoring respects it
        this.gameState.state.rolledDice = this.rollSprites.map((s) => s.dieData);
      }
    });
  }

  /** Reposition lock icons to match current rollSprites order */
  private repositionLockIcons(positions: number[]): void {
    // Rebuild lock icons to match the new sprite order
    const lockStates = this.rollSprites.map((s) => this.lockedDiceIds.has(s.dieData.id));
    const rollY = this.scale.height * UI.ROLL_Y_RATIO;
    for (let i = 0; i < this.lockIcons.length; i++) {
      const icon = this.lockIcons[i];
      if (i < positions.length) {
        const arc = this.getArcOffset(i, this.rollSprites.length);
        this.tweens.add({
          targets: icon,
          x: positions[i],
          y: rollY + arc.y + 46,
          duration: 150,
          ease: 'Power2',
        });
        icon.setVisible(lockStates[i]);
      }
    }
  }

  /** Wire up a play area sprite for drag-to-reorder and click-to-remove */
  private setupPlayAreaSprite(sprite: DiceSprite): void {
    this.input.setDraggable(sprite);

    sprite.on('pointerdown', () => {
      this.wasDragging = false;
    });

    sprite.on('pointerup', () => {
      if (this.wasDragging) return;

      // Consumable targeting mode takes over click behavior
      if (this.consumableTargeting) {
        this.onConsumableTargetClick(sprite);
        return;
      }

      this.onPlayAreaDiceClick(sprite);
    });
  }

  private async handleConsumableUsed(consumed: ConsumableInstance): Promise<void> {
    const player = getPlayerState();
    const result = executeConsumableEffect(consumed, player, {
      visibleDiceIds: this.getVisibleConsumableDiceIds(),
    });

    await this.applyConsumableAnimEvents(result.consumableAnimEvents ?? []);

    this.sidebar.refreshMoney();
    this.equipBar.refresh();
    this.consumableBar.refresh();
    this.dicePouch.refresh();

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
    if (def.id !== 'raid') return true;
    return this.getVisibleConsumableDiceIds().length > 0;
  }

  private getVisibleConsumableDiceIds(): string[] {
    return this.getTargetableDice().dice.map((d) => d.id);
  }

  private async applyConsumableAnimEvents(events: ConsumableAnimEvent[]): Promise<void> {
    for (const event of events) {
      if (event.type !== 'destroy_dice') continue;
      await this.animateConsumableDiceDestruction(event.diceIds, {
        refillSelectHand: true,
        floatingText: `Raid destroyed ${event.diceIds.length} dice`,
      });
    }
  }

  private animateConsumableDiceDestruction(
    destroyedIds: string[],
    options: { refillSelectHand?: boolean; floatingText?: string } = {},
  ): Promise<void> {
    const destroyedSet = new Set(destroyedIds);
    const phase = this.gameState.state.phase;

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
    const phase = this.gameState.state.phase;
    if (phase === 'SELECT') {
      this.gameState.state.hand = this.gameState.state.hand.filter((d) => !destroyedSet.has(d.id));
      this.selectedHandIds = new Set([...this.selectedHandIds].filter((id) => !destroyedSet.has(id)));
      return;
    }
    if (phase === 'ROLL') {
      this.gameState.state.rolledDice = this.gameState.state.rolledDice.filter((d) => !destroyedSet.has(d.id));
      this.gameState.state.selectedForScore = this.gameState.state.selectedForScore.filter(
        (d) => !destroyedSet.has(d.id),
      );
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
    if (this.gameState.state.phase !== 'SELECT') return Promise.resolve();

    const player = getPlayerState();
    const currentIds = new Set(this.gameState.state.hand.map((d) => d.id));
    const needed = Math.max(0, this.gameState.config.rollSize - this.gameState.state.hand.length);
    if (needed <= 0) {
      this.repositionPlayArea(true);
      this.updateDrawButtons();
      return Promise.resolve();
    }

    const refillPool = player.availableDice.filter((d) => !currentIds.has(d.id)).sort(() => Math.random() - 0.5);
    const toAdd = refillPool.slice(0, needed);
    if (toAdd.length === 0) return Promise.resolve();

    const launch = this.getDicePouchLaunchPoint();
    const startingLength = this.playAreaSprites.length;
    for (const die of toAdd) {
      this.gameState.state.hand.push(die);
      this.selectedHandIds.add(die.id);
      const sprite = new DiceSprite(this, launch.x, launch.y, die);
      sprite.setDepth(20);
      sprite.setAlpha(0);
      sprite.setScale(0.2);
      this.setupPlayAreaSprite(sprite);
      sprite.disableInteractive();
      this.playAreaSprites.push(sprite);
    }
    this.gameState.state.hand = this.gameState.state.hand.slice(0, this.gameState.config.rollSize);

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
              this.dicePouch.refresh();
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
    if (this.gameState.state.phase === 'SELECT') {
      for (const sprite of this.playAreaSprites) {
        sprite.setInteractive({ useHandCursor: true });
      }
    }

    // Save current state so we can restore
    this.savedInstructionText = this.instructionText.text;
    this.savedLockedDiceIds = new Set(this.lockedDiceIds);

    // Clear existing lock selections — we repurpose selection for targeting
    this.lockedDiceIds.clear();
    for (let i = 0; i < this.rollSprites.length; i++) {
      this.rollSprites[i].setSelected(false);
      if (this.lockIcons[i]) this.lockIcons[i].setVisible(false);
    }

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
    const phase = this.gameState.state.phase;
    if (phase === 'ROLL' && this.rollSprites.length > 0) {
      return {
        sprites: this.rollSprites,
        dice: this.gameState.state.rolledDice,
      };
    }
    if (phase === 'SELECT' && this.playAreaSprites.length > 0) {
      return {
        sprites: this.playAreaSprites,
        dice: this.gameState.state.hand,
      };
    }
    // Fallback — roll sprites if available
    if (this.rollSprites.length > 0) {
      return {
        sprites: this.rollSprites,
        dice: this.gameState.state.rolledDice,
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

    // Restore lock icon visuals and selected state
    for (let i = 0; i < this.rollSprites.length; i++) {
      const id = this.rollSprites[i].dieData.id;
      const isLocked = this.lockedDiceIds.has(id);
      this.rollSprites[i].setSelected(isLocked);
      if (this.lockIcons[i]) this.lockIcons[i].setVisible(isLocked);
    }

    // Restore game buttons for current phase
    const phase = this.gameState.state.phase;
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

    // Refresh UI
    this.sidebar.refreshMoney();
    this.equipBar.refresh();
    this.consumableBar.refresh();
    this.dicePouch.refresh();
  }

  /** Refresh dice sprites in-place after a consumable effect changes dice data */
  private refreshDiceSpritesAfterEffect(affectedIds: Set<string>, effectType: DiceSelectionConfig['effectType']): void {
    const player = getPlayerState();
    const shouldUpdateVisibleValue = shouldUpdateDisplayedDiceValue(effectType);

    // Update roll sprites if in ROLL phase — only update affected dice
    for (const sprite of this.rollSprites) {
      if (!affectedIds.has(sprite.dieData.id)) continue;
      const updated = player.dice.find((d) => d.id === sprite.dieData.id);
      if (updated) {
        // Keep rolled face value stable unless the effect explicitly changes values.
        sprite.setDieData({
          ...sprite.dieData,
          ...updated,
          value: shouldUpdateVisibleValue ? updated.value : sprite.dieData.value,
        });
      }
    }

    // Update rolledDice in game state to match — only affected dice
    for (let i = 0; i < this.gameState.state.rolledDice.length; i++) {
      const rd = this.gameState.state.rolledDice[i];
      if (!affectedIds.has(rd.id)) continue;
      const updated = player.dice.find((d) => d.id === rd.id);
      if (updated) {
        this.gameState.state.rolledDice[i] = {
          ...rd,
          ...updated,
          value: shouldUpdateVisibleValue ? updated.value : rd.value,
        };
      }
    }

    // Update play area sprites if in SELECT phase
    for (const sprite of this.playAreaSprites) {
      if (!affectedIds.has(sprite.dieData.id)) continue;
      const updated = player.dice.find((d) => d.id === sprite.dieData.id);
      if (updated) {
        sprite.setDieData({
          ...sprite.dieData,
          ...updated,
          value: shouldUpdateVisibleValue ? updated.value : sprite.dieData.value,
        });
      }
    }

    this.dicePouch.refresh();
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
