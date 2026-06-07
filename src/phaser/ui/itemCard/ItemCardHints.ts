// ─── ItemCard on-card hint rows ───

import { GameObjects, Scene } from 'phaser';
import { UI } from '../../../game/Constants';
import type { HintSegment } from '../../../game/ItemsSystem';
import type { ItemDisplayResult } from '../../../game/ItemsSystem';
import type { RoundHintContext, ItemDisplayContext } from '../../../game/displayContext';
import type { CardData, ItemCardLayout } from './itemCardTypes';
import { getAuraHintRow, getHintMetrics, HINT_COLORS } from './itemCardHintStyles';

interface RowMeasurement {
  row: HintSegment[];
  totalW: number;
  rowHeight: number;
  segments: Array<{ fontSize: number; padX: number; w: number; h: number }>;
}

export class ItemCardHints {
  private readonly scene: Scene;
  private readonly card: GameObjects.Container;
  private readonly layout: ItemCardLayout;
  private readonly def: CardData;
  private hintObjects: GameObjects.GameObject[] = [];
  private suppressHints = false;

  constructor(scene: Scene, card: GameObjects.Container, layout: ItemCardLayout, def: CardData) {
    this.scene = scene;
    this.card = card;
    this.layout = layout;
    this.def = def;
  }

  setSuppressHints(suppress: boolean): void {
    this.suppressHints = suppress;
    if (suppress) this.clear();
  }

  clear(): void {
    for (const obj of this.hintObjects) obj.destroy();
    this.hintObjects = [];
  }

  private measureRow(row: HintSegment[], scale: number, segGap: number): RowMeasurement | null {
    if (!row || row.length === 0) return null;

    let totalW = 0;
    let rowHeight = 0;
    const segments: RowMeasurement['segments'] = [];
    for (const seg of row) {
      const metrics = getHintMetrics(seg, scale);
      const hasBg = HINT_COLORS[seg.style]?.bg !== undefined;
      const tmpText = this.scene.add.text(0, 0, seg.text, {
        fontFamily: 'sans-serif',
        fontSize: `${metrics.fontSize}px`,
      });
      const tw = tmpText.width;
      const th = tmpText.height;
      tmpText.destroy();
      const segW = hasBg ? tw + metrics.padX * 2 : tw;
      const segH = hasBg ? th + metrics.padY * 2 : th;
      segments.push({ fontSize: metrics.fontSize, padX: metrics.padX, w: segW, h: segH });
      totalW += segW;
      rowHeight = Math.max(rowHeight, segH);
    }
    totalW += segGap * (row.length - 1);
    return { row, totalW, rowHeight, segments };
  }

  /** Render or update the hint rows below the card */
  update(
    round: RoundHintContext | null,
    player: ItemDisplayContext,
    resolveDisplay: (round: RoundHintContext | null, player: ItemDisplayContext) => ItemDisplayResult,
  ): void {
    if (!this.scene) return;
    if (this.suppressHints) return;
    if (!this.def.aura && resolveDisplay(round, player).hint.length === 0) return;

    const baseRows = resolveDisplay(round, player).hint;
    const auraRow = getAuraHintRow(this.def.aura?.id);
    const rows = [...(baseRows || [])];
    if (auraRow) rows.push(auraRow);
    if (rows.length === 0) return;

    this.clear();

    const scale = this.layout.cardScale;
    const chipRadius = 3 * scale;
    const rowGap = Math.round(UI.CARD_HINT_ROW_GAP * scale);
    const pad = Math.round(UI.CARD_HINT_BG_PAD * scale);
    const bgRadius = Math.round(UI.CARD_HINT_BG_RADIUS * scale);
    const segGap = Math.round(3 * scale);

    const measuredRows: RowMeasurement[] = [];
    for (const row of rows) {
      const measured = this.measureRow(row, scale, segGap);
      if (measured) measuredRows.push(measured);
    }
    if (measuredRows.length === 0) return;

    let maxRowWidth = 0;
    let totalContentHeight = 0;
    for (let i = 0; i < measuredRows.length; i++) {
      maxRowWidth = Math.max(maxRowWidth, measuredRows[i].totalW);
      totalContentHeight += measuredRows[i].rowHeight;
      if (i < measuredRows.length - 1) totalContentHeight += rowGap;
    }

    const blockW = maxRowWidth + pad * 2;
    const blockH = totalContentHeight + pad * 2;
    const cardBottom = this.layout.cardH / 2;
    const rowCount = measuredRows.length;
    let blockTopY: number;
    if (rowCount === 1) {
      blockTopY = cardBottom + Math.round(UI.CARD_HINT_SINGLE_LINE_GAP * scale);
    } else {
      const aboveRatio = rowCount === 2 ? UI.CARD_HINT_TWO_ROW_ABOVE_RATIO : UI.CARD_HINT_THREE_ROW_ABOVE_RATIO;
      blockTopY = cardBottom - blockH * aboveRatio;
    }

    const panelBg = this.scene.add.graphics();
    panelBg.fillStyle(UI.CARD_HINT_BG_COLOR, UI.CARD_HINT_BG_ALPHA);
    panelBg.fillRoundedRect(-blockW / 2, blockTopY, blockW, blockH, bgRadius);
    this.card.add(panelBg);
    this.hintObjects.push(panelBg);

    let currentY = blockTopY + pad;
    for (let r = 0; r < measuredRows.length; r++) {
      const { row, totalW, rowHeight, segments } = measuredRows[r];
      const rowY = currentY + rowHeight / 2;

      let curX = -totalW / 2;
      for (let i = 0; i < row.length; i++) {
        const seg = row[i];
        const colors = HINT_COLORS[seg.style] ?? HINT_COLORS.text;
        const { w: segW, h: segH, fontSize, padX } = segments[i];
        const hasBg = colors.bg !== undefined;

        if (hasBg) {
          const chipG = this.scene.add.graphics();
          chipG.fillStyle(colors.bg!, 0.9);
          chipG.fillRoundedRect(curX, rowY - segH / 2, segW, segH, chipRadius);
          this.card.add(chipG);
          this.hintObjects.push(chipG);
        }

        const segText = this.scene.add
          .text(curX + (hasBg ? padX : segW / 2), rowY, seg.text, {
            fontFamily: 'sans-serif',
            fontSize: `${fontSize}px`,
            color: colors.text,
          })
          .setOrigin(hasBg ? 0 : 0.5, 0.5);
        this.card.add(segText);
        this.hintObjects.push(segText);

        curX += segW + segGap;
      }
      currentY += rowHeight + rowGap;
    }
  }

  destroy(): void {
    this.clear();
  }
}
