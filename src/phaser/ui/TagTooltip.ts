// ─── TagTooltip ───
// Floating tooltip for trail tag name + description.

import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import type { TrailTagDef } from '../../game/types';

export interface TagTooltipClampBounds {
  minX: number;
  maxX: number;
  minY: number;
}

export class TagTooltip {
  private container: GameObjects.Container | null = null;

  show(
    scene: Scene,
    tag: TrailTagDef,
    anchorX: number,
    anchorY: number,
    clamp?: TagTooltipClampBounds,
    depth = 400,
  ): void {
    this.hide();

    const pad = UI.CARD_TOOLTIP_PAD;
    const maxW = 220;

    const title = scene.add.text(0, pad, tag.name, {
      fontFamily: FONTS.HEADING,
      fontSize: '14px',
      color: TEXT_COLORS.PRIMARY,
      wordWrap: { width: maxW - pad * 2 },
    });

    const body = scene.add.text(0, pad + title.height + 6, tag.description, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '11px',
      color: '#c8c8c8',
      wordWrap: { width: maxW - pad * 2 },
    });

    const tooltipW = Math.max(title.width, body.width) + pad * 2;
    const tooltipH = pad + title.height + 6 + body.height + pad;

    const bg = scene.add.graphics();
    bg.fillStyle(COLORS.TOOLTIP_BG, 0.97);
    bg.fillRoundedRect(0, 0, tooltipW, tooltipH, 6);
    bg.lineStyle(1, COLORS.TOOLTIP_BORDER, 0.8);
    bg.strokeRoundedRect(0, 0, tooltipW, tooltipH, 6);

    title.setPosition(pad, pad);
    body.setPosition(pad, pad + title.height + 6);

    let tipX = anchorX - tooltipW / 2;
    let tipY = anchorY - tooltipH - 10;

    if (clamp) {
      tipX = Math.min(clamp.maxX - tooltipW, Math.max(clamp.minX, tipX));
      tipY = Math.max(clamp.minY, tipY);
    }

    this.container = scene.add.container(tipX, tipY, [bg, title, body]).setDepth(depth);
  }

  hide(): void {
    if (this.container) {
      this.container.destroy();
      this.container = null;
    }
  }
}
