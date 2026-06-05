// ─── ItemCard tooltip layout and rendering helpers ───

import { GameObjects, Scene } from 'phaser';
import { COLORS, UI } from '../../../game/Constants';
import type { EquipmentInstance, HintSegment } from '../../../game/ItemsSystem';
import { getModifierTooltipLines } from '../../../game/EquipmentModifierDisplay';
import type { CardData, ItemCardLayout } from './itemCardTypes';
import { RARITY_LABELS, RARITY_LABEL_COLORS } from './itemCardTypes';
import { getTooltipMetrics, tooltipSegmentColors } from './itemCardHintStyles';

const TOOLTIP_PAD = UI.CARD_TOOLTIP_PAD;
const TOOLTIP_BG = COLORS.TOOLTIP_BG;
const TOOLTIP_BORDER = COLORS.TOOLTIP_BORDER;
const SEG_GAP = 4;
const CHIP_RADIUS = 3;

export type TooltipLine =
  | { kind: 'segments'; row: HintSegment[] }
  | { kind: 'text'; text: string; color: string; fontStyle?: string; gapTop: number }
  | { kind: 'spacer'; height: number };

export interface SegmentMeasurement {
  fontSize: number;
  padX: number;
  padY: number;
  w: number;
  h: number;
  hasBg: boolean;
}

export interface TooltipLayout {
  bottomY: number;
  contentWidth: number;
  children: GameObjects.GameObject[];
}

export function buildTooltipLines(
  tooltipRows: HintSegment[][],
  def: CardData,
  equipment: EquipmentInstance | null,
): TooltipLine[] {
  const lines: TooltipLine[] = [];

  for (const row of tooltipRows) {
    if (!row || row.length === 0) {
      lines.push({ kind: 'spacer', height: 4 });
    } else {
      lines.push({ kind: 'segments', row });
    }
  }

  const rarityLabel = def.rarity ? (RARITY_LABELS[def.rarity] ?? def.rarity) : null;
  if (rarityLabel) {
    lines.push({
      kind: 'text',
      text: rarityLabel,
      color: (def.rarity && RARITY_LABEL_COLORS[def.rarity]) || '#888888',
      gapTop: 8,
    });
  }

  const aura = def.aura;
  if (aura) {
    lines.push({
      kind: 'text',
      text: `✦ ${aura.name}: ${aura.description}`,
      color: '#ddaa44',
      fontStyle: 'bold',
      gapTop: 6,
    });
  }

  if (equipment) {
    for (const line of getModifierTooltipLines(equipment)) {
      lines.push({
        kind: 'text',
        text: line.text,
        color: line.color,
        fontStyle: 'bold',
        gapTop: 6,
      });
    }
  }

  return lines;
}

export function getTooltipTitleColor(rarity: string | undefined): string {
  return (rarity && RARITY_LABEL_COLORS[rarity]) || '#ffffff';
}

export function createTooltipTitle(scene: Scene, name: string, color: string): GameObjects.Text {
  return scene.add
    .text(TOOLTIP_PAD, TOOLTIP_PAD, name, {
      fontFamily: 'Arial',
      fontSize: `${UI.CARD_TOOLTIP_TITLE_FONT_SIZE}px`,
      color,
      fontStyle: 'bold',
    })
    .setOrigin(0, 0);
}

export function createTooltipLayout(title: GameObjects.Text): TooltipLayout {
  return {
    bottomY: TOOLTIP_PAD + title.height + 6,
    contentWidth: title.width,
    children: [title],
  };
}

export function measureSegmentRow(
  scene: Scene,
  row: HintSegment[],
): { measurements: SegmentMeasurement[]; rowWidth: number; rowHeight: number } {
  const measurements: SegmentMeasurement[] = [];
  let rowWidth = 0;
  let rowHeight = 0;

  for (const seg of row) {
    const metrics = getTooltipMetrics(seg);
    const colors = tooltipSegmentColors(seg.style);
    const hasBg = colors.bg !== undefined;
    const tmpText = scene.add.text(0, 0, seg.text, {
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

  rowWidth += SEG_GAP * Math.max(0, row.length - 1);
  return { measurements, rowWidth, rowHeight };
}

export function renderSegmentRow(
  scene: Scene,
  row: HintSegment[],
  measurements: SegmentMeasurement[],
  bottomY: number,
): GameObjects.GameObject[] {
  const rowHeight = measurements.reduce((max, m) => Math.max(max, m.h), 0);
  const rowY = bottomY + rowHeight / 2;
  let curX = TOOLTIP_PAD;
  const children: GameObjects.GameObject[] = [];

  for (let i = 0; i < row.length; i++) {
    const seg = row[i];
    const colors = tooltipSegmentColors(seg.style);
    const measurement = measurements[i];
    if (measurement.hasBg) {
      const chipG = scene.add.graphics();
      chipG.fillStyle(colors.bg!, 0.9);
      chipG.fillRoundedRect(curX, rowY - measurement.h / 2, measurement.w, measurement.h, CHIP_RADIUS);
      children.push(chipG);
    }

    const segText = scene.add
      .text(curX + (measurement.hasBg ? measurement.padX : 0), rowY, seg.text, {
        fontFamily: 'Arial',
        fontSize: `${measurement.fontSize}px`,
        color: colors.text,
      })
      .setOrigin(0, 0.5);
    children.push(segText);
    curX += measurement.w + SEG_GAP;
  }

  return children;
}

export function appendSpacer(layout: TooltipLayout, height: number): TooltipLayout {
  return { ...layout, bottomY: layout.bottomY + height };
}

export function appendSegmentRow(scene: Scene, layout: TooltipLayout, row: HintSegment[]): TooltipLayout {
  const { measurements, rowWidth, rowHeight } = measureSegmentRow(scene, row);
  const children = renderSegmentRow(scene, row, measurements, layout.bottomY);
  return {
    bottomY: layout.bottomY + rowHeight + 5,
    contentWidth: Math.max(layout.contentWidth, rowWidth),
    children: [...layout.children, ...children],
  };
}

export function appendTextLine(
  scene: Scene,
  layout: TooltipLayout,
  line: Extract<TooltipLine, { kind: 'text' }>,
): TooltipLayout {
  const y = layout.bottomY + line.gapTop;
  const text = scene.add
    .text(TOOLTIP_PAD, y, line.text, {
      fontFamily: 'Arial',
      fontSize: `${UI.CARD_TOOLTIP_META_FONT_SIZE}px`,
      color: line.color,
      fontStyle: line.fontStyle,
    })
    .setOrigin(0, 0);
  return {
    bottomY: y + text.height,
    contentWidth: Math.max(layout.contentWidth, text.width),
    children: [...layout.children, text],
  };
}

export function appendTooltipLine(scene: Scene, layout: TooltipLayout, line: TooltipLine): TooltipLayout {
  if (line.kind === 'spacer') return appendSpacer(layout, line.height);
  if (line.kind === 'segments') return appendSegmentRow(scene, layout, line.row);
  return appendTextLine(scene, layout, line);
}

export function createTooltipBackground(scene: Scene, width: number, height: number): GameObjects.Graphics {
  const bg = scene.add.graphics();
  bg.fillStyle(TOOLTIP_BG, 0.95);
  bg.fillRoundedRect(0, 0, width, height, 8);
  bg.lineStyle(1, TOOLTIP_BORDER, 0.8);
  bg.strokeRoundedRect(0, 0, width, height, 8);
  return bg;
}

export function computeTooltipPosition(
  worldX: number,
  worldY: number,
  layout: ItemCardLayout,
  tooltipW: number,
  tooltipH: number,
  scale: Phaser.Scale.ScaleManager,
): { x: number; y: number } {
  const hw = layout.cardW / 2;
  let tx = worldX - hw - tooltipW - 10;
  let ty = worldY - tooltipH / 2;

  const { width: sw, height: sh } = scale;
  if (tx < 8) {
    tx = worldX + hw + 10;
  }
  if (tx + tooltipW > sw - 8) tx = sw - 8 - tooltipW;
  if (ty < 8) ty = 8;
  if (ty + tooltipH > sh - 8) ty = sh - 8 - tooltipH;

  return { x: tx, y: ty };
}

export function getTooltipDimensions(layout: TooltipLayout): { width: number; height: number } {
  return {
    width: layout.contentWidth + TOOLTIP_PAD * 2,
    height: layout.bottomY + TOOLTIP_PAD,
  };
}
