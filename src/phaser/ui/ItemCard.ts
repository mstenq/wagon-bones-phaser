// ─── ItemCard ───
// Reusable Phaser Container that displays any game card (equipment, trail guide,
// supply card, frontier encounter, etc.) as a worn card with rounded corners,
// drop shadow, item image, and hover tooltip.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { UI } from '../../game/Constants';
import type { EquipmentInstance } from '../../game/ItemsSystem';
import type { ItemDisplayResult } from '../../game/ItemsSystem';
import type { RoundHintContext, ItemDisplayContext } from '../../game/displayContext';
import { createActionTabs, type ActionTabsHandle } from './actionTabs';
import { ItemCardAuras } from './itemCard/ItemCardAuras';
import { ItemCardBadges } from './itemCard/ItemCardBadges';
import { ItemCardChrome } from './itemCard/ItemCardChrome';
import { ItemCardHints } from './itemCard/ItemCardHints';
import { ItemCardTooltip } from './itemCard/ItemCardTooltip';
import type { CardActionTabConfig, CardData, ItemCardLayout, ItemCardOptions } from './itemCard/itemCardTypes';

export type { CardActionTabConfig, CardData, ItemCardOptions } from './itemCard/itemCardTypes';

const CARD_W = UI.CARD_W;
const CARD_H = UI.CARD_H;

export class ItemCard extends GameObjects.Container {
  private _def: CardData;
  private _options: ItemCardOptions;
  private _sold = false;
  private _faceDown = false;
  private _equipment: EquipmentInstance | null = null;
  private readonly layout: ItemCardLayout;
  private readonly chrome: ItemCardChrome;
  private readonly badges: ItemCardBadges;
  private readonly auras: ItemCardAuras;
  private readonly hints: ItemCardHints;
  private readonly tooltip: ItemCardTooltip;
  private readonly actionTabs: ActionTabsHandle;

  constructor(scene: Scene, x: number, y: number, def: CardData, options?: ItemCardOptions) {
    super(scene, x, y);
    this._def = def;
    this._options = options ?? {};
    this._equipment = this._options.equipment ?? null;

    const cardScale = this._options.cardScale ?? 1;
    this.layout = {
      cardW: CARD_W * cardScale,
      cardH: CARD_H * cardScale,
      cardScale,
      tabAnchorX: this._options.tabAnchorX ?? (CARD_W * cardScale) / 2,
    };

    this.chrome = new ItemCardChrome(scene, this, this.layout, def, this._options);
    this.badges = new ItemCardBadges(scene, this, this.layout, def);
    this.auras = new ItemCardAuras(
      scene,
      this,
      this.layout,
      () => this.chrome.cardBg,
      () => this.chrome.cardImage,
    );
    this.hints = new ItemCardHints(scene, this, this.layout, def);
    this.tooltip = new ItemCardTooltip(
      scene,
      this,
      this.layout,
      def,
      () => this._equipment,
      () => {
        const matrix = this.getWorldTransformMatrix();
        return { x: matrix.tx, y: matrix.ty };
      },
    );
    this.actionTabs = createActionTabs({
      scene,
      parent: this,
      layout: {
        cardW: this.layout.cardW,
        cardH: this.layout.cardH,
        cardScale: this.layout.cardScale,
        tabAnchorX: this.layout.tabAnchorX,
      },
    });

    this.badges.render(this._equipment);
    if (this._def.aura) this.auras.setup(this._def.aura);

    this.setSize(this.layout.cardW, this.layout.cardH);
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, this.layout.cardW, this.layout.cardH),
      Phaser.Geom.Rectangle.Contains,
    );

    this.on('pointerover', this.onPointerOver, this);
    this.on('pointerout', this.onPointerOut, this);

    scene.add.existing(this);
  }

  get def(): CardData {
    return this._def;
  }
  get sold(): boolean {
    return this._sold;
  }
  get equipment(): EquipmentInstance | null {
    return this._equipment;
  }
  get tabsVisible(): boolean {
    return this.actionTabs.visible;
  }
  get cardWidth(): number {
    return this.layout.cardW;
  }
  get cardHeight(): number {
    return this.layout.cardH;
  }

  /** Refresh modifier and profession-special badges (e.g. after perishable countdown). */
  updateModifierBadges(equipment?: EquipmentInstance): void {
    if (equipment) this._equipment = equipment;
    this.badges.render(this._equipment);
    this.applyFaceDownSuppression();
  }

  /** Re-apply aura VFX when equipment.def is replaced in-place (Bless, Blood Moon, dev tools). */
  syncAuraFromEquipment(equipment: EquipmentInstance): void {
    this._equipment = equipment;
    const prevAuraId = this._def.aura?.id ?? '';
    this._def = equipment.def;
    this.auras.syncFromEquipment(this._def.aura, prevAuraId);
  }

  flashPerishableWarning(): void {
    this.badges.flashPerishableWarning();
  }

  flashLeasedPaid(): void {
    this.badges.flashLeasedPaid();
  }

  animateModifierDestruction(type: 'perished' | 'repossessed', onComplete: () => void): void {
    this.prepareForRemoval();

    const matrix = this.getWorldTransformMatrix();
    const wx = matrix.tx;
    const wy = matrix.ty - this.layout.cardH / 2 - 8;
    const label = type === 'perished' ? 'Spoiled!' : 'Repossessed!';
    const color = type === 'perished' ? '#ff8800' : '#ffd700';

    const popup = this.scene.add
      .text(wx, wy, label, {
        fontFamily: 'Arial Black',
        fontSize: '15px',
        color,
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(500);

    this.scene.sound.play('sfx_explosion', { volume: 0.45 });

    this.scene.tweens.add({
      targets: popup,
      y: wy - 28,
      alpha: 0,
      duration: 700,
      ease: 'Power2',
      onComplete: () => popup.destroy(),
    });

    this.scene.tweens.add({
      targets: this,
      alpha: 0,
      scaleX: 0.15,
      scaleY: 0.15,
      rotation: this.rotation + (Math.random() > 0.5 ? 0.6 : -0.6),
      duration: 380,
      ease: 'Power2',
      onComplete: () => {
        this.destroy();
        onComplete();
      },
    });
  }

  prepareForRemoval(): void {
    if (!this.scene) return;
    this.tooltip.hide();
    this.hideActionTabs(true);
    this.disableInteractive();
  }

  markSold(): void {
    this._sold = true;
    this.chrome.markSold();
  }

  setAffordable(canAfford: boolean): void {
    this.chrome.setAffordable(canAfford, this._sold);
  }

  setBossDisabled(disabled: boolean): void {
    this.chrome.drawBossDisabledOverlay(disabled);
  }

  setFaceDown(faceDown: boolean): void {
    this._faceDown = faceDown;
    this.refreshFaceDown();
  }

  setSuppressTooltip(suppress: boolean): void {
    this.tooltip.setSuppressTooltip(suppress);
  }

  setInteractionTooltipSuppressed(suppressed: boolean): void {
    this.tooltip.setInteractionTooltipSuppressed(suppressed);
  }

  setSuppressHints(suppress: boolean): void {
    this.hints.setSuppressHints(suppress);
  }

  setTooltipContext(round: RoundHintContext | null, player: ItemDisplayContext | null = null): void {
    this.tooltip.setContext(round, player);
  }

  updateHints(round: RoundHintContext | null, player: ItemDisplayContext): void {
    this.setTooltipContext(round, player);
    this.hints.update(round, player, (r, p) => this.resolveDisplay(r, p));
  }

  showActionTabs(tabs: CardActionTabConfig[]): void {
    this.actionTabs.show(tabs);
  }

  hideActionTabs(animate: boolean = false): void {
    this.actionTabs.hide(animate);
  }

  getActionTabContainers(): GameObjects.Container[] {
    return this.actionTabs.getContainers();
  }

  destroy(fromScene?: boolean): void {
    this.tooltip.destroy();
    this.actionTabs.hide();
    this.badges.destroy();
    this.auras.destroy();
    this.hints.destroy();
    super.destroy(fromScene);
  }

  private onPointerOver(): void {
    this.tooltip.show((r, p) => this.resolveDisplay(r, p));
  }

  private onPointerOut(): void {
    this.tooltip.hide();
  }

  private resolveDisplay(round: RoundHintContext | null, player: ItemDisplayContext): ItemDisplayResult {
    return this._def.display(round, player);
  }

  private refreshFaceDown(): void {
    this.chrome.refreshFaceDown(this._faceDown);
    this.applyFaceDownSuppression();
    this.tooltip.setFaceDown(this._faceDown);
  }

  private applyFaceDownSuppression(): void {
    this.badges.setVisible(!this._faceDown);
    this.auras.setSuppressed(this._faceDown, this._def.aura);
  }
}
