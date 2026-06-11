// ─── Button ───
// Playful Phaser button: soft depth, elastic scale/translate/rotation on interact.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { ANIM, COLORS, FONTS, UI } from '../../game/Constants';
import {
  computeWiggleHoverRotation,
  computeWiggleHoverScale,
  computeWigglePressRotation,
  getButtonAnimPreset,
  type ButtonAnimPhase,
  type ButtonAnimConfig,
} from './buttonAnimPresets';
import {
  buttonLabelColor,
  darkenFaceColor,
  getButtonVariantTheme,
  prefersReducedMotion,
  resolveButtonDimensions,
  type ButtonOptions,
  type ButtonVariant,
} from './buttonTheme';
import { getPointerDragDistance } from './pointerDragTrack';
import {
  bakeGraphicsToLinearTexture,
  disableRoundPixels,
  disableRoundPixelsTree,
  removeTextureIfExists,
} from './rotationSmoothing';

export type { ButtonOptions, ButtonSize, ButtonVariant } from './buttonTheme';

const CORNER_BADGE_FONT_SIZE = 14;
const CORNER_BADGE_PAD_X = 6;
const CORNER_BADGE_PAD_Y = 2;
const CORNER_BADGE_MIN = 16;

export class Button extends GameObjects.Container {
  private static nextFaceTextureId = 0;

  private readonly ownerScene: Scene;
  private readonly faceTextureKey: string;
  private depthLayer: GameObjects.Graphics;
  private faceContainer: GameObjects.Container;
  private faceBakeGfx: GameObjects.Graphics;
  private faceImage: GameObjects.Image;
  private label: GameObjects.Text;
  private hitZone: Phaser.GameObjects.Zone;
  private icon: GameObjects.Image | null = null;
  private cornerBadge: GameObjects.Container | null = null;
  private cornerBadgeBg: GameObjects.Graphics | null = null;
  private cornerBadgeLabel: GameObjects.Text | null = null;
  private _enabled = true;
  private _width: number;
  private _height: number;
  private _variant: ButtonVariant;
  private onClickCallback: (() => void) | null = null;
  private _hovered = false;
  private _pressed = false;
  private _touchStartX = 0;
  private _touchStartY = 0;
  private interactionTween: Phaser.Tweens.Tween | null = null;
  private punchTween: Phaser.Tweens.Tween | null = null;
  private _wiggleHoverRotation = 0;
  private _wiggleHoverScale = 1;

  constructor(
    scene: Scene,
    x: number,
    y: number,
    text: string,
    optionsOrWidth?: ButtonOptions | number,
    legacyHeight?: number,
  ) {
    super(scene, x, y);
    this.ownerScene = scene;

    const opts = typeof optionsOrWidth === 'number' ? undefined : optionsOrWidth;
    const legacyWidth = typeof optionsOrWidth === 'number' ? optionsOrWidth : undefined;
    const dims = resolveButtonDimensions(opts, legacyWidth, legacyHeight);

    this._width = dims.width;
    this._height = dims.height;
    this._variant = dims.variant;
    this.faceTextureKey = `btn_face_${Button.nextFaceTextureId++}`;

    this.depthLayer = scene.add.graphics();
    this.faceBakeGfx = scene.add.graphics().setVisible(false);
    this.faceImage = scene.add.image(0, 0, '__MISSING').setOrigin(0.5);
    this.label = scene.add
      .text(0, 0, text, {
        fontFamily: FONTS.TITLE,
        fontSize: `${dims.fontSize}px`,
        color: buttonLabelColor(this._variant, false),
        align: 'center',
      })
      .setOrigin(0.5);

    this.faceContainer = scene.add.container(0, 0, [this.faceImage, this.label]);
    this.hitZone = scene.add.zone(0, 0, this._width, this._height);
    this.add([this.depthLayer, this.faceContainer, this.hitZone]);

    this.syncRotationSmoothing();
    this.redraw();
    this.bindHitZone();

    scene.add.existing(this);
    this.syncHoverFromPointer();
  }

  onClick(cb: () => void): this {
    this.onClickCallback = cb;
    return this;
  }

  setVariant(variant: ButtonVariant): this {
    if (this._variant === variant) return this;
    const wasHovered = this._hovered;
    const wasPressed = this._pressed;
    this._variant = variant;
    this.redraw();
    this._hovered = wasHovered;
    this._pressed = wasPressed;
    if (wasHovered) this.rollWiggleHoverTargets();
    this.applyInteractionState();
    return this;
  }

  setEnabled(enabled: boolean): this {
    this._enabled = enabled;
    if (!enabled) {
      this._hovered = false;
      this._pressed = false;
      this.snapInteractionState();
      this.hitZone.disableInteractive();
    } else {
      this.hitZone.setInteractive({ useHandCursor: true });
      this.syncHoverFromPointer();
    }
    this.redraw();
    return this;
  }

  setText(text: string): this {
    this.label.setText(text);
    return this;
  }

  setLabelFontSize(size: number | string): this {
    this.label.setFontSize(size);
    return this;
  }

  setIcon(textureKey: string, size = 20): this {
    this.label.setVisible(false);
    if (this.icon) {
      this.icon.destroy();
    }
    this.icon = this.ownerScene.add.image(0, 0, textureKey).setOrigin(0.5);
    this.icon.setDisplaySize(size, size);
    this.faceContainer.add(this.icon);
    this.syncRotationSmoothing();
    return this;
  }

  /** Small count pill on the top-right; pass null to hide. */
  setCornerBadge(value: number | null, bgColor: number = COLORS.ERROR_RED): this {
    if (value === null) {
      this.cornerBadge?.setVisible(false);
      return this;
    }

    if (!this.cornerBadge) {
      this.cornerBadgeBg = this.ownerScene.add.graphics();
      this.cornerBadgeLabel = this.ownerScene.add
        .text(0, 0, '', {
          fontFamily: FONTS.TITLE,
          fontSize: `${CORNER_BADGE_FONT_SIZE}px`,
          color: '#ffffff',
          fontStyle: 'normal',
        })
        .setOrigin(0.5);
      this.cornerBadge = this.ownerScene.add.container(0, 0, [this.cornerBadgeBg!, this.cornerBadgeLabel]);
      this.faceContainer.add(this.cornerBadge);
      this.syncRotationSmoothing();
    }

    this.cornerBadgeLabel!.setText(String(value));
    const badgeW = Math.max(CORNER_BADGE_MIN, this.cornerBadgeLabel!.width + CORNER_BADGE_PAD_X * 2);
    const badgeH = Math.max(CORNER_BADGE_MIN, this.cornerBadgeLabel!.height + CORNER_BADGE_PAD_Y * 2);
    const inset = 2;
    this.cornerBadge!.setPosition(this._width / 2 - badgeW / 2 + inset, -this._height / 2 + badgeH / 2 - inset);

    const edgeColor = darkenFaceColor(bgColor, UI.BTN_EDGE_DARKEN);
    this.cornerBadgeBg!.clear();
    this.cornerBadgeBg!.fillStyle(bgColor, 1);
    this.cornerBadgeBg!.fillRoundedRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, badgeH / 2);
    this.cornerBadgeBg!.lineStyle(UI.BTN_EDGE_WIDTH, edgeColor, 1);
    this.cornerBadgeBg!.strokeRoundedRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, badgeH / 2);

    this.cornerBadge!.setVisible(true);
    this.cornerBadge!.setAlpha(1);
    return this;
  }

  destroy(fromScene?: boolean): void {
    this.stopInteractionTween();
    this.stopPunchTween();
    removeTextureIfExists(this.ownerScene, this.faceTextureKey);
    this.faceBakeGfx.destroy();
    super.destroy(fromScene);
  }

  /** Per-button only — keeps global roundPixels for top-bar text on mobile. */
  private syncRotationSmoothing(): void {
    disableRoundPixels(this);
    disableRoundPixels(this.depthLayer);
    disableRoundPixelsTree(this.faceContainer);
  }

  private bindHitZone(): void {
    this.hitZone.setInteractive({ useHandCursor: true });

    this.hitZone.on('pointerover', () => {
      if (!this._enabled) return;
      this._hovered = true;
      this.rollWiggleHoverTargets();
      this.applyInteractionState();
    });
    this.hitZone.on('pointerout', () => {
      if (!this._enabled) return;
      this._hovered = false;
      if (!this._pressed) this.applyInteractionState();
    });
    this.hitZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (!this._enabled) return;
      if (pointer.wasTouch) {
        this._touchStartX = pointer.worldX;
        this._touchStartY = pointer.worldY;
      }
      this._pressed = true;
      this.applyInteractionState();
      this.ownerScene.input.once('pointerup', this.handlePointerRelease, this);
    });
  }

  private handlePointerRelease(pointer: Phaser.Input.Pointer): void {
    if (!this._enabled) return;
    const wasPressed = this._pressed;
    this._pressed = false;

    const inside = this.isPointerInside(pointer);
    this._hovered = inside;
    this.applyInteractionState();

    if (pointer.wasTouch) {
      const dx = pointer.worldX - this._touchStartX;
      const dy = pointer.worldY - this._touchStartY;
      if (wasPressed && inside && Math.hypot(dx, dy) < getPointerDragDistance(pointer)) {
        this.fireClick();
      }
    } else if (wasPressed && inside) {
      this.fireClick();
    }

    if (inside) {
      this.refreshHandCursor();
    }
  }

  private refreshHandCursor(): void {
    if (!this._enabled || !this._hovered || !this.hitZone.input) return;
    this.ownerScene.input.setCursor(this.hitZone.input);
  }

  private syncHoverFromPointer(): void {
    if (!this._enabled || !this.scene?.sys) return;
    const pointer = this.ownerScene.input.activePointer;
    if (!this.isPointerInside(pointer)) return;
    this._hovered = true;
    this._pressed = false;
    this.rollWiggleHoverTargets();
    const phase = this.getInteractionPhase();
    this.snapToPhase(phase);
    this.refreshHandCursor();
  }

  private fireClick(): void {
    if (!this._enabled || !this.onClickCallback) return;
    this.playClickPunch();
    if (this.ownerScene.sound?.get('sfx_button') || this.ownerScene.cache?.audio?.exists('sfx_button')) {
      this.ownerScene.sound.play('sfx_button', { volume: 0.4 });
    }
    this.onClickCallback();
  }

  private isPointerInside(pointer: Phaser.Input.Pointer): boolean {
    const bounds = this.hitZone.getBounds();
    return bounds.contains(pointer.worldX, pointer.worldY);
  }

  private resolvePreset(): ButtonAnimConfig {
    return getButtonAnimPreset();
  }

  private rollWiggleHoverTargets(): void {
    this._wiggleHoverRotation = computeWiggleHoverRotation(this._width);
    this._wiggleHoverScale = computeWiggleHoverScale(this._width);
  }

  private getInteractionPhase(): ButtonAnimPhase {
    const preset = this.resolvePreset();
    if (this._pressed) {
      return {
        ...preset.press,
        rotation: computeWigglePressRotation(this._wiggleHoverRotation),
      };
    }
    if (this._hovered) {
      return {
        ...preset.hover,
        rotation: this._wiggleHoverRotation,
        scale: this._wiggleHoverScale,
      };
    }
    return preset.rest;
  }

  private getInteractionDuration(): number {
    if (this._pressed) return ANIM.BTN_PRESS_MS;
    if (this._hovered) return ANIM.BTN_HOVER_MS;
    return ANIM.BTN_RELEASE_MS;
  }

  private getInteractionEase(): string {
    const preset = this.resolvePreset();
    if (this._pressed) return preset.pressEase;
    if (this._hovered) return preset.hoverEase;
    return preset.releaseEase;
  }

  private usesElasticEase(ease: string): boolean {
    return ease.startsWith('Elastic.');
  }

  private applyInteractionState(): void {
    const phase = this.getInteractionPhase();
    if (prefersReducedMotion() || !this.ownerScene.tweens) {
      this.snapToPhase(phase);
      return;
    }

    this.stopInteractionTween();
    const ease = this.getInteractionEase();
    const tweenConfig: Phaser.Types.Tweens.TweenBuilderConfig = {
      targets: this.faceContainer,
      scaleX: phase.scale,
      scaleY: phase.scale,
      y: phase.y,
      rotation: phase.rotation,
      duration: this.getInteractionDuration(),
      ease,
    };
    if (this.usesElasticEase(ease)) {
      tweenConfig.easeParams = ANIM.BTN_ELASTIC_EASE_PARAMS;
    }
    this.interactionTween = this.ownerScene.tweens.add(tweenConfig);
  }

  private snapInteractionState(): void {
    this.stopInteractionTween();
    this.stopPunchTween();
    this.snapToPhase(this.getInteractionPhase());
  }

  private snapToPhase(phase: ButtonAnimPhase): void {
    this.faceContainer.setScale(phase.scale, phase.scale);
    this.faceContainer.setPosition(0, phase.y);
    this.faceContainer.rotation = phase.rotation;
  }

  private stopInteractionTween(): void {
    this.interactionTween?.stop();
    this.interactionTween = null;
  }

  private stopPunchTween(): void {
    this.punchTween?.stop();
    this.punchTween = null;
  }

  private playClickPunch(): void {
    const preset = this.resolvePreset();
    const punchScale = preset.clickPunchScale;
    if (!punchScale || prefersReducedMotion() || !this.ownerScene.tweens) return;

    this.stopPunchTween();
    this.punchTween = this.ownerScene.tweens.add({
      targets: this.faceContainer,
      scaleX: punchScale,
      scaleY: punchScale,
      duration: ANIM.BTN_CLICK_PUNCH_MS,
      yoyo: true,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.punchTween = null;
        if (this._hovered) {
          this.faceContainer.setScale(this._wiggleHoverScale, this._wiggleHoverScale);
        }
      },
    });
  }

  private bakeFaceTexture(faceColor: number, edgeColor: number): void {
    const scale = UI.BTN_FACE_TEXTURE_SCALE;
    const pad = UI.BTN_FACE_TEXTURE_PAD;
    const radius = UI.BTN_CORNER_RADIUS;
    const bakeW = Math.ceil((this._width + pad * 2) * scale);
    const bakeH = Math.ceil((this._height + pad * 2) * scale);
    const inset = pad * scale;
    const faceW = this._width * scale;
    const faceH = this._height * scale;
    const cornerR = radius * scale;
    const edgeW = UI.BTN_EDGE_WIDTH * scale;

    this.faceBakeGfx.clear();
    this.faceBakeGfx.fillStyle(faceColor, 1);
    this.faceBakeGfx.fillRoundedRect(inset, inset, faceW, faceH, cornerR);
    if (edgeW > 0) {
      this.faceBakeGfx.lineStyle(edgeW, edgeColor, 1);
      this.faceBakeGfx.strokeRoundedRect(inset, inset, faceW, faceH, cornerR);
    }

    bakeGraphicsToLinearTexture(this.ownerScene, this.faceBakeGfx, this.faceTextureKey, bakeW, bakeH);

    this.faceImage.setTexture(this.faceTextureKey);
    this.faceImage.setDisplaySize(this._width, this._height);
  }

  private redraw(): void {
    const theme = getButtonVariantTheme(this._variant);
    const faceColor = this._enabled ? theme.face : theme.disabledFace;
    const halfW = this._width / 2;
    const halfH = this._height / 2;
    const radius = UI.BTN_CORNER_RADIUS;
    const edgeColor = darkenFaceColor(faceColor, UI.BTN_EDGE_DARKEN);

    this.depthLayer.clear();
    this.depthLayer.fillStyle(darkenFaceColor(faceColor, 0.3), UI.BTN_DEPTH_ALPHA);
    this.depthLayer.fillRoundedRect(
      -halfW + UI.BTN_DEPTH_OFFSET_X,
      -halfH + UI.BTN_DEPTH_OFFSET_Y,
      this._width,
      this._height,
      radius,
    );

    this.bakeFaceTexture(faceColor, edgeColor);

    const labelColor = buttonLabelColor(this._variant, !this._enabled);
    this.label.setColor(labelColor);
    this.icon?.setAlpha(this._enabled ? 1 : 0.45);
  }
}
