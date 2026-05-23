// ─── ProfessionStartingDiceTooltip ───
// Hover tooltip with grouped dice previews (same grouping as Dice Pouch).

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, GAMEPLAY, UI } from '../../game/Constants';
import type { ProfessionDef } from '../../data/professions';
import { createDie } from '../../game/DiceSystem';
import { DiceSprite } from './DiceSprite';
import { getDiceGroupDisplayLabel, groupDiceByVisualIdentity } from './diceGrouping';

const PREVIEW_SCALE = 0.72;
const GROUP_SPACING = 94;
const ROW_HEIGHT = 88;
const GRID_SIDE_PAD = 22;
const PAD = 16;
const HIDE_DELAY_MS = 120;

export interface TooltipAnchor {
  x: number;
  y: number;
  /** Place tooltip below anchor (e.g. top row cards); otherwise above. */
  placement?: 'above' | 'below';
}

export interface TooltipClampBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export class ProfessionStartingDiceTooltip {
  private container: GameObjects.Container | null = null;
  private sprites: DiceSprite[] = [];
  private hideTimer: Phaser.Time.TimerEvent | null = null;
  private activeProfId: string | null = null;
  private scene: Scene | null = null;

  show(scene: Scene, prof: ProfessionDef, anchor: TooltipAnchor, clamp: TooltipClampBounds, depth = 160): void {
    this.cancelHideTimer();
    this.scene = scene;
    if (this.activeProfId === prof.id && this.container) return;

    this.hide();

    const specialtyCount = prof.startingDice.length;
    const standardCount = Math.max(0, GAMEPLAY.STARTING_DICE - specialtyCount);

    const previewDice = prof.startingDice.map((enhancement, i) =>
      createDie({
        id: `prof_preview_${prof.id}_${i}`,
        enhancement,
        value: enhancement === 'stone' ? 0 : 6,
      }),
    );

    const specialtyGroups = groupDiceByVisualIdentity(previewDice);
    const displayGroups: { representative: (typeof previewDice)[0]; count: number; isStandard: boolean }[] =
      specialtyGroups.map((g) => ({
        representative: g.representative,
        count: g.dice.length,
        isStandard: false,
      }));

    if (standardCount > 0) {
      displayGroups.push({
        representative: createDie({
          id: `prof_preview_${prof.id}_standard`,
          enhancement: null,
          value: 6,
        }),
        count: standardCount,
        isStandard: true,
      });
    }

    const cols = Math.min(displayGroups.length, 5);
    const rows = Math.ceil(displayGroups.length / cols);
    const gridW = (cols - 1) * GROUP_SPACING + 52;
    const gridH = rows * ROW_HEIGHT + 8;

    const title = scene.add.text(0, PAD, 'Starting Dice', {
      fontFamily: FONTS.HEADING,
      fontSize: '15px',
      color: TEXT_COLORS.GOLD,
    });

    const summary =
      standardCount > 0
        ? `${specialtyCount} specialty · ${standardCount} standard (${GAMEPLAY.STARTING_DICE} total)`
        : `${specialtyCount} dice (${GAMEPLAY.STARTING_DICE} total)`;

    const subtitle = scene.add.text(0, PAD + title.height + 4, summary, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '11px',
      color: TEXT_COLORS.MUTED,
    });

    const diceRowY = PAD + title.height + subtitle.height + 18;
    const panelW = Math.max(220, gridW + GRID_SIDE_PAD * 2);
    const panelH = diceRowY + gridH;

    const bg = scene.add.graphics();
    bg.fillStyle(UI.MODAL_BG, 0.98);
    bg.fillRoundedRect(0, 0, panelW, panelH, 8);
    bg.lineStyle(2, COLORS.GOLD, 0.85);
    bg.strokeRoundedRect(0, 0, panelW, panelH, 8);

    title.setPosition(PAD, PAD);
    subtitle.setPosition(PAD, PAD + title.height + 4);

    const gridStartX = panelW / 2 - ((cols - 1) * GROUP_SPACING) / 2;

    DiceSprite.suppressTooltips = true;
    const diceContainer = scene.add.container(0, 0);

    for (let i = 0; i < displayGroups.length; i++) {
      const group = displayGroups[i];
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = gridStartX + col * GROUP_SPACING;
      const y = diceRowY + row * ROW_HEIGHT + 22;

      const sprite = new DiceSprite(scene, x, y, group.representative);
      sprite.setScale(PREVIEW_SCALE);
      diceContainer.add(sprite);
      this.sprites.push(sprite);

      const label = scene.add
        .text(x, y + 34, getDiceGroupDisplayLabel(group.representative, group.count), {
          fontFamily: FONTS.PRIMARY,
          fontSize: '11px',
          color: group.isStandard ? TEXT_COLORS.MUTED : TEXT_COLORS.SECONDARY,
        })
        .setOrigin(0.5);
      diceContainer.add(label);
    }

    let panelX = anchor.x - panelW / 2;
    const placeBelow = anchor.placement === 'below';
    let panelY = placeBelow ? anchor.y + 8 : anchor.y - panelH - 8;

    if (placeBelow && panelY + panelH > clamp.maxY) {
      panelY = anchor.y - panelH - 8;
    } else if (!placeBelow && panelY < clamp.minY) {
      panelY = anchor.y + 8;
    }
    panelX = Phaser.Math.Clamp(panelX, clamp.minX, clamp.maxX - panelW);
    panelY = Phaser.Math.Clamp(panelY, clamp.minY, clamp.maxY - panelH);

    this.container = scene.add.container(panelX, panelY, [bg, title, subtitle, diceContainer]).setDepth(depth);

    bg.setInteractive(new Phaser.Geom.Rectangle(0, 0, panelW, panelH), Phaser.Geom.Rectangle.Contains);
    bg.on('pointerover', () => this.cancelHideTimer());
    bg.on('pointerout', () => this.scheduleHide(scene));

    this.activeProfId = prof.id;
  }

  scheduleHide(scene?: Scene): void {
    this.cancelHideTimer();
    if (!scene) {
      this.hide();
      return;
    }
    this.hideTimer = scene.time.delayedCall(HIDE_DELAY_MS, () => this.hide());
  }

  cancelHideTimer(): void {
    if (this.hideTimer) {
      this.hideTimer.remove(false);
      this.hideTimer = null;
    }
  }

  hide(): void {
    this.cancelHideTimer();
    this.activeProfId = null;
    this.scene = null;

    for (const s of this.sprites) s.destroy();
    this.sprites = [];
    DiceSprite.suppressTooltips = false;

    if (this.container) {
      this.container.destroy();
      this.container = null;
    }
  }

  isVisible(): boolean {
    return this.container !== null;
  }
}
