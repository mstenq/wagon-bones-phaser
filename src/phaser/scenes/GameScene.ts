// ─── GameScene ───
// Main round scene. Creates a GameState instance, subscribes to state changes,
// renders DRAW/ROLL/SCORE phases, dispatches player actions.
// Balatro-inspired layout: sidebar left, equipment top, dice center, pouch bottom-right.

import { Scene } from 'phaser';
import * as Phaser from 'phaser';
import { EventBus, Events } from '../../game/EventBus';
import { gameFacade } from '../../game/facade';
import type {
  ApplyConsumableTargetingResult,
  ConsumableDef,
  ConsumableEligibilityContext,
  ConsumableInstance,
} from '../../game/facade/consumable';
import {
  canUseConsumable as isConsumableEligible,
  getGameConsumableSeedDieIds,
  setGameConsumableSeedDieIds,
} from '../../game/facade/consumable';
import type { DiceSelectionConfig } from '../../game/facade/diceSelection';
import { shouldUpdateDisplayedDiceValue } from '../../game/facade/diceSelection';
import { getRoundHintContext } from '../../game/displayContext';
import { getRunState } from '../../game/store/runStore';
import { getRoundState } from '../../game/store/roundStore';
import { getSceneState, sceneActions } from '../../game/store/sceneStore';
import { bindScenePlaybackRunner } from '../playback/bindScenePlaybackRunner';
import type { PlaybackRunnerHandle } from '../playback/PlaybackRunner';
import { prepareScoreSidebar } from '../playback/handlers';
import { enqueueDayEndDestructions } from '../../game/store/playbackEnqueue';
import { ScoreResult, type PhaseState } from '../../game/types';
import {
  selectHandDice,
  selectRolledDice,
  selectRoundConfig,
  selectRoundPhase,
  selectRoundTotalMiles,
  selectRerollsRemaining,
  selectRoundDay,
} from '../../game/store/selectors/roundSelectors';
import { selectAvailableDice, selectCurrentBoss, selectSpentDice } from '../../game/store/selectors/runSelectors';
import { D } from '../../game/scoreMath';
import { COLORS, TEXT_COLORS, FONTS, UI, ANIM, MARQUEE, GAMEPLAY } from '../../game/Constants';
import { DiceSprite } from '../ui/DiceSprite';
import { Button } from '../ui/Button';
import { Sidebar } from '../ui/Sidebar';
import { EquipmentBar } from '../ui/EquipmentBar';
import {
  ConsumableBar,
  type ConsumableTargetingCommitRequest,
  type ConsumableTargetingRequest,
} from '../ui/ConsumableBar';
import { DicePouch } from '../ui/DicePouch';
import {
  applyCoverBackgroundImage,
  computeGameHudLayout,
  computeLayoutMetricsFromScene,
  createLayout,
  getContentBackgroundRegion,
} from '../ui/SceneLayout';
import { RoundModificationsModal } from '../ui/RoundModificationsModal';
import { shouldPromptRoundModifications } from '../../game/store/selectors/uiSelectors';
import { getRunRoundBackgroundIndex } from '../../game/roundBackgrounds';
import { ensureGameRoundBackgroundLoaded } from '../roundBackgrounds';
import { playRollAnimation } from '../animations/RollAnimation';
import { ensureAuraTextures } from '../ui/AuraFX';
import { rngShuffle } from '../../game/RunRng';
import { isDevMode } from '../../game/DevMode';
import { getGameplayPreferences } from '../../game/GameplayPreferences';
import { computeDiceDisplayScale, computeDiceSpacing, getArcOffset } from './game/diceRowGeometry';
import { ConsumableBarTargetingBridge } from './game/ConsumableBarTargetingBridge';
import { GameConsumableTargetingController } from './game/GameConsumableTargetingController';
import { PlayAreaDiceController } from './game/PlayAreaDiceController';
import { RollMarqueeSelection } from './game/RollMarqueeSelection';
import { RollRowController } from './game/RollRowController';
import { ScoreRowLayout, type ScoreLayoutGate } from './game/ScoreRowLayout';
import { GameSceneDevPanel } from './game/GameSceneDevPanel';
import { DiceRowBackdropController } from './game/DiceRowBackdropController';

export class GameScene extends Scene {
  private roundSessionActive = false;
  private sidebar: Sidebar;
  private equipBar: EquipmentBar;
  private consumableBar: ConsumableBar;
  private dicePouch: DicePouch;

  // Layout helpers
  private contentCX: number = 0;
  private contentW: number = 0;
  private sidebarW: number = 0;

  // Roll-phase dice row + marquee selection
  private rollRow!: RollRowController;
  private rollMarquee!: RollMarqueeSelection;
  private scoreRowLayout!: ScoreRowLayout;
  private devPanel!: GameSceneDevPanel;

  // Pre-roll hand row (SELECT phase)
  private playArea!: PlayAreaDiceController;
  private diceRowBackdropController!: DiceRowBackdropController;

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
  // Sort control
  private sortBtn: Button;

  // HUD layout (recomputed on resize)
  private rollRowY = 0;
  private scoreRowY = 0;
  private hudBottomReserve: number = MARQUEE.BOTTOM_RESERVE;
  private showRollInstruction = true;

  // Animation lock
  private animating: boolean = false;

  private playbackRunner: PlaybackRunnerHandle | null = null;
  private scoreLayoutGate: ScoreLayoutGate | null = null;

  /** Lazy-loaded round background texture key; cleared in init for each scene visit */
  private roundBackgroundKey: string | null = null;
  /** Dev-only background preview index (1..ROUND_BACKGROUND_COUNT) */
  private devBgPreviewIndex: number | null = null;
  private bgImage: Phaser.GameObjects.Image | null = null;

  /** Ambient fire sounds from equipment destruction — stopped on scene shutdown */
  private activeEquipDestroySounds: Phaser.Sound.BaseSound[] = [];

  private wasDragging: boolean = false;

  private consumableTargeting!: GameConsumableTargetingController;
  private consumableBarBridge!: ConsumableBarTargetingBridge;

  constructor() {
    super('Game');
  }

  // Dice IDs to animate popping in on first draw phase (Mystery Crate, Quarry Stone, etc.)
  private pendingNewDiceIds: string[] = [];

  init(_data: Record<string, unknown> = {}) {
    // Round state lives in roundStore (hydrated by applySaveSnapshot or cleared between rounds).
    this.roundSessionActive = false;
    this.roundBackgroundKey = null;
    this.devBgPreviewIndex = null;
    this.bgImage = null;
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

    this.consumableBarBridge = new ConsumableBarTargetingBridge({
      surface: 'game',
      getEligibilityContext: () => this.buildConsumableEligibilityContext(),
      getEffectContext: () => ({ visibleDiceIds: this.getVisibleDieIds() }),
      seedDieIds: () => this.getConsumableSeedDieIds(),
      onArmEnter: () => {
        const def = gameFacade.consumable.targeting.active()?.diceSelection;
        if (def) this.consumableTargeting.enter(def);
      },
      onApplySuccess: async (result) => {
        this.consumableTargeting.complete();
        await this.handleAppliedConsumableTargeting(result);
      },
      onFailure: (message) => this.showConsumableFailure(message),
    });

    this.consumableTargeting = new GameConsumableTargetingController({
      scene: this,
      getInstructionText: () => this.instructionText,
      getRollSprites: () => this.rollRow.getRollSprites(),
      getPlayAreaSprites: () => this.playArea.getSprites(),
      restorePhaseUi: () => this.restorePhaseUiAfterTargeting(),
      repositionRollRow: (animated, duration, elasticLift) => this.rollRow.reposition(animated, duration, elasticLift),
      repositionPlayArea: (animated, duration, elasticLift) =>
        this.playArea.reposition(animated, duration, elasticLift),
      setPlayAreaTargetingInteractive: (enabled) => this.playArea.setTargetingInteractive(enabled),
      onSelectionChange: () => this.consumableBarBridge.deferRefreshTabs(this.consumableBar),
    });

    this.rollRow = new RollRowController({
      scene: this,
      getRollRowY: () => this.rollRowY,
      getDiceSpacing: (count) => this.getDiceSpacing(count),
      getDiceScale: () => this.getDiceScale(),
      getContentCenterX: () => this.contentCX,
      getSortOrder: () => 'asc' as const,
      isAnimating: () => this.animating,
      isMarqueeActive: () => this.rollMarquee.isActive(),
      isConsumableTargeting: () => this.consumableTargeting.isActive(),
      isDieLifted: (sprite) => this.isDieLifted(sprite),
      onRollDieClick: (sprite, isRightClick) => this.onRollDieClick(sprite, isRightClick),
      onConsumableTargetClick: (sprite) => this.consumableTargeting.onTargetClick(sprite),
      syncRolledDiceFromSprites: () => this.syncRolledDiceFromSprites(),
      onDragBegin: () => {
        this.wasDragging = true;
      },
      getWasDragging: () => this.wasDragging,
      setWasDragging: (value) => {
        this.wasDragging = value;
      },
      onLayoutChange: () => this.notifyDiceRowLayoutChange(),
    });

    this.playArea = new PlayAreaDiceController({
      scene: this,
      getDiceSpacing: (count) => this.getDiceSpacing(count),
      getDiceScale: () => this.getDiceScale(),
      getContentCenterX: () => this.contentCX,
      isConsumableTargeting: () => this.consumableTargeting.isActive(),
      isConsumableTargetDie: (sprite) => this.consumableTargeting.isTargetDie(sprite),
      isConsumablePrePickDie: (sprite) => getGameConsumableSeedDieIds().includes(sprite.dieData.id),
      isConsumablePrePickActive: () => selectRoundPhase() === 'SELECT' && !this.consumableTargeting.isActive(),
      onConsumableTargetClick: (sprite) => this.consumableTargeting.onTargetClick(sprite),
      onConsumablePrePickClick: (sprite) => this.onPlayAreaPrePickClick(sprite),
      onLayoutChange: () => this.notifyDiceRowLayoutChange(),
    });

    this.diceRowBackdropController = new DiceRowBackdropController({
      getRollSprites: () => this.rollRow.getRollSprites(),
      getPlayAreaSprites: () => this.playArea.getSprites(),
      getSelectedDiceIds: () => this.selectedDiceIds,
      isConsumableTargeting: () => this.consumableTargeting.isActive(),
      isConsumableTargetDie: (sprite) => this.consumableTargeting.isTargetDie(sprite),
      getRollRowY: () => this.rollRowY,
      getScoreRowY: () => this.scoreRowY,
      getDiceSpacing: (count) => this.getDiceSpacing(count),
      getDiceScale: () => this.getDiceScale(),
      getContentCenterX: () => this.contentCX,
    });

    this.scoreRowLayout = new ScoreRowLayout({
      scene: this,
      contentCenterX: () => this.contentCX,
      getRollRowY: () => this.rollRowY,
      getScoreRowY: () => this.scoreRowY,
      getDiceSpacing: (count) => this.getDiceSpacing(count),
      getDiceScale: () => this.getDiceScale(),
      onLayoutTransitionStart: () => this.diceRowBackdropController.onScoreLayoutStart(),
      onLayoutTransitionEnd: () => this.diceRowBackdropController.onScoreLayoutEnd(),
    });

    this.rollMarquee = new RollMarqueeSelection({
      scene: this,
      canUseMarquee: () => this.canUseMarquee(),
      getRollSprites: () => this.rollRow.getRollSprites(),
      getZoneBounds: () => ({
        width: this.contentW,
        height: this.scale.height - this.hudBottomReserve,
        cx: this.contentCX,
        cy: (this.scale.height - this.hudBottomReserve) / 2,
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
      onDevBgCycle: (delta) => this.cycleDevBackground(delta),
      getDevBgIndex: () => this.getDevBgPreviewIndex(),
      getDevBgCount: () => GAMEPLAY.ROUND_BACKGROUND_COUNT,
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

    const index = this.getDevBgPreviewIndex();

    ensureGameRoundBackgroundLoaded(this, index, (textureKey) => {
      const bgKey = this.textures.exists(textureKey) ? textureKey : null;
      this.roundBackgroundKey = bgKey;
      this.finishBuildLayout(isRelayout, bgKey);
    });
  }

  private getDevBgPreviewIndex(): number {
    if (this.devBgPreviewIndex === null) {
      this.devBgPreviewIndex = getRunRoundBackgroundIndex(getRunState());
    }
    return this.devBgPreviewIndex;
  }

  private cycleDevBackground(delta: number): void {
    if (!isDevMode()) return;

    const count = GAMEPLAY.ROUND_BACKGROUND_COUNT;
    const current = this.getDevBgPreviewIndex();
    this.devBgPreviewIndex = ((current - 1 + delta + count) % count) + 1;

    ensureGameRoundBackgroundLoaded(this, this.devBgPreviewIndex, (textureKey) => {
      if (!this.textures.exists(textureKey)) return;
      this.roundBackgroundKey = textureKey;
      this.applyRoundBackground(textureKey);
      this.devPanel.update();
    });
  }

  private applyRoundBackground(textureKey: string): void {
    if (!this.bgImage) return;
    this.bgImage.setTexture(textureKey);
    const metrics = computeLayoutMetricsFromScene(this);
    applyCoverBackgroundImage(this.bgImage, getContentBackgroundRegion(metrics));
  }

  private captureBackgroundImage(bgKey: string | null): void {
    this.bgImage = null;
    if (!bgKey) return;
    for (const child of this.children.list) {
      if (child instanceof Phaser.GameObjects.Image && child.texture.key === bgKey) {
        this.bgImage = child;
        return;
      }
    }
  }

  private finishBuildLayout(isRelayout: boolean, bgKey: string | null): void {
    const { height } = this.scale;

    const layout = createLayout(this, { bgKey, felt: false, bgRegion: 'content' });
    this.captureBackgroundImage(bgKey);
    this.sidebar = layout.sidebar;
    this.equipBar = layout.equipBar;
    this.consumableBar = layout.consumableBar;
    this.consumableBar.setCanUsePredicate((def) => this.canUseConsumable(def));
    this.consumableBar.setTargetingStateProvider(() => this.consumableBarBridge.getTargetingState());
    this.dicePouch = layout.dicePouch;
    this.sidebarW = layout.sidebarW;
    this.contentCX = layout.contentCX;
    this.contentW = layout.contentW;

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
    this.consumableBar.on('consumable-arm-targeting', (payload: ConsumableTargetingRequest) => {
      void this.consumableBarBridge.arm(this.consumableBar, payload.index, payload.instance);
    });
    this.consumableBar.on('consumable-commit-targeting', (payload: ConsumableTargetingCommitRequest) => {
      void this.consumableBarBridge.commit(this.consumableBar, payload);
    });
    this.consumableBar.on('consumable-cancel-targeting', () => {
      this.consumableBarBridge.cancel(() => this.consumableTargeting.cancel());
    });

    const hud = computeGameHudLayout(this.scale.width, height, this.contentCX, this.contentW);
    this.rollRowY = hud.rollY;
    this.scoreRowY = hud.scoreY;
    this.hudBottomReserve = hud.bottomReserve;
    this.showRollInstruction = hud.showInstruction;

    this.diceRowBackdropController.rebuild(this);

    const { btnY, btnCenterX, instructionY } = hud;
    const playAreaW = this.contentW;
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
    this.readyBtn = new Button(this, btnCenterX, btnY, 'Roll Selected', 200, 40).onClick(() => this.onReadyToRoll());
    this.rollBtn = new Button(this, btnCenterX, btnY, 'Roll!', 160, 40).onClick(() => this.onRoll());
    this.scoreBtn = new Button(this, hud.scoreBtnX, btnY, 'Score Hand', hud.scoreBtnW, 40).onClick(() =>
      this.onScore(),
    );
    this.rerollBtn = new Button(this, hud.rerollBtnX, btnY, 'Reroll All', hud.rerollBtnW, 40).onClick(() =>
      this.onReroll(),
    );
    this.continueBtn = new Button(this, btnCenterX, btnY, 'Continue', 160, 40).onClick(() => this.onContinue());

    this.sortBtn = new Button(this, hud.sortBtnX, btnY, '', hud.sortBtnW, 40)
      .setIcon('icon_sort', 20)
      .onClick(() => this.onSortDice());
    if (!hud.showInstruction) {
      this.scoreBtn.setLabelFontSize(15);
      this.rerollBtn.setLabelFontSize(15);
    }

    const hudDepth = 50;
    for (const btn of [this.readyBtn, this.rollBtn, this.scoreBtn, this.rerollBtn, this.continueBtn, this.sortBtn]) {
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
      if (layout.layoutMode === 'topbar' && shouldPromptRoundModifications()) {
        const { modalRegion } = layout;
        new RoundModificationsModal(this, modalRegion.x, modalRegion.w, modalRegion.h, modalRegion.y);
      }
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

  private getDiceSpacing(diceCount: number): number {
    return computeDiceSpacing(diceCount, this.contentW);
  }

  private getDiceScale(): number {
    return computeDiceDisplayScale(this.contentW);
  }

  private notifyDiceRowLayoutChange(): void {
    this.diceRowBackdropController.sync();
  }

  private onResize(): void {
    // Preserve game state, destroy all display objects, rebuild layout
    this.rollRow.destroyRollSprites();
    this.playArea.clear();
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
    this.playArea.setY(this.rollRowY);

    const hand = selectHandDice();
    this.playArea.buildHand(hand);
    sceneActions.patchConsumableSeedSelection([]);
    this.playArea.setPrePickInteractive(true);
    const playAreaSprites = this.playArea.getSprites();

    if (animateFromPouch && playAreaSprites.length > 0) {
      const diceScale = this.getDiceScale();
      const launch = this.getDicePouchLaunchPoint();
      this.animating = true;
      let completed = 0;
      let newDiceIndex = 0;
      const onPouchAnimDone = () => {
        this.animating = false;
        if (options.autoRoll) this.maybeAutoRollFirstHand();
      };
      for (let i = 0; i < playAreaSprites.length; i++) {
        const sprite = playAreaSprites[i];
        const finalX = sprite.x;
        const finalY = sprite.y;
        const finalRot = sprite.rotation;
        const carry = carryoverPositions?.get(sprite.dieData.id);
        const isCarryover = Boolean(carry);
        if (carry) {
          sprite.setPosition(carry.x, carry.y);
          sprite.rotation = carry.rotation;
          sprite.setAlpha(1);
          sprite.setScale(diceScale);
        } else {
          sprite.setPosition(launch.x, launch.y);
          sprite.rotation = 0;
          sprite.setAlpha(0);
          sprite.setScale(diceScale * 0.2);
        }

        this.tweens.add({
          targets: sprite,
          x: finalX,
          y: finalY,
          rotation: finalRot,
          alpha: 1,
          scaleX: diceScale,
          scaleY: diceScale,
          duration: 320,
          delay: isCarryover ? 0 : newDiceIndex++ * 90,
          ease: 'Back.easeOut',
          onStart: () => {
            if (!isCarryover) this.sound.play('sfx_card1', { volume: 0.35 });
          },
          onComplete: () => {
            completed++;
            if (completed >= playAreaSprites.length) {
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
    this.refreshConsumableUseTabs();

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
    sceneActions.patchConsumableSeedSelection([]);
    this.playArea.setPrePickInteractive(false);
    this.selectedDiceIds.clear();
    this.rerollLockedDiceIds.clear();
    this.hideAllButtons();

    // Create sprites for rolled dice
    const rolled = selectRolledDice();
    this.rollRow.createRollRow(rolled, this.rollRowY);

    // Play roll animation
    this.animating = true;
    playRollAnimation(this, this.rollSprites, rolled, () => {
      this.animating = false;
      this.rollRow.sortAndReposition();
      this.rollRow.setupInteraction();
      this.rollMarquee.setup();

      this.rerollBtn.setVisible(true);
      this.scoreBtn.setVisible(true);
      this.showSortButton();
      this.updateRollButtons();

      this.instructionText.setText(this.getRollPhaseInstruction());
      this.applyBossRollDiceState();
      this.refreshConsumableUseTabs();
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
    if (this.consumableTargeting.isActive()) return;
    const id = sprite.dieData.id;
    const state = this.getRollDieUiState(id);

    let next: 'unselected' | 'selected' | 'rerollLocked';
    if (isRightClick) {
      if (gameFacade.boss.isDiceLocked(id)) return;
      if (state === 'unselected') next = 'rerollLocked';
      else if (state === 'rerollLocked') next = 'unselected';
      else next = 'rerollLocked';
    } else if (state === 'unselected') {
      next = 'selected';
    } else if (state === 'rerollLocked') {
      next = 'selected';
    } else {
      next = 'unselected';
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
    return (
      !this.animating &&
      !this.consumableTargeting.isActive() &&
      this.rollSprites.length > 0 &&
      selectRoundPhase() === 'ROLL'
    );
  }

  /** Layout-only version for resize: shows rolled dice without replaying animation */
  private enterRollPhaseLayout(): void {
    this.clearSprites();
    this.selectedDiceIds.clear();
    this.rerollLockedDiceIds.clear();
    this.hideAllButtons();

    const rolled = selectRolledDice();
    this.rollRow.createRollRow(rolled, this.rollRowY);
    this.rollRow.setupInteraction();
    this.rollMarquee.setup();

    this.rerollBtn.setVisible(true);
    this.scoreBtn.setVisible(true);
    this.showSortButton();
    this.rollRow.sortAndReposition();
    this.updateRollButtons();

    this.instructionText.setText(this.getRollPhaseInstruction());
    this.applyBossRollDiceState();
    this.refreshConsumableUseTabs();
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

    // Reroll dice that are neither selected for score nor pinned against rerolls
    const allIds = selectRolledDice().map((d) => d.id);
    const idsToReroll = allIds.filter((id) => !this.selectedDiceIds.has(id) && !this.rerollLockedDiceIds.has(id));
    if (idsToReroll.length === 0) return;

    const success = gameFacade.round.rerollUnlockedDice(idsToReroll);
    if (!success && selectRerollsRemaining() > 0 && !gameFacade.round.canUseReroll()) {
      this.showFloatingText('No rerolls on Day 1', 0xffaa44);
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

  private clearSprites(): void {
    this.rollRow.destroyRollSprites();
    this.playArea.clear();
    this.rollMarquee.destroy();
    this.diceRowBackdropController?.reset();
  }

  private hideAllButtons(): void {
    this.readyBtn.setVisible(false);
    this.rollBtn.setVisible(false);
    this.rerollBtn.setVisible(false);
    this.scoreBtn.setVisible(false);
    this.continueBtn.setVisible(false);
    this.sortBtn.setVisible(false);
    this.bossWarningText.setVisible(false);
  }

  private updateDrawButtons(): void {
    const drawCount = selectHandDice().length;
    this.readyBtn.setText(drawCount > 0 ? `Roll ${drawCount} Dice` : 'No Dice To Roll');
    this.readyBtn.setEnabled(drawCount > 0);
  }

  private getRerollButtonText(
    hasRerolls: boolean,
    canUseReroll: boolean,
    rerollCount: number,
    totalCount: number,
  ): string {
    if (!hasRerolls) return 'No Rerolls';
    if (!canUseReroll) return 'Day 1: no rerolls';
    if (rerollCount === totalCount) return 'Reroll All';
    return `Reroll ${rerollCount}`;
  }

  private getScoreButtonText(selectedCount: number): string {
    if (selectedCount > 0) return `Score ${selectedCount}`;
    return 'Select Dice';
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
    this.rerollBtn.setText(this.getRerollButtonText(hasRerolls, canUseReroll, rerollCount, totalCount));
    this.rerollBtn.setCornerBadge(hasRerolls && canUseReroll ? remaining : null);

    this.scoreBtn.setEnabled(selectedCount > 0);
    const daysRemaining = selectRoundConfig().maxDays - selectRoundDay() + 1;
    this.scoreBtn.setText(this.getScoreButtonText(selectedCount));
    this.scoreBtn.setCornerBadge(daysRemaining, COLORS.MILES_BG);

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

  private isDieLifted(sprite: DiceSprite): boolean {
    return this.isRollDieSelected(sprite) || this.consumableTargeting.isTargetDie(sprite);
  }

  /** Keep game-state dice order aligned with on-screen roll sprite order (held-in-hand scoring). */
  private syncRolledDiceFromSprites(): void {
    gameFacade.round.syncRolledDiceFromFaces(this.rollSprites.map((s) => s.dieData));
  }

  private onSortDice(): void {
    this.rollRow.sortAndReposition();
  }

  private showSortButton(): void {
    this.sortBtn.setVisible(true);
  }

  private getRollPhaseInstruction(): string {
    if (!this.showRollInstruction) return '';
    return 'Click to select for score · Right-click to lock against rerolls';
  }

  private getSidebarOverlayTitle(phase: PhaseState | null, bossName: string | undefined): string {
    if (bossName) return bossName;
    if (phase === 'SELECT') return 'READY TO ROLL';
    if (phase === 'ROLL') return 'ROLL PHASE';
    if (phase === 'SCORE') return 'SCORING';
    if (phase === 'DAY_END') return 'DAY COMPLETE';
    return 'GAME';
  }

  private updateHUD(): void {
    const phase = selectRoundPhase();
    const boss = selectCurrentBoss(getRunState());
    gameFacade.round.setSidebarOverlay({
      title: this.getSidebarOverlayTitle(phase, boss?.name),
    });
    this.equipBar.setHintRound(getRoundHintContext());
    this.devPanel.update();
  }

  // ─── Pre-roll hand (SELECT phase) ───

  /** Pop-in + toast when round-start effects add dice to the pouch/hand */
  private animateNewDiceAppearing(): void {
    const newIds = new Set(this.pendingNewDiceIds);

    for (const sprite of this.playArea.getSprites()) {
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
      .text(this.contentCX, this.playArea.getY() - 50, '✨ New Die Added!', {
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

  private async handleConsumableUsed(consumed: ConsumableInstance): Promise<void> {
    const result = gameFacade.consumable.use(consumed, {
      visibleDiceIds: this.getVisibleDieIds(),
    });

    if (!result.success && result.failReason) {
      this.showConsumableFailure(result.failReason);
    }
  }

  private onPlayAreaPrePickClick(sprite: DiceSprite): void {
    const id = sprite.dieData.id;
    const selected = new Set(getGameConsumableSeedDieIds());
    if (selected.has(id)) {
      selected.delete(id);
      sprite.setSelected(false);
      this.sound.play('sfx_card_slide2', { volume: 0.25 });
    } else {
      selected.add(id);
      sprite.setSelected(true);
      this.sound.play('sfx_highlight1', { volume: 0.3 });
    }
    setGameConsumableSeedDieIds([...selected]);
    this.playArea.reposition(true);
  }

  private getConsumableSeedDieIds(): string[] {
    const visible = new Set(this.getVisibleDieIds());
    const phase = selectRoundPhase();
    if (phase === 'SELECT') {
      return getGameConsumableSeedDieIds().filter((id) => visible.has(id));
    }
    if (phase === 'ROLL') {
      return [...this.selectedDiceIds].filter((id) => visible.has(id));
    }
    return [];
  }

  private buildConsumableEligibilityContext(): ConsumableEligibilityContext {
    const phase = selectRoundPhase();
    const visibleDieIds = this.getVisibleDieIds();
    const inRoll = phase === 'ROLL';
    const scoreableDieIds = inRoll ? selectRolledDice().map((d) => d.id) : [];
    const isScoreActionVisible = inRoll && this.scoreBtn.visible;

    if (inRoll) {
      return {
        scene: 'game',
        source: 'bar',
        phase: 'ROLL',
        visibleDieIds,
        scoreableDieIds,
        isScoreActionVisible,
      };
    }

    return {
      scene: 'game',
      source: 'bar',
      phase: 'SELECT',
      visibleDieIds,
      scoreableDieIds: [],
      isScoreActionVisible: false,
    };
  }

  private getVisibleDieIds(): string[] {
    const phase = selectRoundPhase();
    if (phase === 'ROLL' && this.rollSprites.length > 0) {
      return selectRolledDice().map((d) => d.id);
    }
    if (phase === 'SELECT' && this.playArea.getSprites().length > 0) {
      return selectHandDice().map((d) => d.id);
    }
    if (this.rollSprites.length > 0) {
      return selectRolledDice().map((d) => d.id);
    }
    return [];
  }

  private canUseConsumable(def: ConsumableDef): boolean {
    if (this.consumableTargeting.isActive()) return false;
    return isConsumableEligible(def, this.buildConsumableEligibilityContext()).allowed;
  }

  private refreshConsumableUseTabs(): void {
    this.consumableBar.refreshUseEligibility();
  }

  private showConsumableFailure(message: string): void {
    const text = this.add
      .text(this.contentCX, this.consumableBar.y, message, {
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

  private animateConsumableDiceDestruction(
    destroyedIds: string[],
    options: { refillSelectHand?: boolean; floatingText?: string } = {},
  ): Promise<void> {
    const destroyedSet = new Set(destroyedIds);
    const phase = selectRoundPhase();

    this.removeDestroyedDiceFromRoundState(destroyedSet);

    const targetSprites = (phase === 'SELECT' ? this.playArea.getSprites() : this.rollSprites).filter((sprite) =>
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
            this.playArea.removeSprite(sprite);
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
      this.playArea.reposition(true);
      this.updateDrawButtons();
      return Promise.resolve();
    }

    const refillPool = rngShuffle(
      'dice',
      selectAvailableDice(run).filter((d) => !currentIds.has(d.id)),
    );
    const toAdd = refillPool.slice(0, needed);
    if (toAdd.length === 0) return Promise.resolve();

    const diceScale = this.getDiceScale();
    const launch = this.getDicePouchLaunchPoint();
    const startingLength = this.playArea.getSprites().length;
    const nextHand = [...selectHandDice()];
    for (const die of toAdd) {
      nextHand.push(die);
      const sprite = new DiceSprite(this, launch.x, launch.y, die);
      sprite.setDepth(20);
      sprite.setAlpha(0);
      sprite.setScale(diceScale * 0.2);
      this.playArea.addSprite(sprite);
    }
    gameFacade.round.setHandDice(nextHand.slice(0, selectRoundConfig().rollSize));

    const positions = this.playArea.getXPositions(this.playArea.getSprites().length);
    const playAreaY = this.playArea.getY();
    const playAreaSprites = this.playArea.getSprites();
    for (let i = 0; i < startingLength; i++) {
      const arc = getArcOffset(i, playAreaSprites.length, diceScale);
      this.tweens.add({
        targets: playAreaSprites[i],
        x: positions[i],
        y: playAreaY + arc.y,
        rotation: arc.rotation,
        duration: 220,
        ease: 'Power2',
      });
    }

    return new Promise((resolve) => {
      let completed = 0;
      for (let i = 0; i < toAdd.length; i++) {
        const sprite = playAreaSprites[startingLength + i];
        const idx = startingLength + i;
        const arc = getArcOffset(idx, playAreaSprites.length, diceScale);
        this.tweens.add({
          targets: sprite,
          x: positions[idx],
          y: playAreaY + arc.y,
          rotation: arc.rotation,
          alpha: 1,
          scaleX: diceScale,
          scaleY: diceScale,
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

  private restorePhaseUiAfterTargeting(): void {
    const phase = selectRoundPhase();
    if (phase === 'ROLL') {
      this.rerollBtn.setVisible(true);
      this.scoreBtn.setVisible(true);
      this.showSortButton();
      this.updateRollButtons();
    } else if (phase === 'SELECT') {
      this.playArea.setTargetingInteractive(false);
      this.playArea.setPrePickInteractive(true);
      this.readyBtn.setVisible(true);
      this.updateDrawButtons();
    }
    this.refreshConsumableUseTabs();
  }

  private async handleAppliedConsumableTargeting(
    result: Extract<ApplyConsumableTargetingResult, { ok: true }>,
  ): Promise<void> {
    const effectType = result.config.effectType;
    const resultMsg = result.diceResult.message;
    const affectedIds = new Set(result.selectedDice.map((d) => d.id));

    const text = this.add
      .text(this.contentCX, this.rollRowY - 60, resultMsg, {
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

    if (effectType === 'DESTROY') {
      await this.animateConsumableDiceDestruction([...affectedIds], {
        refillSelectHand: false,
        floatingText: `Destroyed ${affectedIds.size} dice`,
      });
      return;
    }

    if (effectType === 'COPY' && result.diceResult.addedDice && result.diceResult.addedDice.length > 0) {
      this.rebuildActiveDiceRowFromStore();
      return;
    }

    this.refreshDiceSpritesAfterEffect(affectedIds, effectType);
  }

  private rebuildActiveDiceRowFromStore(): void {
    const phase = selectRoundPhase();
    if (phase === 'ROLL') {
      const rolled = selectRolledDice();
      this.rollRow.createRollRow(rolled, this.rollRowY);
      this.rollRow.setupInteraction();
      this.syncRollDieVisuals();
      this.rollRow.reposition(false);
      this.rollMarquee.setup();
      this.applyBossRollDiceState();
      return;
    }

    if (phase === 'SELECT') {
      this.playArea.setY(this.rollRowY);
      this.playArea.buildHand(selectHandDice());
      this.playArea.reposition(false);
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
    for (const sprite of this.playArea.getSprites()) {
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
