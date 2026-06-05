// ─── ItemCard hover tooltip ───

import { GameObjects, Scene } from 'phaser';
import { COLORS, UI } from '../../../game/Constants';
import type { EquipmentInstance } from '../../../game/ItemsSystem';
import type { ItemDisplayResult } from '../../../game/ItemsSystem';
import { getModifierTooltipLines } from '../../../game/EquipmentModifierDisplay';
import { getItemDisplayContext, type RoundHintContext, type ItemDisplayContext } from '../../../game/displayContext';
import type { CardData, ItemCardLayout } from './itemCardTypes';
import { RARITY_LABELS, RARITY_LABEL_COLORS } from './itemCardTypes';
import { getTooltipMetrics, tooltipSegmentColors } from './itemCardHintStyles';

const TOOLTIP_PAD = UI.CARD_TOOLTIP_PAD;
const TOOLTIP_BG = COLORS.TOOLTIP_BG;
const TOOLTIP_BORDER = COLORS.TOOLTIP_BORDER;

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

    this.tooltip = this.scene.add.container(0, 0).setDepth(1000);
    const tooltipRows = resolveDisplay(this.tooltipRound, player).tooltip;

    const rarityLabel = this.def.rarity ? (RARITY_LABELS[this.def.rarity] ?? this.def.rarity) : null;

    const nameText = this.scene.add
      .text(TOOLTIP_PAD, TOOLTIP_PAD, this.def.name, {
        fontFamily: 'Arial',
        fontSize: `${UI.CARD_TOOLTIP_TITLE_FONT_SIZE}px`,
        color: (this.def.rarity && RARITY_LABEL_COLORS[this.def.rarity]) || '#ffffff',
        fontStyle: 'bold',
      })
      .setOrigin(0, 0);

    let bottomY = TOOLTIP_PAD + nameText.height + 6;
    const tooltipChildren: GameObjects.GameObject[] = [nameText];
    let contentWidth = nameText.width;

    const segGap = 4;
    const chipRadius = 3;
    for (const row of tooltipRows) {
      if (!row || row.length === 0) {
        bottomY += 4;
        continue;
      }

      const measurements: Array<{
        fontSize: number;
        padX: number;
        w: number;
        h: number;
        hasBg: boolean;
      }> = [];
      let rowWidth = 0;
      let rowHeight = 0;
      for (const seg of row) {
        const metrics = getTooltipMetrics(seg);
        const colors = tooltipSegmentColors(seg.style);
        const hasBg = colors.bg !== undefined;
        const tmpText = this.scene.add.text(0, 0, seg.text, {
          fontFamily: 'Arial',
          fontSize: `${metrics.fontSize}px`,
        });
        const tw = tmpText.width;
        const th = tmpText.height;
        tmpText.destroy();
        const w = hasBg ? tw + metrics.padX * 2 : tw;
        const h = hasBg ? th + metrics.padY * 2 : th;
        measurements.push({ ...metrics, w, h, hasBg });
        rowWidth += w;
        rowHeight = Math.max(rowHeight, h);
      }
      rowWidth += segGap * Math.max(0, row.length - 1);
      contentWidth = Math.max(contentWidth, rowWidth);

      const rowY = bottomY + rowHeight / 2;
      let curX = TOOLTIP_PAD;
      for (let i = 0; i < row.length; i++) {
        const seg = row[i];
        const colors = tooltipSegmentColors(seg.style);
        const measurement = measurements[i];
        if (measurement.hasBg) {
          const chipG = this.scene.add.graphics();
          chipG.fillStyle(colors.bg!, 0.9);
          chipG.fillRoundedRect(curX, rowY - measurement.h / 2, measurement.w, measurement.h, chipRadius);
          tooltipChildren.push(chipG);
        }

        const segText = this.scene.add
          .text(curX + (measurement.hasBg ? measurement.padX : 0), rowY, seg.text, {
            fontFamily: 'Arial',
            fontSize: `${measurement.fontSize}px`,
            color: colors.text,
          })
          .setOrigin(0, 0.5);
        tooltipChildren.push(segText);
        curX += measurement.w + segGap;
      }
      bottomY += rowHeight + 5;
    }

    if (rarityLabel) {
      const rarityText = this.scene.add
        .text(TOOLTIP_PAD, bottomY + 8, rarityLabel, {
          fontFamily: 'Arial',
          fontSize: `${UI.CARD_TOOLTIP_META_FONT_SIZE}px`,
          color: (this.def.rarity && RARITY_LABEL_COLORS[this.def.rarity]) || '#888888',
        })
        .setOrigin(0, 0);
      bottomY = bottomY + 8 + rarityText.height;
      tooltipChildren.push(rarityText);
      contentWidth = Math.max(contentWidth, rarityText.width);
    }

    const aura = this.def.aura;
    if (aura) {
      const auraText = this.scene.add
        .text(TOOLTIP_PAD, bottomY + 6, `✦ ${aura.name}: ${aura.description}`, {
          fontFamily: 'Arial',
          fontSize: `${UI.CARD_TOOLTIP_META_FONT_SIZE}px`,
          color: '#ddaa44',
          fontStyle: 'bold',
        })
        .setOrigin(0, 0);
      bottomY = bottomY + 6 + auraText.height;
      tooltipChildren.push(auraText);
      contentWidth = Math.max(contentWidth, auraText.width);
    }

    const equipment = this.getEquipment();
    if (equipment) {
      const modLines = getModifierTooltipLines(equipment);
      for (const line of modLines) {
        const modText = this.scene.add
          .text(TOOLTIP_PAD, bottomY + 6, line.text, {
            fontFamily: 'Arial',
            fontSize: `${UI.CARD_TOOLTIP_META_FONT_SIZE}px`,
            color: line.color,
            fontStyle: 'bold',
          })
          .setOrigin(0, 0);
        bottomY = bottomY + 6 + modText.height;
        tooltipChildren.push(modText);
        contentWidth = Math.max(contentWidth, modText.width);
      }
    }

    const tooltipW = contentWidth + TOOLTIP_PAD * 2;
    const tooltipH = bottomY + TOOLTIP_PAD;

    const bg = this.scene.add.graphics();
    bg.fillStyle(TOOLTIP_BG, 0.95);
    bg.fillRoundedRect(0, 0, tooltipW, tooltipH, 8);
    bg.lineStyle(1, TOOLTIP_BORDER, 0.8);
    bg.strokeRoundedRect(0, 0, tooltipW, tooltipH, 8);
    this.tooltip.add([bg, ...tooltipChildren]);

    const hw = this.layout.cardW / 2;
    let tx = worldX - hw - tooltipW - 10;
    let ty = worldY - tooltipH / 2;

    const { width: sw, height: sh } = this.scene.scale;
    if (tx < 8) {
      tx = worldX + hw + 10;
    }
    if (tx + tooltipW > sw - 8) tx = sw - 8 - tooltipW;
    if (ty < 8) ty = 8;
    if (ty + tooltipH > sh - 8) ty = sh - 8 - tooltipH;

    this.tooltip.setPosition(tx, ty);
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
