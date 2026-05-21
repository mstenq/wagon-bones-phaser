// ─── DifficultyTooltip ───
// Hover tooltip for difficulty stake info (title, description, cumulative effects).

import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS } from '../../game/Constants';
import type { DifficultyDef } from '../../game/types';

export interface DifficultyTooltipClampBounds {
  minX: number;
  maxX: number;
  minY: number;
}

export class DifficultyTooltip {
  private container: GameObjects.Container | null = null;

  show(
    scene: Scene,
    def: DifficultyDef,
    anchorX: number,
    anchorY: number,
    clamp?: DifficultyTooltipClampBounds,
    depth = 400,
    parent?: GameObjects.Container,
  ): void {
    this.hide();

    const pad = 10;
    const maxW = 240;

    const title = scene.add.text(0, pad, `${def.level}. ${def.name}`, {
      fontFamily: FONTS.HEADING,
      fontSize: '14px',
      color: TEXT_COLORS.GOLD,
      wordWrap: { width: maxW - pad * 2 },
    });

    const desc = scene.add.text(0, pad + title.height + 6, def.description, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '12px',
      color: TEXT_COLORS.SECONDARY,
      wordWrap: { width: maxW - pad * 2 },
      lineSpacing: 2,
    });

    let y = pad + title.height + 6 + desc.height + 8;
    const effectLines: GameObjects.Text[] = [];

    if (def.effects.length === 0) {
      const line = scene.add.text(pad, y, 'No extra penalties', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '12px',
        color: TEXT_COLORS.DISABLED,
        wordWrap: { width: maxW - pad * 2 },
      });
      effectLines.push(line);
      y += line.height + 3;
    } else {
      def.effects.forEach((effect, i) => {
        const isNew = i === def.effects.length - 1;
        const line = scene.add.text(pad, y, `• ${effect}`, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '12px',
          color: isNew ? TEXT_COLORS.PRIMARY : TEXT_COLORS.DISABLED,
          wordWrap: { width: maxW - pad * 2 },
          lineSpacing: 1,
        });
        effectLines.push(line);
        y += line.height + 3;
      });
    }

    const tooltipW = Math.max(title.width + pad * 2, maxW, ...effectLines.map((l) => l.width + pad * 2));
    const tooltipH = y + pad;

    const bg = scene.add.graphics();
    bg.fillStyle(COLORS.TOOLTIP_BG, 0.97);
    bg.fillRoundedRect(0, 0, tooltipW, tooltipH, 6);
    bg.lineStyle(1, COLORS.TOOLTIP_BORDER, 0.8);
    bg.strokeRoundedRect(0, 0, tooltipW, tooltipH, 6);

    title.setPosition(pad, pad);
    desc.setPosition(pad, pad + title.height + 6);

    let tipX = anchorX - tooltipW / 2;
    let tipY = anchorY + 12;

    if (clamp) {
      tipX = Math.min(clamp.maxX - tooltipW, Math.max(clamp.minX, tipX));
      tipY = Math.max(clamp.minY, tipY);
    }

    this.container = scene.add.container(tipX, tipY, [bg, title, desc, ...effectLines]).setDepth(depth);
    if (parent) {
      parent.add(this.container);
    }
  }

  hide(): void {
    if (this.container) {
      this.container.destroy();
      this.container = null;
    }
  }
}
