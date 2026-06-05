// ─── GameScene ───
// Main round scene. Creates a GameState instance, subscribes to state changes,
// renders DRAW/ROLL/SCORE phases, dispatches player actions.
// Balatro-inspired layout: sidebar left, equipment top, dice center, pouch bottom-right.

import { Scene } from 'phaser';
import * as Phaser from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { gameFacade } from '../../game/facade';
import type { ConsumableDef, ConsumableInstance } from '../../game/facade/consumable';
import type { DiceSelectionConfig } from '../../game/facade/diceSelection';
import {
  getDiceSelectionMaxPicks,
  getDiceSelectionMinPicks,
  isDiceSelectionReady,
  shouldUpdateDisplayedDiceValue,
} from '../../game/facade/diceSelection';
import { getRoundHintContext } from '../../game/displayContext';
import { getRunState } from '../../game/store/runStore';
import { getRoundState } from '../../game/store/roundStore';
import { getSceneState, sceneActions } from '../../game/store/sceneStore';
import { bindScenePlaybackRunner } from '../playback/bindScenePlaybackRunner';
import type { PlaybackRunnerHandle } from '../playback/PlaybackRunner';
import { prepareScoreSidebar } from '../playback/handlers';
import { enqueueDayEndDestructions } from '../../game/store/playbackEnqueue';
import { Die, ScoreResult } from '../../game/types';
import {
  selectHandDice,
  selectRolledDice,
  selectRoundConfig,
  selectRoundPhase,
  selectRoundTotalMiles,
  selectRerollsRemaining,
} from '../../game/store/selectors/roundSelectors';
import { selectAvailableDice, selectCurrentBoss, selectSpentDice } from '../../game/store/selectors/runSelectors';
import { D } from '../../game/scoreMath';
import { COLORS, TEXT_COLORS, FONTS, UI, ANIM, MARQUEE } from '../../game/Constants';
import { DiceSprite } from '../ui/DiceSprite';
import { Button } from '../ui/Button';
import { Sidebar } from '../ui/Sidebar';
import { EquipmentBar } from '../ui/EquipmentBar';
import { ConsumableBar } from '../ui/ConsumableBar';
import { DicePouch } from '../ui/DicePouch';
import { createLayout } from '../ui/SceneLayout';
import { getRunRoundBackgroundIndex } from '../../game/roundBackgrounds';
import { ensureGameRoundBackgroundLoaded } from '../roundBackgrounds';
import { playRollAnimation } from '../animations/RollAnimation';
import { ensureAuraTextures } from '../ui/AuraFX';
import { rngShuffle } from '../../game/RunRng';
import { isDevMode } from '../../game/DevMode';
import { getGameplayPreferences } from '../../game/GameplayPreferences';
import { getArcOffset } from './game/diceRowGeometry';
import { RollMarqueeSelection } from './game/RollMarqueeSelection';
import { RollRowController } from './game/RollRowController';
import { ScoreRowLayout, type ScoreLayoutGate } from './game/ScoreRowLayout';
import { GameSceneDevPanel } from './game/GameSceneDevPanel';

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

  // Roll-phase dice row + marquee selection
  private rollRow!: RollRowController;
  private rollMarquee!: RollMarqueeSelection;
  private scoreRowLayout!: ScoreRowLayout;
  private devPanel!: GameSceneDevPanel;

  // Pre-roll hand row (SELECT phase)
  private playAreaSprites: DiceSprite[] = [];
  private playAreaY: number = 0;

  // Buttons
  private readyBtn: Button;
  private rollBtn: Button;
  private rerollBtn: Button;
  private scoreBtn: Button;
  private continueBtn: Button;

  // Instruction text
  private instructionText: Phaser.GameObjects.Text;
  private bossWarningText: Phaser.GameObjects.Text;

  // Roll-phase dice UI: selected = score hand; rerollLocked = keep face, not scored
  private selectedDiceIds: Set<string> = new Set();
  private rerollLockedDiceIds: Set<string> = new Set();

  // Sort controls
  private sortOrder: 'asc' | 'desc' = 'asc';
  private sortAscBtn: Button;
  private sortDescBtn: Button;

  // Animation lock
  private animating: boolean = false;

  private playbackRunner: PlaybackRunnerHandle | null = null;
  private scoreLayoutGate: ScoreLayoutGate | null = null;

  /** Lazy-loaded round background texture key; cleared in init for each scene visit */
  private roundBackgroundKey: string | null = null;

  /** Ambient fire sounds from equipment destruction — stopped on scene shutdown */
  private activeEquipDestroySounds: Phaser.Sound.BaseSound[] = [];

  private wasDragging: boolean = false;

  // Consumable targeting mode (inline dice selection for consumables like coffee_tin)
  private consumableTargeting: DiceSelectionConfig | null = null;
  private consumableTargetIds: Set<string> = new Set();
  private consumableConfirmBtn: Button | null = null;
  private consumableCancelBtn: Button | null = null;
  private savedInstructionText: string = '';
  private savedSelectedDiceIds: Set<string> = new Set();
  private savedRerollLockedDiceIds: Set<string> = new Set();

  constructor() {
    super('Game');
  }

  // Dice IDs to animate popping in on first draw phase (Mystery Crate, Quarry Stone, etc.)
  private pendingNewDiceIds: string[] = [];

  init(_data: Record<string, unknown> = {}) {
    // Round state lives in roundStore (hydrated by applySaveSnapshot or cleared between rounds).
    this.roundSessionActive = false;
    this.roundBackgroundKey = null;
  }

  private get rollSprites(): DiceSprite[] {
    return this.rollRow.getRollSprites();
  }

  private set rollSprites(sprites: DiceSprite[]) {
    this.rollRow.setRollSprites(sprites);
  }

  create() {
    // Initialize game state only on first create (not on relayout)
    if (!this.roundSessionActive) {
      const restoredRound = getRoundState();
      gameFacade.round.beginRoundSession({
        restored: restoredRound !== null && getSceneState().activeScene === 'Game',
      });
      this.roundSessionActive = true;
      this.pendingNewDiceIds = [];
      // Clear roll-phase dice UI from previous round (scene instance is reused)
      this.selectedDiceIds = new Set();
      this.rerollLockedDiceIds = new Set();
    }

    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    this.scale.on('resize', this.onResize, this);
    this.events.on('shutdown', () => {
      this.scale.off('resize', this.onResize, this);
      this.devPanel?.destroyPicker();
      this.stopEquipDestroySounds();
      this.rollRow?.stopDrag();
      this.rollMarquee?.stopTracking();
      this.roundSessionActive = false;
    });

    this.scoreRowLayout = new ScoreRowLayout({
      scene: this,
      contentCenterX: () => this.contentCX,
      diceSpacing: DICE_SPACING,
    });

    this.rollRow = new RollRowController({
      scene: this,
      diceSpacing: DICE_SPACING,
      getContentCenterX: () => this.contentCX,
      getSortOrder: () => this.sortOrder,
      isAnimating: () => this.animating,
      isMarqueeActive: () => this.rollMarquee.isActive(),
      isConsumableTargeting: () => this.consumableTargeting !== null,
      isDieLifted: (sprite) => this.isDieLifted(sprite),
      onRollDieClick: (sprite, isRightClick) => this.onRollDieClick(sprite, isRightClick),
      onConsumableTargetClick: (sprite) => this.onConsumableTargetClick(sprite),
      syncRolledDiceFromSprites: () => this.syncRolledDiceFromSprites(),
      onDragBegin: () => {
        this.wasDragging = true;
      },
      getWasDragging: () => this.wasDragging,
      setWasDragging: (value) => {
        this.wasDragging = value;
      },
    });

    this.rollMarquee = new RollMarqueeSelection({
      scene: this,
      canUseMarquee: () => this.canUseMarquee(),
      getRollSprites: () => this.rollRow.getRollSprites(),
      getZoneBounds: () => ({
        width: this.scale.width - this.sidebarW,
        height: this.scale.height - MARQUEE.BOTTOM_RESERVE,
        cx: this.contentCX,
        cy: (this.scale.height - MARQUEE.BOTTOM_RESERVE) / 2,
      }),
      onSpriteHit: (sprite, playSound) => this.onRollDieClick(sprite, false, playSound, false),
      onSelectionComplete: () => this.updateRollButtons(),
      onDragBegin: () => {
        this.wasDragging = true;
      },
    });

    this.devPanel = new GameSceneDevPanel({
      scene: this,
      getSidebarW: () => this.sidebarW,
      onDevWin: () => this.onDevWinRound(),
    });

    this.buildLayout(false);

    sceneActions.enterScene('Game');
  }

  /** Subtle leased-badge pulse at round start as an upkeep reminder. */
  private flashLeasedBadgeReminders(): void {
    for (const card of this.equipBar.getCards()) {
      const equip = card.equipment;
      if (equip && gameFacade.equipment.isLeased(equip)) {
        card.flashLeasedPaid();
      }
    }
  }

  private buildLayout(isRelayout: boolean = false): void {
    if (isRelayout && this.roundBackgroundKey !== null) {
      this.finishBuildLayout(isRelayout, this.roundBackgroundKey);
      return;
    }

    const index = getRunRoundBackgroundIndex(getRunState());

    ensureGameRoundBackgroundLoaded(this, index, (textureKey) => {
      const bgKey = this.textures.exists(textureKey) ? textureKey : null;
      this.roundBackgroundKey = bgKey;
      this.finishBuildLayout(isRelayout, bgKey);
    });
  }

  private finishBuildLayout(isRelayout: boolean, bgKey: string | null): void {
    const { height } = this.scale;

    const layout = createLayout(this, { bgKey });
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

    this.playbackRunner = bindScenePlaybackRunner(this, {
      scene: this,
      equipBar: this.equipBar,
      consumableBar: this.consumableBar,
      sidebar: this.sidebar,
      getDiceSprites: () => this.rollRow.getRollSprites(),
      destroyDice: (diceIds) =>
        this.animateConsumableDiceDestruction(diceIds, {
          refillSelectHand: true,
          floatingText: `Raid destroyed ${diceIds.length} dice`,
        }),
      scoreLayoutGate: null,
      setAnimating: (value) => {
        this.animating = value;
      },
      onDiceAdded: (dieIds) => {
        this.pendingNewDiceIds.push(...dieIds);
      },
      onScoreComplete: () => {
        this.instructionText.setText('');
        this.sidebar.clearHandDisplay();
        this.time.delayedCall(600, () => this.onContinue());
      },
      showFloatingText: (message, color) => this.showFloatingText(message, color),
    });

    this.consumableBar.on('consumable-used', (consumed: ConsumableInstance) => {
      void this.handleConsumableUsed(consumed);
    });

    const btnY = height - UI.GAME_BOTTOM_BTN_MARGIN;
    const instructionY = btnY - UI.GAME_INSTRUCTION_ABOVE_BTN;
    const sortY = instructionY - UI.GAME_SORT_ABOVE_INSTRUCTION;
    const playAreaW = this.scale.width - this.sidebarW;
    const bossWarningY = height * UI.GAME_BOSS_WARNING_Y_RATIO;

    // Instruction text
    this.instructionText = this.add
      .text(this.contentCX, instructionY, '', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '16px',
        color: TEXT_COLORS.SECONDARY,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(50);

    this.bossWarningText = this.add
      .text(this.contentCX, bossWarningY, '', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '20px',
        color: TEXT_COLORS.ERROR_RED,
        align: 'center',
        fontStyle: 'bold',
        wordWrap: { width: Math.max(200, playAreaW * 0.85) },
      })
      .setOrigin(0.5)
      .setDepth(55)
      .setVisible(false);

    this.devPanel.build();

    // Create buttons (all hidden initially)
    this.readyBtn = new Button(this, this.contentCX, btnY, 'Roll Selected', 200, 40).onClick(() =>
      this.onReadyToRoll(),
    );
    this.rollBtn = new Button(this, this.contentCX, btnY, 'Roll!', 160, 40).onClick(() => this.onRoll());
    this.scoreBtn = new Button(this, this.contentCX - 110, btnY, 'Score Hand', 160, 40).onClick(() => this.onScore());
    this.rerollBtn = new Button(this, this.contentCX + 110, btnY, 'Re-roll All', 200, 40).onClick(() =>
      this.onReroll(),
    );
    this.continueBtn = new Button(this, this.contentCX, btnY, 'Continue', 160, 40).onClick(() => this.onContinue());

    // Sort buttons (small, positioned above the main buttons)
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

    if (!isRelayout) {
      this.playbackRunner.drainInitialSync();
    }

    // Re-enter current phase
    this.enterCurrentPhase(isRelayout);

    if (!isRelayout) {
      this.flashLeasedBadgeReminders();
    }

    EventBus.emit(Events.SCENE_READY, this);
  }

  private enterCurrentPhase(isRelayout: boolean = false): void {
    const phase = selectRoundPhase();
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
    this.rollRow.destroyRollSprites();
    this.playAreaSprites = [];
    this.rollMarquee.destroy();
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
    gameFacade.round.clearHandPreviewOverlay();
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

    const hand = selectHandDice();
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

    const spent = selectSpentDice(getRunState()).length;
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
    if (selectRoundPhase() !== 'SELECT') return;
    if (selectHandDice().length === 0) return;
    this.onReadyToRoll();
  }

  private enterRollPhase(): void {
    this.clearSprites();
    this.selectedDiceIds.clear();
    this.rerollLockedDiceIds.clear();
    this.hideAllButtons();

    // Create sprites for rolled dice
    const rolled = selectRolledDice();
    this.rollSprites = this.rollRow.createRollRow(rolled, this.scale.height * UI.ROLL_Y_RATIO);

    // Play roll animation
    this.animating = true;
    playRollAnimation(this, this.rollSprites, rolled, () => {
      this.animating = false;
      this.rollRow.sortAndReposition();
      this.rollRow.setupInteraction();
      this.rollMarquee.setup();

      this.rerollBtn.setVisible(true);
      this.scoreBtn.setVisible(true);
      this.showSortButtons();
      this.updateRollButtons();

      this.instructionText.setText('Click to select for score · Right-click to lock against re-rolls');
      this.applyBossRollDiceState();
    });

    this.updateHUD();
  }

  /** Bounty lock + boss-disabled visuals on rolled dice */
  private applyBossRollDiceState(): void {
    const bossState = gameFacade.boss.getRollUiState(selectRolledDice());
    for (const sprite of this.rollSprites) {
      const id = sprite.dieData.id;
      sprite.setDisabled(gameFacade.boss.isDiceScoringDisabled(sprite.dieData));
      if (bossState.lockedDieIds.includes(id)) {
        this.rerollLockedDiceIds.add(id);
      }
    }
    this.syncRollDieVisuals();
    this.syncSelectedForScore();
    this.rollRow.reposition(true);
    this.updateRollButtons();
  }

  private getRollDieUiState(id: string): 'unselected' | 'selected' | 'rerollLocked' {
    if (this.selectedDiceIds.has(id)) return 'selected';
    if (this.rerollLockedDiceIds.has(id) || gameFacade.boss.isDiceLocked(id)) return 'rerollLocked';
    return 'unselected';
  }

  private isRollDieSelected(sprite: DiceSprite): boolean {
    return this.selectedDiceIds.has(sprite.dieData.id);
  }

  private applyRollDieUiState(sprite: DiceSprite, next: 'unselected' | 'selected' | 'rerollLocked'): void {
    const id = sprite.dieData.id;
    if (gameFacade.boss.isDiceLocked(id) && next === 'unselected') {
      next = 'rerollLocked';
    }

    this.selectedDiceIds.delete(id);
    this.rerollLockedDiceIds.delete(id);

    if (next === 'selected') {
      this.selectedDiceIds.add(id);
    } else if (next === 'rerollLocked') {
      this.rerollLockedDiceIds.add(id);
    }

    sprite.setSelected(next === 'selected');
    sprite.setRerollLocked(next === 'rerollLocked');
  }

  private syncRollDieVisuals(): void {
    for (const sprite of this.rollSprites) {
      const id = sprite.dieData.id;
      const state = this.getRollDieUiState(id);
      sprite.setSelected(state === 'selected');
      sprite.setRerollLocked(state === 'rerollLocked');
    }
  }

  /** Click rolled die: left = select for score, right = reroll lock (marquee uses left-click rules). */
  private onRollDieClick(sprite: DiceSprite, isRightClick: boolean, playSound = true, updateButtons = true): void {
    if (this.consumableTargeting) return;
    const id = sprite.dieData.id;
    const state = this.getRollDieUiState(id);

    let next: 'unselected' | 'selected' | 'rerollLocked';
    if (isRightClick) {
      if (gameFacade.boss.isDiceLocked(id)) return;
      next = state === 'unselected' ? 'rerollLocked' : state === 'rerollLocked' ? 'unselected' : 'rerollLocked';
    } else {
      next = state === 'unselected' ? 'selected' : state === 'rerollLocked' ? 'selected' : 'unselected';
    }

    this.applyRollDieUiState(sprite, next);

    if (playSound) {
      if (next === 'selected') {
        this.sound.play('sfx_highlight1', { volume: 0.3 });
      } else if (next === 'rerollLocked') {
        this.sound.play('sfx_card_slide2', { volume: 0.25 });
      } else {
        this.sound.play('sfx_card_slide2', { volume: 0.25 });
      }
    }

    const idx = this.rollSprites.indexOf(sprite);
    if (idx >= 0) this.rollRow.animateSelectLift(sprite, idx);
    this.syncSelectedForScore();
    if (updateButtons) this.updateRollButtons();
  }

  private syncSelectedForScore(): void {
    gameFacade.round.setSelectedForScoreDice(selectRolledDice().filter((d) => this.selectedDiceIds.has(d.id)));
  }

  private canUseMarquee(): boolean {
    return !this.animating && !this.consumableTargeting && this.rollSprites.length > 0 && selectRoundPhase() === 'ROLL';
  }

  /** Layout-only version for resize: shows rolled dice without replaying animation */
  private enterRollPhaseLayout(): void {
    this.clearSprites();
    this.selectedDiceIds.clear();
    this.rerollLockedDiceIds.clear();
    this.hideAllButtons();

    const rolled = selectRolledDice();
    this.rollSprites = this.rollRow.createRollRow(rolled, this.scale.height * UI.ROLL_Y_RATIO);
    this.rollRow.setupInteraction();
    this.rollMarquee.setup();

    this.rerollBtn.setVisible(true);
    this.scoreBtn.setVisible(true);
    this.showSortButtons();
    this.rollRow.sortAndReposition();
    this.updateRollButtons();

    this.instructionText.setText('Click to select for score · Right-click to lock against re-rolls');
    this.applyBossRollDiceState();
    this.updateHUD();
  }

  private enterScorePhase(result: ScoreResult): void {
    this.hideAllButtons();

    const totalMiles = selectRoundTotalMiles();
    const roundScoreBefore = totalMiles ? totalMiles.minus(result.miles) : D(0);
    prepareScoreSidebar(result, roundScoreBefore);

    this.animating = true;
    this.scoreRowLayout.layoutForScoring(result, this.rollSprites, this.selectedDiceIds, () => {
      this.scoreLayoutGate?.release();
    });
  }

  // ─── Player Actions ───

  private onReadyToRoll(): void {
    if (this.animating) return;
    const ids = selectHandDice().map((die) => die.id);
    const success = gameFacade.round.selectDiceForRoll(ids);
    if (success) {
      this.enterRollPhase();
    }
  }

  private onRoll(): void {
    // Not used in current flow — roll happens on selectForRoll
  }

  private onReroll(): void {
    if (this.animating) return;

    // Re-roll dice that are neither selected for score nor pinned against re-rolls
    const allIds = selectRolledDice().map((d) => d.id);
    const idsToReroll = allIds.filter((id) => !this.selectedDiceIds.has(id) && !this.rerollLockedDiceIds.has(id));
    if (idsToReroll.length === 0) return;

    const success = gameFacade.round.rerollUnlockedDice(idsToReroll);
    if (!success && selectRerollsRemaining() > 0 && !gameFacade.round.canUseReroll()) {
      this.showFloatingText('No re-rolls on Day 1', 0xffaa44);
      return;
    }
    if (success) {
      this.animating = true;
      const rerolledSprites = this.rollSprites.filter((s) => idsToReroll.includes(s.dieData.id));
      const rolled = selectRolledDice();

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
          this.rollRow.sortAndReposition();
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
    const ids = this.rollSprites.filter((s) => this.selectedDiceIds.has(s.dieData.id)).map((s) => s.dieData.id);
    if (ids.length === 0) return;

    const validation = gameFacade.round.validateScoreSelection(ids);
    if (!validation.allowed) {
      this.showFloatingText(validation.reason ?? 'Cannot play this hand', 0xff6644);
      return;
    }

    const success = gameFacade.round.selectForScore(ids);
    if (!success) return;

    this.syncRolledDiceFromSprites();
    this.scoreLayoutGate = ScoreRowLayout.createGate();
    this.playbackRunner?.setScoreLayoutGate(this.scoreLayoutGate);
    const result = gameFacade.round.calculateScore({ deferConsumableGrants: true });
    if (result) {
      this.enterScorePhase(result);
    } else {
      gameFacade.round.cancelScore();
      this.showFloatingText('Could not score', 0xff6644);
      this.updateRollButtons();
    }
  }

  /** Developer profession: instantly win the round for faster testing. */
  private onDevWinRound(): void {
    if (!isDevMode() || this.animating) return;

    this.hideAllButtons();
    this.clearSprites();
    gameFacade.round.forceWinRound();
    this.sidebar.syncRoundScoreFromStore();
    this.updateHUD();
    this.onContinue();
  }

  private onContinue(): void {
    if (this.animating) return;

    const { outcome, destroyedEquipment, deferredDestroyIndices } = gameFacade.round.endDay({
      deferEquipmentDestructionAnimation: true,
    });

    const afterDestroyedEquipmentFeedback = () => {
      if (outcome === 'won' || outcome === 'lost') {
        this.finishDayEndAfterEquipmentDestroyed(outcome);
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
      const holdMs = outcome === 'won' || outcome === 'lost' ? ANIM.EQUIP_FIRE_DESTROY_ROUND_END_HOLD_MS : 0;
      enqueueDayEndDestructions(deferredDestroyIndices, destroyedEquipment, holdMs);
      void this.playbackRunner
        ?.drainMatching((cmd) => cmd.kind === 'day-end-destructions')
        .then(() => {
          this.animating = false;
          afterDestroyedEquipmentFeedback();
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

  private finishDayEndAfterEquipmentDestroyed(outcome: 'won' | 'lost'): void {
    void this.playbackRunner?.drainRoundEndHeld().then(() => {
      gameFacade.equipment.enqueueModifierFeedbackEndOfRound({ applyDestruction: true });
      void this.playbackRunner
        ?.drainMatching((cmd) => cmd.kind === 'modifier-feedback')
        .then(() => this.transitionAfterRoundEnd(outcome));
    });
  }

  private transitionAfterRoundEnd(outcome: 'won' | 'lost'): void {
    if (outcome === 'won') {
      this.sound.play('sfx_win', { volume: 0.6 });
      gameFacade.run.preparePayoutPresentation();
      this.scene.start('Payout', {});
    } else {
      this.sound.play('sfx_negative', { volume: 0.5 });
      const run = getRunState();
      this.scene.start('GameOver', {
        won: false,
        victory: false,
        totalMiles: selectRoundTotalMiles() ?? D(0),
        targetMiles: selectRoundConfig().targetMiles,
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
      const arc = getArcOffset(i, dice.length);
      const sprite = new DiceSprite(this, startX + i * DICE_SPACING, y + arc.y, dice[i]);
      sprite.rotation = arc.rotation;
      sprite.setDepth(10);
      sprites.push(sprite);
    }
    return sprites;
  }

  private clearSprites(): void {
    this.rollRow.destroyRollSprites();
    for (const s of this.playAreaSprites) s.destroy();
    this.rollMarquee.destroy();
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
    this.bossWarningText.setVisible(false);
  }

  private updateDrawButtons(): void {
    const drawCount = selectHandDice().length;
    this.readyBtn.setText(drawCount > 0 ? `Roll ${drawCount} Dice` : 'No Dice To Roll');
    this.readyBtn.setEnabled(drawCount > 0);
  }

  private updateRollButtons(): void {
    const selectedCount = this.selectedDiceIds.size;
    const pinnedCount = this.rerollLockedDiceIds.size;
    const totalCount = selectRolledDice().length;
    const rerollCount = totalCount - selectedCount - pinnedCount;
    const remaining = selectRerollsRemaining();
    const hasRerolls = remaining > 0;
    const canUseReroll = gameFacade.round.canUseReroll();

    this.rerollBtn.setEnabled(rerollCount > 0 && canUseReroll);
    this.rerollBtn.setText(
      !hasRerolls
        ? 'No Re-rolls'
        : !canUseReroll
          ? `Day 1: no re-rolls (${remaining} from Day 2)`
          : rerollCount === totalCount
            ? `Re-roll All (${remaining} remaining)`
            : `Re-roll ${rerollCount} (${remaining} remaining)`,
    );

    this.scoreBtn.setEnabled(selectedCount > 0);
    this.scoreBtn.setText(selectedCount > 0 ? `Score ${selectedCount} Dice` : 'Select Dice to Score');

    const selectedIds = this.rollSprites.filter((s) => this.selectedDiceIds.has(s.dieData.id)).map((s) => s.dieData.id);
    const bossWarning = selectedCount > 0 ? gameFacade.round.getBossScoreWarning(selectedIds) : null;
    if (bossWarning) {
      this.bossWarningText.setText(bossWarning);
      this.bossWarningText.setVisible(true);
      this.scoreBtn.setColor(0x8b2020, 0xb03030);
    } else {
      this.bossWarningText.setVisible(false);
      this.scoreBtn.setColor(COLORS.BTN_DEFAULT, COLORS.BTN_HOVER);
    }

    const selectedDice = selectRolledDice().filter((d) => this.selectedDiceIds.has(d.id));
    gameFacade.round.updateHandPreviewOverlay(selectedDice);

    this.equipBar?.setHintRound(getRoundHintContext());
  }

  private isConsumableTargetDie(sprite: DiceSprite): boolean {
    return this.consumableTargeting !== null && this.consumableTargetIds.has(sprite.dieData.id);
  }

  private isDieLifted(sprite: DiceSprite): boolean {
    return this.isRollDieSelected(sprite) || this.isConsumableTargetDie(sprite);
  }

  private getPlayAreaDieY(index: number, sprite: DiceSprite): number {
    const arc = getArcOffset(index, this.playAreaSprites.length);
    const lift = this.isConsumableTargetDie(sprite) ? UI.DICE_LOCKED_LIFT_Y : 0;
    return this.playAreaY + arc.y - lift;
  }

  private applyPlayAreaDieDepth(sprite: DiceSprite): void {
    sprite.setDepth(this.isConsumableTargetDie(sprite) ? 15 : 10);
  }

  private repositionConsumableTargets(animated: boolean, duration = 200): void {
    if (!this.consumableTargeting) return;

    const phase = selectRoundPhase();
    if (phase === 'ROLL' && this.rollSprites.length > 0) {
      this.rollRow.reposition(animated, duration);
    } else if (phase === 'SELECT' && this.playAreaSprites.length > 0) {
      this.repositionPlayArea(animated, duration);
    }
  }

  /** Keep game-state dice order aligned with on-screen roll sprite order (held-in-hand scoring). */
  private syncRolledDiceFromSprites(): void {
    gameFacade.round.syncRolledDiceFromFaces(this.rollSprites.map((s) => s.dieData));
  }

  private setSortOrder(order: 'asc' | 'desc'): void {
    this.sortOrder = order;
    this.rollRow.sortAndReposition();
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
    const phase = selectRoundPhase();
    const boss = selectCurrentBoss(getRunState());
    gameFacade.round.setSidebarOverlay({
      title: boss
        ? boss.name
        : phase === 'SELECT'
          ? 'READY TO ROLL'
          : phase === 'ROLL'
            ? 'ROLL PHASE'
            : phase === 'SCORE'
              ? 'SCORING'
              : phase === 'DAY_END'
                ? 'DAY COMPLETE'
                : 'GAME',
    });
    this.equipBar.setHintRound(getRoundHintContext());
    this.devPanel.update();
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
    const crateIndex = gameFacade.equipment.findEffectIndex('ROUND_START_ADD_DICE');
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

  /** Calculate X positions for dice in the play area */
  private getPlayAreaXPositions(count: number): number[] {
    if (count === 0) return [];
    const totalWidth = (count - 1) * DICE_SPACING;
    const startX = this.contentCX - totalWidth / 2;
    return Array.from({ length: count }, (_, i) => startX + i * DICE_SPACING);
  }

  /** Reposition play area sprites */
  private repositionPlayArea(animated: boolean, duration = 200): void {
    const positions = this.getPlayAreaXPositions(this.playAreaSprites.length);
    for (let i = 0; i < this.playAreaSprites.length; i++) {
      const sprite = this.playAreaSprites[i];
      const arc = getArcOffset(i, this.playAreaSprites.length);
      const targetY = this.getPlayAreaDieY(i, sprite);
      this.applyPlayAreaDieDepth(sprite);
      if (animated) {
        this.tweens.add({
          targets: sprite,
          x: positions[i],
          y: targetY,
          rotation: arc.rotation,
          duration,
          ease: 'Power2',
        });
      } else {
        sprite.setPosition(positions[i], targetY);
        sprite.rotation = arc.rotation;
      }
    }
  }

  // ─── Drag-to-Reorder (ROLL phase) ───

  /** Wire consumable targeting clicks on pre-roll hand dice */
  private setupPlayAreaSprite(sprite: DiceSprite): void {
    sprite.on('pointerup', () => {
      if (this.consumableTargeting) {
        this.onConsumableTargetClick(sprite);
      }
    });
  }

  private async handleConsumableUsed(consumed: ConsumableInstance): Promise<void> {
    const result = gameFacade.consumable.use(consumed, {
      visibleDiceIds: this.getVisibleConsumableDiceIds(),
    });

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
    const phase = selectRoundPhase();

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
    gameFacade.round.removeDestroyedDiceFromRound(destroyedSet);
    if (selectRoundPhase() === 'ROLL') {
      this.selectedDiceIds = new Set([...this.selectedDiceIds].filter((id) => !destroyedSet.has(id)));
      this.rerollLockedDiceIds = new Set([...this.rerollLockedDiceIds].filter((id) => !destroyedSet.has(id)));
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
    if (selectRoundPhase() !== 'SELECT') return Promise.resolve();

    const run = getRunState();
    const currentIds = new Set(selectHandDice().map((d) => d.id));
    const needed = Math.max(0, selectRoundConfig().rollSize - selectHandDice().length);
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
    const nextHand = [...selectHandDice()];
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
    gameFacade.round.setHandDice(nextHand.slice(0, selectRoundConfig().rollSize));

    const positions = this.getPlayAreaXPositions(this.playAreaSprites.length);
    for (let i = 0; i < startingLength; i++) {
      const arc = getArcOffset(i, this.playAreaSprites.length);
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
        const arc = getArcOffset(idx, this.playAreaSprites.length);
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
    if (selectRoundPhase() === 'SELECT') {
      for (const sprite of this.playAreaSprites) {
        sprite.setInteractive({ useHandCursor: true });
      }
    }

    // Save current state so we can restore
    this.savedInstructionText = this.instructionText.text;
    this.savedSelectedDiceIds = new Set(this.selectedDiceIds);
    this.savedRerollLockedDiceIds = new Set(this.rerollLockedDiceIds);

    // Clear roll-phase selections — we repurpose highlight for targeting
    this.selectedDiceIds.clear();
    this.rerollLockedDiceIds.clear();
    this.syncRollDieVisuals();
    this.rollRow.reposition(true, 150);

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

    for (const sprite of this.getTargetableDice().sprites) {
      sprite.setSelected(false);
    }

    this.updateConsumableTargetingText();
  }

  /** Get the dice sprites currently visible for targeting */
  private getTargetableDice(): { sprites: DiceSprite[]; dice: Die[] } {
    const phase = selectRoundPhase();
    if (phase === 'ROLL' && this.rollSprites.length > 0) {
      return {
        sprites: this.rollSprites,
        dice: selectRolledDice(),
      };
    }
    if (phase === 'SELECT' && this.playAreaSprites.length > 0) {
      return {
        sprites: this.playAreaSprites,
        dice: selectHandDice(),
      };
    }
    // Fallback — roll sprites if available
    if (this.rollSprites.length > 0) {
      return {
        sprites: this.rollSprites,
        dice: selectRolledDice(),
      };
    }
    return { sprites: [], dice: [] };
  }

  /** Called when a die is clicked during consumable targeting mode */
  private onConsumableTargetClick(sprite: DiceSprite): void {
    if (!this.consumableTargeting) return;
    const id = sprite.dieData.id;
    const max = getDiceSelectionMaxPicks(this.consumableTargeting);

    if (this.consumableTargetIds.has(id)) {
      // Deselect
      this.consumableTargetIds.delete(id);
      this.sound.play('sfx_card_slide2', { volume: 0.25 });
    } else if (this.consumableTargetIds.size < max) {
      // Select
      this.consumableTargetIds.add(id);
      this.sound.play('sfx_highlight1', { volume: 0.3 });
    }

    this.repositionConsumableTargets(true);

    const enough = isDiceSelectionReady(this.consumableTargeting, this.consumableTargetIds.size);
    if (this.consumableConfirmBtn) this.consumableConfirmBtn.setEnabled(enough);
    // For BUMP_VALUE, the cancel button is actually the -1 Down button
    if (this.consumableTargeting.effectType === 'BUMP_VALUE' && this.consumableCancelBtn) {
      (this.consumableCancelBtn as Button).setEnabled(enough);
    }
    this.updateConsumableTargetingText();
  }

  private updateConsumableTargetingText(): void {
    if (!this.consumableTargeting) return;
    const config = this.consumableTargeting;
    const min = getDiceSelectionMinPicks(config);
    const max = getDiceSelectionMaxPicks(config);
    const selected = this.consumableTargetIds.size;
    const name = config.cardName || 'Effect';
    if (selected < min) {
      const need = min - selected;
      if (min === max) {
        this.instructionText.setText(`${name}: Select ${need} more dice`);
      } else {
        this.instructionText.setText(`${name}: Select at least ${need} more (up to ${max})`);
      }
    } else if (selected < max) {
      this.instructionText.setText(`${name}: Ready! Pick another die or click Apply`);
    } else {
      this.instructionText.setText(`${name}: Ready! Click Apply`);
    }
  }

  private async applyConsumableTargeting(): Promise<void> {
    if (!this.consumableTargeting) return;
    if (!isDiceSelectionReady(this.consumableTargeting, this.consumableTargetIds.size)) return;
    const effectType = this.consumableTargeting.effectType;

    // Get the actual dice objects from the targetable set
    const { dice } = this.getTargetableDice();
    const selectedDice = dice.filter((d) => this.consumableTargetIds.has(d.id));

    // Apply the effect
    const resultMsg = gameFacade.diceSelection.applyEffect(this.consumableTargeting, selectedDice);

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
    this.selectedDiceIds = new Set(this.savedSelectedDiceIds);
    this.rerollLockedDiceIds = new Set(this.savedRerollLockedDiceIds);
    this.syncRollDieVisuals();
    this.instructionText.setText(this.savedInstructionText);

    // Restore roll / play-area lift positions
    if (this.rollSprites.length > 0) {
      this.rollRow.reposition(true, 150);
    } else if (this.playAreaSprites.length > 0) {
      this.repositionPlayArea(true, 150);
    }

    // Restore game buttons for current phase
    const phase = selectRoundPhase();
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

    const rolledDice = [...selectRolledDice()];
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
    gameFacade.round.syncRolledDiceFromFaces(rolledDice);

    // Parity bosses (Ghost Town / Undertaker) key off face value — refresh overlays after bumps
    for (const sprite of this.rollSprites) {
      sprite.setDisabled(gameFacade.boss.isDiceScoringDisabled(sprite.dieData));
    }

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
