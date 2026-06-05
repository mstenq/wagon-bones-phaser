// ─── ItemCard on-card hint rows ───

import { GameObjects, Scene } from 'phaser';
import type { ItemDisplayResult } from '../../../game/ItemsSystem';
import type { RoundHintContext, ItemDisplayContext } from '../../../game/displayContext';
import type { CardData, ItemCardLayout } from './itemCardTypes';
import { getAuraHintRow, getHintMetrics, HINT_COLORS } from './itemCardHintStyles';

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
    const rowGap = Math.round(8 * scale);
    const startY = this.layout.cardH / 2 + Math.round(12 * scale);
    const segGap = Math.round(3 * scale);
    let currentY = startY;

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || row.length === 0) continue;

      let totalW = 0;
      let rowHeight = 0;
      const measurements: Array<{ fontSize: number; padX: number; w: number; h: number }> = [];
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
        measurements.push({ fontSize: metrics.fontSize, padX: metrics.padX, w: segW, h: segH });
        totalW += segW;
        rowHeight = Math.max(rowHeight, segH);
      }
      totalW += segGap * (row.length - 1);
      const rowY = currentY + rowHeight / 2;

      let curX = -totalW / 2;
      for (let i = 0; i < row.length; i++) {
        const seg = row[i];
        const colors = HINT_COLORS[seg.style] ?? HINT_COLORS.text;
        const { w: segW, h: segH, fontSize, padX } = measurements[i];
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
