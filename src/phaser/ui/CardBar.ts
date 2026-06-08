// ─── CardBar ───
// Abstract base class for horizontal card bars (EquipmentBar, ConsumableBar).
// Provides: background, idle wobble, hover tilt, drag-to-reorder, action tab system,
// sell animation, and card layout.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, UI, ANIM } from '../../game/Constants';
import { ItemCard, CardActionTabConfig } from './ItemCard';
import { hitIncludesObjectOrChild, installClickAwayDismiss } from './clickAwayDismiss';
import { createHorizontalDragReorder, type HorizontalDragReorder } from './horizontalDragReorder';
import { wireTapOnlySession } from './pointerDragSession';
import type { CardBarMetrics } from './SceneLayout';

type CardWobbleMode = 'normal' | 'alert';

interface CardWobbleState {
  mode: CardWobbleMode;
  rotationTween: Phaser.Tweens.Tween;
  alertTimer?: Phaser.Time.TimerEvent;
  paused: boolean;
}

export abstract class CardBar extends GameObjects.Container {
  protected bg: GameObjects.Graphics;
  protected cards: ItemCard[] = [];
  protected slotCountText: GameObjects.Text;
  protected barWidth: number;
  protected barHeight: number;

  // Layout (shared equipment + consumable sizing from SceneLayout)
  protected readonly cardScale: number;
  protected readonly preferredSpacing: number;
  protected readonly barPadding: number;
  protected readonly hideCardHints: boolean;
  protected readonly cardCenterY: number;
  protected baseBarDepth: number = UI.CONSUMABLE_BAR_DEPTH;

  // Drag state (manual pointer tracking — Phaser setDraggable is unreliable on touch)
  private draggingCard: ItemCard | null = null;
  private dragSettling: boolean = false;
  private pendingRebuild = false;
  private cardDragReorder: HorizontalDragReorder<ItemCard>;

  // Per-card wobble state (rotation + optional alert pulse timer)
  private cardWobbleStates = new Map<ItemCard, CardWobbleState>();

  // Hover tilt tracking
  private hoveredCard: ItemCard | null = null;
  private moveHandler: ((pointer: Phaser.Input.Pointer) => void) | null = null;
  private tiltRotation: number = 0;
  private tiltScaleX: number = 1;
  private tiltScaleY: number = 1;
  private tiltBaseY: number = 0;

  // Action tab state
  private activeTabCard: ItemCard | null = null;
  private dismissClickAway: (() => void) | null = null;

  constructor(scene: Scene, x: number, y: number, width: number, height: number, cardLayout: CardBarMetrics) {
    super(scene, x, y);
    this.barWidth = width;
    this.barHeight = height;
    this.cardScale = cardLayout.cardScale;
    this.preferredSpacing = cardLayout.cardSpacing;
    this.barPadding = cardLayout.barPadding;
    this.hideCardHints = cardLayout.hideCardHints;
    this.cardCenterY = cardLayout.cardCenterY;

    this.bg = scene.add.graphics();
    this.bg.setDepth(-10);
    this.add(this.bg);

    this.drawBackground();

    this.slotCountText = scene.add
      .text(width - 8, height - 4, '', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '11px',
        color: TEXT_COLORS.MUTED,
      })
      .setOrigin(1, 1);
    this.slotCountText.setDepth(-5);
    this.add(this.slotCountText);

    this.setDepth(this.baseBarDepth);
    scene.add.existing(this);

    this.cardDragReorder = createHorizontalDragReorder({
      scene,
      getItems: () => this.cards,
      getSlotPositions: (count) => {
        const positions = this.getCardXPositions(count);
        return positions.map((x) => ({ x, y: this.cardCenterY, rotation: 0 }));
      },
      canStart: (card) => this.canStartCardDrag(card),
      getPointerOffset: (card, pointer) => ({
        x: pointer.worldX - (this.x + card.x),
        y: pointer.worldY - (this.y + card.y),
      }),
      onBegin: (card) => {
        this.beginCardDrag(card);
      },
      onMoveItem: (card, pointer, ctx) => {
        card.rotation = ctx.swing;
        card.y = pointer.worldY - this.y - ctx.offsetY;
        card.x = pointer.worldX - this.x - ctx.offsetX;
      },
      onReorder: (fromIndex, toIndex) => {
        this.onReorder(fromIndex, toIndex);
      },
      onSettleStart: (card) => {
        card.setAuraDragging(false);
        card.setDepth(0);
        this.applyCardDepths();
        this.draggingCard = null;
        this.dragSettling = true;
      },
      onSettleComplete: (card, _fromIndex, _toIndex) => {
        this.dragSettling = false;
        this.setAllCardTooltipsSuppressed(false);
        this.resumeWobble(card);
        this.flushPendingRebuild();
        this.tryRestoreBarDepth();
      },
      onReleaseWithoutDrag: (card) => {
        const index = this.cards.indexOf(card);
        if (index !== -1) this.openActionTabsForCard(card, index);
      },
    });
  }

  destroy(fromScene?: boolean): void {
    this.cardDragReorder.stop();
    if (this.moveHandler) {
      this.scene.input.off('pointermove', this.moveHandler);
      this.moveHandler = null;
    }
    this.hoveredCard = null;
    this.dismissActiveTab();
    this.clearDismissClickAway();
    super.destroy(fromScene);
  }

  // ─── Abstract methods ───

  protected abstract getSlotLabel(): string;
  protected abstract getItemCount(): number;
  protected abstract createCardForItem(x: number, y: number, index: number): ItemCard;
  protected abstract buildActionTabs(card: ItemCard, index: number): CardActionTabConfig[] | null;
  protected abstract onReorder(fromIndex: number, toIndex: number): void;
  protected abstract onSellComplete(index: number): void;

  /** Subclasses enable aggressive alert wobble when timing-sensitive effects are active. */
  protected shouldUseAlertWobble(_card: ItemCard, _index: number): boolean {
    return false;
  }

  /** Subclasses can observe click-away/toggle dismissal of an active card. */
  protected onActionTabsDismissed(_card: ItemCard, _index: number): void {}

  /** Subclasses suppress spurious tab dismiss on the same pointer gesture (e.g. USE → bump tabs). */
  protected shouldSuppressTabDismiss(): boolean {
    return false;
  }

  /** Subclasses may disable drag-reorder (e.g. Land Slide hidden equipment) */
  protected isDragReorderEnabled(): boolean {
    return true;
  }

  /** True while dragging or a settle-back tween is playing. */
  protected isCardInteractionBusy(): boolean {
    return this.draggingCard !== null || this.cardDragReorder.isDragging() || this.dragSettling;
  }

  /** True while the dropped card is playing its settle-back tween (store reorder is deferred). */
  protected isDragSettling(): boolean {
    return this.dragSettling;
  }

  // ─── Public API ───

  getCards(): ItemCard[] {
    return this.cards;
  }

  /** Rebuild card row from current store-backed model (subclasses provide counts via getItemCount). */
  protected rebuildCards(): void {
    if (this.isCardInteractionBusy()) {
      this.pendingRebuild = true;
      return;
    }
    this.pendingRebuild = false;
    this.rebuildCardsNow();
  }

  /** Subclasses override to sync from store (e.g. in-place refresh before full rebuild). */
  protected syncCardsFromStore(): void {
    this.rebuildCardsNow();
  }

  private flushPendingRebuild(): void {
    if (!this.pendingRebuild || this.isCardInteractionBusy()) return;
    this.pendingRebuild = false;
    this.syncCardsFromStore();
  }

  protected rebuildCardsNow(): void {
    this.clearAllCardWobbles();
    this.hoveredCard = null;
    this.dismissActiveTab();

    for (const card of this.cards) {
      card.hideTooltip();
      card.destroy();
    }
    this.cards = [];

    this.slotCountText.setText(this.getSlotLabel());

    const count = this.getItemCount();
    if (count === 0) return;

    const spacing = this.getCardSpacing(count);
    const totalW = (count - 1) * spacing;
    const startX = this.barWidth / 2 - totalW / 2;
    for (let i = 0; i < count; i++) {
      const card = this.createCardForItem(startX + i * spacing, this.cardCenterY, i);
      this.add(card);
      this.setupCardDragPointerDown(card);
      this.cards.push(card);

      this.startWobbleForCard(card, i);
      this.setupHoverTilt(card);
    }

    this.applyCardDepths();
  }

  /** Reconcile alert vs normal wobble when card conditions change without a rebuild. */
  protected syncCardWobbleModes(): void {
    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      if (!card) continue;
      const wantAlert = this.shouldUseAlertWobble(card, i);
      const state = this.cardWobbleStates.get(card);
      const hasAlert = state?.mode === 'alert';
      if (wantAlert === hasAlert) continue;

      const wasPaused = state?.paused ?? false;
      this.startWobbleForCard(card, i);
      if (wasPaused) this.stopWobble(card);
    }
  }

  // ─── Background ───

  private drawBackground(): void {
    this.bg.clear();
    this.bg.fillStyle(COLORS.BG_PRIMARY, 0.6);
    this.bg.fillRoundedRect(0, 0, this.barWidth, this.barHeight, 8);
    this.bg.lineStyle(1, COLORS.SIDEBAR_SECTION_BORDER, 0.5);
    this.bg.strokeRoundedRect(0, 0, this.barWidth, this.barHeight, 8);
  }

  // ─── Idle Wobble ───

  private clearAllCardWobbles(): void {
    for (const card of [...this.cardWobbleStates.keys()]) {
      this.destroyCardWobble(card);
    }
  }

  private destroyCardWobble(card: ItemCard): void {
    const state = this.cardWobbleStates.get(card);
    if (!state) return;
    state.rotationTween.destroy();
    state.alertTimer?.destroy();
    this.cardWobbleStates.delete(card);
  }

  protected startWobbleForCard(card: ItemCard, index: number): void {
    this.destroyCardWobble(card);

    const duration =
      ANIM.CARD_WOBBLE_DURATION_MIN + Math.random() * (ANIM.CARD_WOBBLE_DURATION_MAX - ANIM.CARD_WOBBLE_DURATION_MIN);
    const delay = index * 120 + Math.random() * 200;
    const startAngle = (Math.random() - 0.5) * ANIM.CARD_WOBBLE_ANGLE;
    card.rotation = startAngle;

    const mode: CardWobbleMode = this.shouldUseAlertWobble(card, index) ? 'alert' : 'normal';
    const rotationTween = this.scene.tweens.add({
      targets: card,
      rotation: { from: -ANIM.CARD_WOBBLE_ANGLE, to: ANIM.CARD_WOBBLE_ANGLE },
      duration,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay,
    });

    const state: CardWobbleState = { mode, rotationTween, paused: false };
    if (mode === 'alert') {
      state.alertTimer = this.scene.time.addEvent({
        delay: ANIM.CARD_ALERT_WIGGLE_INTERVAL + index * 120 + Math.random() * 200,
        loop: true,
        callback: () => this.playAlertPulse(card),
      });
    }
    this.cardWobbleStates.set(card, state);
  }

  private canCardAcceptAlertPulse(card: ItemCard): boolean {
    if (!card.scene) return false;
    if (this.draggingCard === card) return false;
    if (this.dragSettling) return false;
    if (this.hoveredCard === card) return false;
    if (this.activeTabCard === card) return false;
    const state = this.cardWobbleStates.get(card);
    if (!state || state.paused) return false;
    return state.mode === 'alert';
  }

  private playAlertPulse(card: ItemCard): void {
    if (!this.canCardAcceptAlertPulse(card)) return;

    const origX = card.x;
    this.scene.tweens.add({
      targets: card,
      x: origX - ANIM.CARD_ALERT_SHAKE_OFFSET,
      duration: ANIM.CARD_ALERT_SHAKE_DURATION,
      yoyo: true,
      repeat: ANIM.CARD_ALERT_SHAKE_REPEATS,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        card.x = origX;
      },
    });
    this.scene.tweens.add({
      targets: card,
      scaleX: ANIM.CARD_ALERT_WIGGLE_SCALE,
      scaleY: ANIM.CARD_ALERT_WIGGLE_SCALE,
      duration: ANIM.CARD_ALERT_SCALE_DURATION / 2,
      yoyo: true,
      ease: 'Back.easeOut',
    });
  }

  private stopWobble(card: ItemCard): void {
    const state = this.cardWobbleStates.get(card);
    if (!state || state.paused) return;
    state.paused = true;
    state.rotationTween.pause();
    if (state.alertTimer) state.alertTimer.paused = true;
  }

  private resumeWobble(card: ItemCard): void {
    if (!card.scene) return;
    const state = this.cardWobbleStates.get(card);
    if (!state || !state.paused) return;
    state.paused = false;
    state.rotationTween.resume();
    if (state.alertTimer) state.alertTimer.paused = false;
  }

  // ─── Hover Tilt (faux 3D perspective) ───

  private setupHoverTilt(card: ItemCard): void {
    card.on('pointerover', () => {
      if (this.draggingCard === card) return;
      if (this.activeTabCard === card) return;
      this.hoveredCard = card;
      this.tiltRotation = card.rotation;
      this.tiltScaleX = card.scaleX;
      this.tiltScaleY = card.scaleY;
      this.tiltBaseY = card.y;
      this.stopWobble(card);

      this.scene.tweens.add({
        targets: card,
        scaleX: ANIM.CARD_TILT_LIFT,
        scaleY: ANIM.CARD_TILT_LIFT,
        y: this.tiltBaseY - 4,
        duration: 200,
        ease: 'Back.easeOut',
      });

      if (!this.moveHandler) {
        this.moveHandler = (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer);
        this.scene.input.on('pointermove', this.moveHandler);
      }
    });

    card.on('pointerout', () => {
      if (this.hoveredCard !== card) return;
      this.hoveredCard = null;
      if (this.activeTabCard === card) return;
      this.resetTilt(card);
      this.resumeWobble(card);
    });
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    const card = this.hoveredCard;
    if (!card || this.draggingCard === card) return;
    if (this.activeTabCard === card) return;

    const cardWorldX = this.x + card.x;
    const cardWorldY = this.y + card.y;
    const cw = card.width;
    const ch = card.height;

    const nx = Phaser.Math.Clamp((pointer.worldX - cardWorldX) / (cw / 2), -1, 1);
    const ny = Phaser.Math.Clamp((pointer.worldY - cardWorldY) / (ch / 2), -1, 1);

    const targetRotation = -nx * ANIM.CARD_TILT_MAX;
    const targetScaleX = ANIM.CARD_TILT_LIFT - Math.abs(nx) * ANIM.CARD_TILT_SCALE_AMOUNT;
    const targetScaleY = ANIM.CARD_TILT_LIFT - Math.abs(ny) * ANIM.CARD_TILT_SCALE_AMOUNT * 0.4;

    const lerp = ANIM.CARD_TILT_LERP;
    this.tiltRotation += (targetRotation - this.tiltRotation) * lerp;
    this.tiltScaleX += (targetScaleX - this.tiltScaleX) * lerp;
    this.tiltScaleY += (targetScaleY - this.tiltScaleY) * lerp;

    card.rotation = this.tiltRotation;
    card.scaleX = this.tiltScaleX;
    card.scaleY = this.tiltScaleY;
  }

  private resetTilt(card: ItemCard): void {
    this.scene.tweens.add({
      targets: card,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      y: this.tiltBaseY,
      duration: 300,
      ease: 'Back.easeOut',
    });
  }

  // ─── Click Actions (action tabs) ───

  private openActionTabsForCard(card: ItemCard, index: number): void {
    if (this.activeTabCard === card) {
      this.dismissActiveTab();
      return;
    }

    this.dismissActiveTab();

    const tabs = this.buildActionTabs(card, index);
    if (!tabs || tabs.length === 0) return;

    this.stopWobble(card);
    this.hoveredCard = null;
    this.tiltBaseY = this.cardCenterY;
    this.scene.tweens.add({
      targets: card,
      rotation: 0,
      scaleX: ANIM.CARD_TILT_LIFT,
      scaleY: ANIM.CARD_TILT_LIFT,
      y: this.cardCenterY - 4,
      duration: 150,
      ease: 'Back.easeOut',
    });

    card.setDepth(200);
    this.bringToTop(card);
    this.elevateBarForInteraction();

    card.showActionTabs(tabs);
    this.activeTabCard = card;

    this.clearDismissClickAway();
    this.dismissClickAway = installClickAwayDismiss(this.scene, {
      isInside: (hitObjects) => hitIncludesObjectOrChild(hitObjects, this.activeTabCard),
      onDismiss: () => this.dismissActiveTab(),
    });
  }

  protected refreshOpenActionTabs(card: ItemCard, index: number, instant = false): void {
    if (this.activeTabCard !== card) return;
    const tabs = this.buildActionTabs(card, index);
    if (!tabs || tabs.length === 0) {
      this.dismissActiveTab();
      return;
    }
    card.showActionTabs(tabs, instant ? { instant: true } : undefined);
  }

  /** Keep action tabs visible for an armed card (re-open after a spurious dismiss). */
  protected ensureActionTabsOpen(card: ItemCard, index: number, instant = false): void {
    if (this.activeTabCard === card) {
      this.refreshOpenActionTabs(card, index, instant);
      return;
    }
    this.openActionTabsForCard(card, index);
  }

  private clearDismissClickAway(): void {
    if (this.dismissClickAway) {
      this.dismissClickAway();
      this.dismissClickAway = null;
    }
  }

  private elevateBarForInteraction(): void {
    this.setDepth(UI.CARD_BAR_INTERACTION_DEPTH);
  }

  protected tryRestoreBarDepth(): void {
    if (this.isCardInteractionBusy() || this.activeTabCard) return;
    this.setDepth(this.baseBarDepth);
  }

  // ─── Sell Animation ───

  protected animateSellCard(card: ItemCard, index: number): void {
    this.beginCardRemoval(card);

    this.scene.sound.play('sfx_crumple1', { volume: 0.5 });
    this.scene.time.delayedCall(100, () => {
      this.scene.sound.play('sfx_coin', { volume: 0.5 });
    });

    const flingDirection = Math.random() > 0.5 ? 1 : -1;
    this.scene.tweens.add({
      targets: card,
      x: card.x + flingDirection * 300,
      y: card.y - 200,
      rotation: flingDirection * (1.5 + Math.random()),
      scaleX: 0.1,
      scaleY: 0.1,
      alpha: 0,
      duration: 400,
      ease: 'Power3',
      onComplete: () => {
        const cardCountBefore = this.cards.length;
        this.onSellComplete(index);
        // Successful sell rebuilds via store subscription; only rebuild if sell failed.
        if (this.cards.length === cardCountBefore) this.rebuildCards();
        this.tryRestoreBarDepth();
      },
    });
  }

  /** Clean up action tab state and disable interaction before a card removal animation */
  protected beginCardRemoval(card: ItemCard): void {
    card.prepareForRemoval();
    this.activeTabCard = null;
    this.clearDismissClickAway();
  }

  private dismissActiveTab(): void {
    if (this.activeTabCard) {
      const card = this.activeTabCard;
      const index = this.cards.indexOf(card);
      card.hideActionTabs(true);

      this.applyCardDepths();

      this.scene.tweens.add({
        targets: card,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        y: this.cardCenterY,
        duration: 250,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.resumeWobble(card);
        },
      });

      this.activeTabCard = null;
      if (index >= 0) {
        this.onActionTabsDismissed(card, index);
      }
    }
    this.clearDismissClickAway();
    this.tryRestoreBarDepth();
  }

  // ─── Drag-to-Reorder ───

  private applyCardDepths(): void {
    for (let i = 0; i < this.cards.length; i++) {
      this.cards[i].setDepth(i);
    }
    this.sort('depth');
  }

  protected getCardSpacing(count: number): number {
    if (count <= 1) return 0;
    const cardW = UI.CARD_W * this.cardScale;
    const availableW = this.barWidth - this.barPadding * 2 - cardW;
    const neededW = (count - 1) * this.preferredSpacing;
    if (neededW <= availableW) return this.preferredSpacing;
    return availableW / (count - 1);
  }

  private setAllCardTooltipsSuppressed(suppressed: boolean): void {
    for (const card of this.cards) {
      card.setInteractionTooltipSuppressed(suppressed);
    }
  }

  private getCardXPositions(count: number): number[] {
    if (count === 0) return [];
    const spacing = this.getCardSpacing(count);
    const totalW = (count - 1) * spacing;
    const startX = this.barWidth / 2 - totalW / 2;
    return Array.from({ length: count }, (_, i) => startX + i * spacing);
  }

  private canStartCardDrag(card: ItemCard): boolean {
    if (this.cards.indexOf(card) === -1) return false;
    if (this.activeTabCard) return false;
    if (this.draggingCard) return false;
    return this.isDragReorderEnabled();
  }

  private setupCardDragPointerDown(card: ItemCard): void {
    card.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.activeTabCard === card) {
        wireTapOnlySession(this.scene, card, pointer, card, {
          canTap: () => this.activeTabCard === card,
          onTap: (activeCard, upPointer) => {
            const hitObjects = this.scene.input.hitTestPointer(upPointer);
            if (this.hitIncludesActionTab(hitObjects, activeCard)) return;
            if (this.shouldSuppressTabDismiss()) return;
            this.dismissActiveTab();
          },
        });
        return;
      }

      this.cardDragReorder.wirePointerDown(card, pointer, card);
    });
  }

  private hitIncludesActionTab(hitObjects: Phaser.GameObjects.GameObject[], card: ItemCard): boolean {
    for (const tab of card.getActionTabContainers()) {
      if (hitIncludesObjectOrChild(hitObjects, tab)) return true;
    }
    return false;
  }

  private beginCardDrag(card: ItemCard): void {
    const idx = this.cards.indexOf(card);
    if (idx === -1) return;

    if (this.dragSettling) {
      this.interruptSettleAnimations();
    }

    this.draggingCard = card;
    card.setAuraDragging(true);

    this.dismissActiveTab();
    this.setAllCardTooltipsSuppressed(true);
    this.stopWobble(card);
    this.hoveredCard = null;
    card.setDepth(200);
    this.bringToTop(card);
    this.elevateBarForInteraction();
    card.scaleX = 1.03;
    card.scaleY = 1.03;
  }

  /** Snap all cards to slot positions when a new drag interrupts settle tweens. */
  private interruptSettleAnimations(): void {
    const positions = this.getCardXPositions(this.cards.length);
    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i]!;
      card.setAuraDragging(false);
      this.scene.tweens.killTweensOf(card);
      card.x = positions[i] ?? card.x;
      card.y = this.cardCenterY;
      card.rotation = 0;
      card.scaleX = 1;
      card.scaleY = 1;
      this.startWobbleForCard(card, i);
    }
    this.applyCardDepths();
    this.dragSettling = false;
    this.setAllCardTooltipsSuppressed(false);
  }
}
