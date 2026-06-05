// ─── ItemCard hover tooltip ───

import { GameObjects, Scene } from 'phaser';
import type { EquipmentInstance } from '../../../game/ItemsSystem';
import type { ItemDisplayResult } from '../../../game/ItemsSystem';
import { getItemDisplayContext, type RoundHintContext, type ItemDisplayContext } from '../../../game/displayContext';
import type { CardData, ItemCardLayout } from './itemCardTypes';
import {
  appendTooltipLine,
  buildTooltipLines,
  computeTooltipPosition,
  createTooltipBackground,
  createTooltipLayout,
  createTooltipTitle,
  getTooltipDimensions,
  getTooltipTitleColor,
} from './itemCardTooltipRender';

export class ItemCardTooltip {
  private readonly scene: Scene;
  private readonly layout: ItemCardLayout;
  private readonly def: CardData;
  private getEquipment: () => EquipmentInstance | null;
  private getWorldPosition: () => { x: number; y: number };
  private tooltip: GameObjects.Container | null = null;
  private tooltipRound: RoundHintContext | null = null;
  private tooltipPlayer: ItemDisplayContext | null = null;
  private suppressTooltip = false;
  private interactionTooltipSuppressed = false;
  private faceDown = false;

  constructor(
    scene: Scene,
    _card: GameObjects.Container,
    layout: ItemCardLayout,
    def: CardData,
    getEquipment: () => EquipmentInstance | null,
    getWorldPosition: () => { x: number; y: number },
  ) {
    this.scene = scene;
    this.layout = layout;
    this.def = def;
    this.getEquipment = getEquipment;
    this.getWorldPosition = getWorldPosition;
  }

  setContext(round: RoundHintContext | null, player: ItemDisplayContext | null = null): void {
    this.tooltipRound = round;
    this.tooltipPlayer = player;
  }

  setSuppressTooltip(suppress: boolean): void {
    this.suppressTooltip = suppress;
    if (suppress) this.hide();
  }

  setInteractionTooltipSuppressed(suppressed: boolean): void {
    this.interactionTooltipSuppressed = suppressed;
    if (suppressed) this.hide();
  }

  setFaceDown(faceDown: boolean): void {
    this.faceDown = faceDown;
    if (faceDown) this.hide();
  }

  show(resolveDisplay: (round: RoundHintContext | null, player: ItemDisplayContext) => ItemDisplayResult): void {
    if (this.suppressTooltip || this.interactionTooltipSuppressed || this.faceDown) return;
    if (this.tooltip) return;

    const player = this.tooltipPlayer ?? getItemDisplayContext();
    const { x: worldX, y: worldY } = this.getWorldPosition();
    const display = resolveDisplay(this.tooltipRound, player);
    const lines = buildTooltipLines(display.tooltip, this.def, this.getEquipment());

    this.tooltip = this.scene.add.container(0, 0).setDepth(1000);

    const title = createTooltipTitle(this.scene, this.def.name, getTooltipTitleColor(this.def.rarity));
    let contentLayout = createTooltipLayout(title);
    for (const line of lines) {
      contentLayout = appendTooltipLine(this.scene, contentLayout, line);
    }

    const { width: tooltipW, height: tooltipH } = getTooltipDimensions(contentLayout);
    const bg = createTooltipBackground(this.scene, tooltipW, tooltipH);
    const { x, y } = computeTooltipPosition(worldX, worldY, this.layout, tooltipW, tooltipH, this.scene.scale);

    this.tooltip.add([bg, ...contentLayout.children]);
    this.tooltip.setPosition(x, y);
  }

  hide(): void {
    if (this.tooltip) {
      this.tooltip.destroy();
      this.tooltip = null;
    }
  }

  destroy(): void {
    this.hide();
  }
}
