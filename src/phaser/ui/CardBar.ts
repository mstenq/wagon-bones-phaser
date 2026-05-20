// ─── CardBar ───
// Abstract base class for horizontal card bars (EquipmentBar, ConsumableBar).
// Provides: background, idle wobble, hover tilt, drag-to-reorder, action tab system,
// sell animation, and card layout.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, UI, ANIM } from '../../game/Constants';
import { ItemCard, CardActionTabConfig } from './ItemCard';

const CARD_VERTICAL_OFFSET = 20;

export abstract class CardBar extends GameObjects.Container {
  protected bg: GameObjects.Graphics;
  protected cards: ItemCard[] = [];
  protected slotCountText: GameObjects.Text;
  protected barWidth: number;
  protected barHeight: number;

  // Subclass configuration
  protected abstract readonly cardScale: number;
  protected abstract readonly preferredSpacing: number;
  protected abstract readonly barPadding: number;

  // Drag state
  private draggingCard: ItemCard | null = null;
  private dragStartIndex: number = -1;
  private dragOffsetX: number = 0;
  private dragOffsetY: number = 0;
  private dragHandlersInstalled: boolean = false;
  private dragPrevX: number = 0;
  private dragVelocityX: number = 0;

  // Per-card wobble tweens
  private wobbleTweens: Phaser.Tweens.Tween[] = [];

  // Hover tilt tracking
  private hoveredCard: ItemCard | null = null;
  private moveHandler: ((pointer: Phaser.Input.Pointer) => void) | null = null;
  private tiltRotation: number = 0;
  private tiltScaleX: number = 1;
  private tiltScaleY: number = 1;
  private tiltBaseY: number = 0;

  // Action tab state
  private activeTabCard: ItemCard | null = null;
  private dismissHandler: ((pointer: Phaser.Input.Pointer) => void) | null = null;

  constructor(scene: Scene, x: number, y: number, width: number, height: number) {
    super(scene, x, y);
    this.barWidth = width;
    this.barHeight = height;

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

    this.setDepth(150);
    scene.add.existing(this);

    this.installDragHandlers();
  }

  // ─── Abstract methods ───

  protected abstract getSlotLabel(): string;
  protected abstract getItemCount(): number;
  protected abstract createCardForItem(x: number, y: number, index: number): ItemCard;
  protected abstract buildActionTabs(card: ItemCard, index: number): CardActionTabConfig[] | null;
  protected abstract onReorder(fromIndex: number, toIndex: number): void;
  protected abstract onSellComplete(index: number): void;

  /** Subclasses may disable drag-reorder (e.g. Land Slide hidden equipment) */
  protected isDragReorderEnabled(): boolean {
    return true;
  }

  // ─── Public API ───

  getCards(): ItemCard[] {
    return this.cards;
  }

  refresh(): void {
    for (const t of this.wobbleTweens) t.destroy();
    this.wobbleTweens = [];
    this.hoveredCard = null;
    this.dismissActiveTab();

    for (const card of this.cards) card.destroy();
    this.cards = [];

    this.slotCountText.setText(this.getSlotLabel());

    const count = this.getItemCount();
    if (count === 0) return;

    const spacing = this.getCardSpacing(count);
    const totalW = (count - 1) * spacing;
    const startX = this.barWidth / 2 - totalW / 2;
    const cy = this.barHeight / 2 - CARD_VERTICAL_OFFSET;

    for (let i = 0; i < count; i++) {
      const card = this.createCardForItem(startX + i * spacing, cy, i);
      this.scene.input.setDraggable(card);
      this.add(card);
      this.cards.push(card);

      this.startWobble(card, i);
      this.setupHoverTilt(card);
      this.setupClickActions(card, i);
    }

    this.applyCardDepths();
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

  private startWobble(card: ItemCard, index: number): void {
    const duration =
      ANIM.CARD_WOBBLE_DURATION_MIN + Math.random() * (ANIM.CARD_WOBBLE_DURATION_MAX - ANIM.CARD_WOBBLE_DURATION_MIN);
    const delay = index * 120 + Math.random() * 200;
    const startAngle = (Math.random() - 0.5) * ANIM.CARD_WOBBLE_ANGLE;
    card.rotation = startAngle;

    const tween = this.scene.tweens.add({
      targets: card,
      rotation: { from: -ANIM.CARD_WOBBLE_ANGLE, to: ANIM.CARD_WOBBLE_ANGLE },
      duration,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      delay,
    });
    this.wobbleTweens.push(tween);
  }

  private stopWobble(card: ItemCard): void {
    for (const t of this.wobbleTweens) {
      if ((t as any).targets && (t as any).targets.includes(card)) {
        t.pause();
      }
    }
  }

  private resumeWobble(card: ItemCard): void {
    for (const t of this.wobbleTweens) {
      if ((t as any).targets && (t as any).targets.includes(card)) {
        t.resume();
      }
    }
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

  private setupClickActions(card: ItemCard, index: number): void {
    let wasDragged = false;

    card.on('dragstart', () => {
      wasDragged = true;
    });

    card.on('pointerup', () => {
      if (wasDragged) {
        wasDragged = false;
        return;
      }

      if (this.activeTabCard === card) {
        this.dismissActiveTab();
        return;
      }

      this.dismissActiveTab();

      const tabs = this.buildActionTabs(card, index);
      if (!tabs || tabs.length === 0) return;

      // Lock card in raised state
      this.stopWobble(card);
      this.hoveredCard = null;
      const cy = this.barHeight / 2 - CARD_VERTICAL_OFFSET;
      this.tiltBaseY = cy;
      this.scene.tweens.add({
        targets: card,
        rotation: 0,
        scaleX: ANIM.CARD_TILT_LIFT,
        scaleY: ANIM.CARD_TILT_LIFT,
        y: cy - 4,
        duration: 150,
        ease: 'Back.easeOut',
      });

      this.scene.input.setDraggable(card, false);
      card.setDepth(200);
      this.bringToTop(card);

      card.showActionTabs(tabs);
      this.activeTabCard = card;

      // Click-away dismiss
      this.scene.time.delayedCall(50, () => {
        if (this.dismissHandler) {
          this.scene.input.off('pointerdown', this.dismissHandler);
        }
        this.dismissHandler = (pointer: Phaser.Input.Pointer) => {
          const hitObjects = this.scene.input.hitTestPointer(pointer);
          if (this.activeTabCard && hitObjects.includes(this.activeTabCard)) return;
          for (const go of hitObjects) {
            if (go.parentContainer && this.activeTabCard && go.parentContainer === this.activeTabCard) return;
          }
          this.dismissActiveTab();
        };
        this.scene.input.on('pointerdown', this.dismissHandler);
      });
    });
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
        this.onSellComplete(index);
        this.refresh();
      },
    });
  }

  /** Clean up action tab state and disable interaction before a card removal animation */
  protected beginCardRemoval(card: ItemCard): void {
    card.hideActionTabs(true);
    this.activeTabCard = null;
    if (this.dismissHandler) {
      this.scene.input.off('pointerdown', this.dismissHandler);
      this.dismissHandler = null;
    }
    card.disableInteractive();
  }

  private dismissActiveTab(): void {
    if (this.activeTabCard) {
      const card = this.activeTabCard;
      card.hideActionTabs(true);

      this.scene.input.setDraggable(card, true);
      this.applyCardDepths();

      const cy = this.barHeight / 2 - CARD_VERTICAL_OFFSET;
      this.scene.tweens.add({
        targets: card,
        rotation: 0,
        scaleX: 1,
        scaleY: 1,
        y: cy,
        duration: 250,
        ease: 'Back.easeOut',
        onComplete: () => {
          this.resumeWobble(card);
        },
      });

      this.activeTabCard = null;
    }
    if (this.dismissHandler) {
      this.scene.input.off('pointerdown', this.dismissHandler);
      this.dismissHandler = null;
    }
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

  private getCardXPositions(count: number): number[] {
    if (count === 0) return [];
    const spacing = this.getCardSpacing(count);
    const totalW = (count - 1) * spacing;
    const startX = this.barWidth / 2 - totalW / 2;
    return Array.from({ length: count }, (_, i) => startX + i * spacing);
  }

  private installDragHandlers(): void {
    if (this.dragHandlersInstalled) return;
    this.dragHandlersInstalled = true;

    this.scene.input.dragDistanceThreshold = Math.max(this.scene.input.dragDistanceThreshold ?? 0, 8);

    this.scene.input.on('dragstart', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      const card = gameObject as ItemCard;
      const idx = this.cards.indexOf(card);
      if (idx === -1) return;
      if (this.activeTabCard) return;
      if (!this.isDragReorderEnabled()) return;

      this.draggingCard = card;
      this.dragStartIndex = idx;
      this.dragOffsetX = pointer.worldX - (this.x + card.x);
      this.dragOffsetY = pointer.worldY - (this.y + card.y);
      this.dragPrevX = pointer.worldX;
      this.dragVelocityX = 0;

      this.dismissActiveTab();
      this.stopWobble(card);
      this.hoveredCard = null;
      card.setDepth(200);
      this.bringToTop(card);
      card.scaleX = 1.03;
      card.scaleY = 1.03;
    });

    this.scene.input.on('drag', (pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (!this.draggingCard || gameObject !== this.draggingCard) return;

      const dx = pointer.worldX - this.dragPrevX;
      this.dragVelocityX = this.dragVelocityX * ANIM.CARD_DRAG_SWING_DAMPING + dx * (1 - ANIM.CARD_DRAG_SWING_DAMPING);
      this.dragPrevX = pointer.worldX;

      const swing = Phaser.Math.Clamp(
        this.dragVelocityX * ANIM.CARD_DRAG_SWING_FACTOR,
        -ANIM.CARD_DRAG_SWING_MAX,
        ANIM.CARD_DRAG_SWING_MAX,
      );
      this.draggingCard.rotation = swing;
      this.draggingCard.y = pointer.worldY - this.y - this.dragOffsetY;
      this.draggingCard.x = pointer.worldX - this.x - this.dragOffsetX;

      const positions = this.getCardXPositions(this.cards.length);
      let newIndex = 0;
      let minDist = Infinity;
      for (let i = 0; i < positions.length; i++) {
        const dist = Math.abs(this.draggingCard.x - positions[i]);
        if (dist < minDist) {
          minDist = dist;
          newIndex = i;
        }
      }

      const currentIndex = this.cards.indexOf(this.draggingCard);
      if (newIndex !== currentIndex) {
        this.cards.splice(currentIndex, 1);
        this.cards.splice(newIndex, 0, this.draggingCard);

        for (let i = 0; i < this.cards.length; i++) {
          if (this.cards[i] === this.draggingCard) continue;
          this.scene.tweens.add({
            targets: this.cards[i],
            x: positions[i],
            duration: 150,
            ease: 'Power2',
          });
        }
      }
    });

    this.scene.input.on('dragend', (_pointer: Phaser.Input.Pointer, gameObject: Phaser.GameObjects.GameObject) => {
      if (!this.draggingCard || gameObject !== this.draggingCard) return;

      const card = this.draggingCard;
      const finalIndex = this.cards.indexOf(card);
      const finalVelocity = this.dragVelocityX;
      this.draggingCard = null;
      this.dragVelocityX = 0;

      card.setDepth(0);

      const positions = this.getCardXPositions(this.cards.length);
      const cy = this.barHeight / 2 - CARD_VERTICAL_OFFSET;
      const overshoot = Phaser.Math.Clamp(
        finalVelocity * ANIM.CARD_DRAG_SWING_FACTOR * 2,
        -ANIM.CARD_DRAG_SWING_MAX,
        ANIM.CARD_DRAG_SWING_MAX,
      );
      const dur = ANIM.CARD_DRAG_SETTLE_DURATION;

      this.applyCardDepths();

      this.scene.tweens.chain({
        targets: card,
        tweens: [
          {
            x: positions[finalIndex],
            y: cy,
            rotation: overshoot,
            scaleX: 1,
            scaleY: 1,
            duration: dur * 0.3,
            ease: 'Sine.easeOut',
          },
          {
            rotation: -overshoot * 0.4,
            duration: dur * 0.25,
            ease: 'Sine.easeInOut',
          },
          {
            rotation: overshoot * 0.1,
            duration: dur * 0.2,
            ease: 'Sine.easeInOut',
          },
          {
            rotation: 0,
            duration: dur * 0.25,
            ease: 'Sine.easeIn',
            onComplete: () => {
              this.resumeWobble(card);
            },
          },
        ],
      });

      if (finalIndex !== this.dragStartIndex) {
        this.onReorder(this.dragStartIndex, finalIndex);
      }

      this.dragStartIndex = -1;
    });
  }
}
