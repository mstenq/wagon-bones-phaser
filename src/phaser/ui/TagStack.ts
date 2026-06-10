// ─── TagStack ───
// Renders pending trail tag icons stacked vertically above the dice pouch.
// Each tag is a small colored badge with a tooltip on hover.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { TEXT_COLORS, FONTS, UI, TAG_STACK } from '../../game/Constants';
import { getTagDisplayContext } from '../../game/displayContext';
import { getRunState, runStore } from '../../game/store/runStore';
import { selectTagStackModel } from '../../game/store/selectors/uiSelectors';
import { resolveTagDescription } from '../../data/trail_tags';
import { TrailTagInstance } from '../../game/types';
import { bindGameObject } from '../store/subscribe';
import { addTrailTagBadgeIcon, drawTrailTagBadgeBackground } from './TrailTagBadge';

const { BADGE_SIZE, BADGE_GAP, TOOLTIP_WIDTH, POUCH_CLEARANCE } = TAG_STACK;

function tagStackEquality(
  a: ReturnType<typeof selectTagStackModel>,
  b: ReturnType<typeof selectTagStackModel>,
): boolean {
  if (a.twinWagonCount !== b.twinWagonCount) return false;
  if (a.tags.length !== b.tags.length) return false;
  for (let i = 0; i < a.tags.length; i++) {
    if (a.tags[i]!.def.id !== b.tags[i]!.def.id || a.tags[i]!.copies !== b.tags[i]!.copies) return false;
  }
  return true;
}

export class TagStack extends GameObjects.Container {
  private badges: GameObjects.Container[] = [];
  private tooltip: GameObjects.Container | null = null;
  private pouchX: number;
  private pouchY: number;

  constructor(scene: Scene, pouchX: number, pouchY: number) {
    super(scene, 0, 0);
    this.pouchX = pouchX;
    this.pouchY = pouchY;
    scene.add.existing(this);
    this.setDepth(150);

    bindGameObject(this, runStore, selectTagStackModel, (model) => this.renderFromModel(model), {
      equalityFn: tagStackEquality,
    });
  }

  private renderFromModel(model: ReturnType<typeof selectTagStackModel>): void {
    if (!this.scene || !this.active) return;

    for (const badge of this.badges) badge.destroy();
    this.badges = [];
    this.hideTooltip();

    const { tags, twinWagonCount } = model;
    if (tags.length === 0 && twinWagonCount === 0) return;

    const stackBottom = this.pouchY - UI.POUCH_SIZE - POUCH_CLEARANCE;

    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i]!;
      const badgeY = stackBottom - (i + 1) * (BADGE_SIZE + BADGE_GAP) + BADGE_SIZE;
      const badge = this.createBadge(tag, this.pouchX, badgeY);
      this.badges.push(badge);
    }

    if (twinWagonCount > 0) {
      const twY = stackBottom - (tags.length + 1) * (BADGE_SIZE + BADGE_GAP) + BADGE_SIZE;
      const twBadge = this.createTwinWagonBadge(twinWagonCount, this.pouchX, twY);
      this.badges.push(twBadge);
    }
  }

  /** Pouch anchor for fly-in animations */
  getStackAnchor(): { x: number; y: number } {
    const model = selectTagStackModel();
    const stackCount = model.tags.length + (model.twinWagonCount > 0 ? 1 : 0);
    const stackBottom = this.pouchY - UI.POUCH_SIZE - POUCH_CLEARANCE;
    const y = stackBottom - (stackCount + 1) * (BADGE_SIZE + BADGE_GAP) + BADGE_SIZE / 2;
    return { x: this.pouchX + BADGE_SIZE / 2, y };
  }

  updatePouchPosition(pouchX: number, pouchY: number): void {
    this.pouchX = pouchX;
    this.pouchY = pouchY;
    this.renderFromModel(selectTagStackModel());
  }

  private createBadge(tag: TrailTagInstance, x: number, y: number): GameObjects.Container {
    const half = BADGE_SIZE / 2;
    const cx = x + half;
    const cy = y + half;
    const container = this.scene.add.container(cx, cy);

    const bg = this.scene.add.graphics();
    drawTrailTagBadgeBackground(bg, -half, -half, BADGE_SIZE, tag.def.category);
    container.add(bg);

    addTrailTagBadgeIcon(this.scene, container, -half, -half, BADGE_SIZE, tag.def.id);

    if (tag.copies > 1) {
      const copyBg = this.scene.add.graphics();
      copyBg.fillStyle(0xff4444, 1);
      copyBg.fillCircle(half - 4, -half + 4, 8);
      container.add(copyBg);

      const copyText = this.scene.add
        .text(half - 4, -half + 4, `×${tag.copies}`, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '9px',
          color: '#ffffff',
        })
        .setOrigin(0.5);
      container.add(copyText);
    }

    container.setSize(BADGE_SIZE, BADGE_SIZE);
    container.setInteractive(new Phaser.Geom.Rectangle(0, 0, BADGE_SIZE, BADGE_SIZE), Phaser.Geom.Rectangle.Contains);

    container.on('pointerover', () => {
      drawTrailTagBadgeBackground(bg, -half, -half, BADGE_SIZE, tag.def.category, { hover: true });
      this.showTooltip(tag, cx, cy);
    });
    container.on('pointerout', () => {
      drawTrailTagBadgeBackground(bg, -half, -half, BADGE_SIZE, tag.def.category);
      this.hideTooltip();
    });

    container.setDepth(150);
    this.add(container);
    return container;
  }

  private createTwinWagonBadge(count: number, x: number, y: number): GameObjects.Container {
    const half = BADGE_SIZE / 2;
    const cx = x + half;
    const cy = y + half;
    const container = this.scene.add.container(cx, cy);

    const bg = this.scene.add.graphics();
    drawTrailTagBadgeBackground(bg, -half, -half, BADGE_SIZE, 'meta');
    container.add(bg);

    addTrailTagBadgeIcon(this.scene, container, -half, -half, BADGE_SIZE, 'tag_twin_wagon');

    const text = this.scene.add
      .text(0, 0, `×${count + 1}`, {
        fontFamily: FONTS.HEADING,
        fontSize: '16px',
        color: '#ffdd44',
      })
      .setOrigin(0.5);
    container.add(text);

    container.setSize(BADGE_SIZE, BADGE_SIZE);
    container.setInteractive(new Phaser.Geom.Rectangle(0, 0, BADGE_SIZE, BADGE_SIZE), Phaser.Geom.Rectangle.Contains);

    container.on('pointerover', () => this.showTwinWagonTooltip(count, cx, cy));
    container.on('pointerout', () => this.hideTooltip());

    container.setDepth(150);
    this.add(container);
    return container;
  }

  private showTooltip(tag: TrailTagInstance, badgeCx: number, badgeCy: number): void {
    this.hideTooltip();

    const half = BADGE_SIZE / 2;
    const tooltipH = 60;
    const tx = badgeCx - TOOLTIP_WIDTH - 8;
    const ty = badgeCy - half;

    this.tooltip = this.scene.add.container(tx, ty);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x1a1a2e, 0.95);
    bg.fillRoundedRect(0, 0, TOOLTIP_WIDTH, tooltipH, 8);
    bg.lineStyle(1, 0x444466, 0.8);
    bg.strokeRoundedRect(0, 0, TOOLTIP_WIDTH, tooltipH, 8);
    this.tooltip.add(bg);

    const name = this.scene.add.text(8, 6, tag.def.name, {
      fontFamily: FONTS.HEADING,
      fontSize: '13px',
      color: TEXT_COLORS.GOLD,
    });
    this.tooltip.add(name);

    const descText = resolveTagDescription(
      tag.def,
      getTagDisplayContext(getRunState(), { surveyorHand: tag.surveyorHand, copies: tag.copies }),
    );
    const desc = this.scene.add.text(8, 24, descText, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '10px',
      color: TEXT_COLORS.SECONDARY,
      wordWrap: { width: TOOLTIP_WIDTH - 16 },
    });
    this.tooltip.add(desc);

    const actualH = Math.max(tooltipH, desc.y + desc.height + 8);
    bg.clear();
    bg.fillStyle(0x1a1a2e, 0.95);
    bg.fillRoundedRect(0, 0, TOOLTIP_WIDTH, actualH, 8);
    bg.lineStyle(1, 0x444466, 0.8);
    bg.strokeRoundedRect(0, 0, TOOLTIP_WIDTH, actualH, 8);

    this.tooltip.setDepth(200);
    this.add(this.tooltip);
  }

  private showTwinWagonTooltip(count: number, badgeCx: number, badgeCy: number): void {
    this.hideTooltip();

    const half = BADGE_SIZE / 2;
    const tooltipW = 180;
    const tooltipH = 50;
    const tx = badgeCx - tooltipW - 8;
    const ty = badgeCy - half;

    this.tooltip = this.scene.add.container(tx, ty);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x1a1a2e, 0.95);
    bg.fillRoundedRect(0, 0, tooltipW, tooltipH, 8);
    bg.lineStyle(1, 0x444466, 0.8);
    bg.strokeRoundedRect(0, 0, tooltipW, tooltipH, 8);
    this.tooltip.add(bg);

    const name = this.scene.add.text(8, 6, 'Twin Wagon', {
      fontFamily: FONTS.HEADING,
      fontSize: '13px',
      color: '#ffdd44',
    });
    this.tooltip.add(name);

    const desc = this.scene.add.text(8, 24, `Next tag earned is duplicated ×${count + 1}`, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '10px',
      color: TEXT_COLORS.SECONDARY,
      wordWrap: { width: tooltipW - 16 },
    });
    this.tooltip.add(desc);

    this.tooltip.setDepth(200);
    this.add(this.tooltip);
  }

  private hideTooltip(): void {
    if (this.tooltip) {
      this.tooltip.destroy();
      this.tooltip = null;
    }
  }
}
