// ─── CornerBadge ───
// Small count pill for top-right corners (buttons, tag stack badges, etc.).

import { GameObjects, Scene } from 'phaser';
import { COLORS, FONTS, UI } from '../../game/Constants';
import { darkenFaceColor } from './buttonTheme';

const DEFAULT_FONT_SIZE = 14;
const DEFAULT_PAD_X = 6;
const DEFAULT_PAD_Y = 2;
const DEFAULT_MIN = 16;

/** Shared count-pill metrics for buttons and trail-tag badges. */
export const CORNER_COUNT_BADGE_LAYOUT = { fontSize: 12, padX: 4, padY: 2, minSize: 16 } as const;

export interface CornerBadgeLayout {
  fontSize?: number;
  padX?: number;
  padY?: number;
  minSize?: number;
}

export interface CornerBadgeParts {
  container: GameObjects.Container;
  bg: GameObjects.Graphics;
  label: GameObjects.Text;
}

export function createCornerBadge(scene: Scene, layout?: CornerBadgeLayout): CornerBadgeParts {
  const fontSize = layout?.fontSize ?? DEFAULT_FONT_SIZE;
  const bg = scene.add.graphics();
  const label = scene.add
    .text(0, 0, '', {
      fontFamily: FONTS.TITLE,
      fontSize: `${fontSize}px`,
      color: '#ffffff',
      fontStyle: 'normal',
    })
    .setOrigin(0.5);
  const container = scene.add.container(0, 0, [bg, label]);
  return { container, bg, label };
}

/** Inset from the bounding-box corner toward the face center (rounded rects sit inside the box). */
const CORNER_BADGE_NUDGE = 2;

/** Center-anchored face coords; badge center straddles the top-right corner (~50% inside / 50% outside). */
export function cornerBadgePosition(faceWidth: number, faceHeight: number): { x: number; y: number } {
  return {
    x: faceWidth / 2 - CORNER_BADGE_NUDGE,
    y: -faceHeight / 2 + CORNER_BADGE_NUDGE,
  };
}

export function layoutCornerBadge(
  parts: CornerBadgeParts,
  value: number,
  faceWidth: number,
  faceHeight: number,
  bgColor: number = COLORS.ERROR_RED,
  layout?: CornerBadgeLayout,
): void {
  const fontSize = layout?.fontSize ?? DEFAULT_FONT_SIZE;
  const padX = layout?.padX ?? DEFAULT_PAD_X;
  const padY = layout?.padY ?? DEFAULT_PAD_Y;
  const minSize = layout?.minSize ?? DEFAULT_MIN;

  parts.label.setFontSize(fontSize);
  parts.label.setText(String(value));
  const badgeW = Math.max(minSize, parts.label.width + padX * 2);
  const badgeH = Math.max(minSize, parts.label.height + padY * 2);

  const { x, y } = cornerBadgePosition(faceWidth, faceHeight);
  parts.container.setPosition(x, y);

  const edgeColor = darkenFaceColor(bgColor, UI.BTN_EDGE_DARKEN);
  parts.bg.clear();
  parts.bg.fillStyle(bgColor, 1);
  parts.bg.fillRoundedRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, badgeH / 2);
  parts.bg.lineStyle(UI.BTN_EDGE_WIDTH, edgeColor, 1);
  parts.bg.strokeRoundedRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, badgeH / 2);

  parts.container.setVisible(true);
  parts.container.setAlpha(1);
}
