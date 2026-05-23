// ─── TagStack ───
// Renders pending trail tag icons stacked vertically above the dice pouch.
// Each tag is a small colored badge with a tooltip on hover.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { TEXT_COLORS, FONTS, UI, TAG_STACK } from '../../game/Constants';
import { getPlayerState } from '../../game/PlayerState';
import { getQueuedAuraTags } from '../../game/TagSystem';
import { TrailTagInstance } from '../../game/types';

const TAG_COLORS: Record<string, number> = {
  shop: 0x44aa44,
  shop_aura: 0x9966cc,
  boss: 0xcc4444,
  immediate_pack: 0x4488cc,
  immediate_money: 0xccaa44,
  immediate_equipment: 0x88aa44,
  immediate_upgrade: 0x5b9bd5,
  next_round: 0xcc8844,
  meta: 0xcccccc,
};

const { BADGE_SIZE, BADGE_GAP, BADGE_RADIUS, TOOLTIP_WIDTH, POUCH_CLEARANCE } = TAG_STACK;

/** Merge tag instances with the same id into one badge. */
function groupTagsById(tags: TrailTagInstance[]): TrailTagInstance[] {
  const grouped = new Map<string, TrailTagInstance>();
  for (const tag of tags) {
    const existing = grouped.get(tag.def.id);
    if (existing) {
      existing.copies += tag.copies;
    } else {
      grouped.set(tag.def.id, { def: tag.def, copies: tag.copies });
    }
  }
  return [...grouped.values()];
}

export class TagStack extends GameObjects.Container {
  private badges: GameObjects.Container[] = [];
  private tooltip: GameObjects.Container | null = null;

  constructor(
    scene: Scene,
    private pouchX: number,
    private pouchY: number,
  ) {
    super(scene, 0, 0);
    scene.add.existing(this);
    this.setDepth(150);
    this.refresh();
  }

  /** Rebuild the tag stack from current player state */
  refresh(): void {
    if (!this.scene || !this.active) return;

    for (const badge of this.badges) badge.destroy();
    this.badges = [];
    this.hideTooltip();

    const player = getPlayerState();
    const pending = player.pendingTags.filter((t) => !t.def.category.startsWith('immediate_'));
    const auraQueued = getQueuedAuraTags(player);
    const nonAuraPending = pending.filter((t) => t.def.category !== 'shop_aura');
    const tags = groupTagsById([...nonAuraPending, ...auraQueued]);

    if (tags.length === 0 && player.twinWagonCount === 0) return;

    const stackBottom = this.pouchY - UI.POUCH_SIZE - POUCH_CLEARANCE;

    for (let i = 0; i < tags.length; i++) {
      const tag = tags[i];
      const badgeY = stackBottom - (i + 1) * (BADGE_SIZE + BADGE_GAP) + BADGE_SIZE;
      const badge = this.createBadge(tag, this.pouchX, badgeY);
      this.badges.push(badge);
    }

    if (player.twinWagonCount > 0) {
      const twY = stackBottom - (tags.length + 1) * (BADGE_SIZE + BADGE_GAP) + BADGE_SIZE;
      const twBadge = this.createTwinWagonBadge(player.twinWagonCount, this.pouchX, twY);
      this.badges.push(twBadge);
    }
  }

  /** Pouch anchor for fly-in animations */
  getStackAnchor(): { x: number; y: number } {
    const player = getPlayerState();
    const pending = player.pendingTags.filter((t) => !t.def.category.startsWith('immediate_'));
    const auraQueued = getQueuedAuraTags(player);
    const nonAuraPending = pending.filter((t) => t.def.category !== 'shop_aura');
    const tagCount = groupTagsById([...nonAuraPending, ...auraQueued]).length;
    const twinExtra = player.twinWagonCount > 0 ? 1 : 0;
    const stackCount = tagCount + twinExtra;
    const stackBottom = this.pouchY - UI.POUCH_SIZE - POUCH_CLEARANCE;
    const y = stackBottom - (stackCount + 1) * (BADGE_SIZE + BADGE_GAP) + BADGE_SIZE / 2;
    return { x: this.pouchX + BADGE_SIZE / 2, y };
  }

  updatePouchPosition(pouchX: number, pouchY: number): void {
    this.pouchX = pouchX;
    this.pouchY = pouchY;
    this.refresh();
  }

  private createBadge(tag: TrailTagInstance, x: number, y: number): GameObjects.Container {
    const container = this.scene.add.container(x, y);
    const color = TAG_COLORS[tag.def.category] ?? 0x888888;

    const bg = this.scene.add.graphics();
    this.drawBadgeBg(bg, color, false);
    container.add(bg);

    const icon = this.scene.add
      .text(BADGE_SIZE / 2, BADGE_SIZE / 2 - 2, this.getTagIcon(tag.def.id), {
        fontSize: '16px',
      })
      .setOrigin(0.5);
    container.add(icon);

    if (tag.copies > 1) {
      const copyBg = this.scene.add.graphics();
      copyBg.fillStyle(0xff4444, 1);
      copyBg.fillCircle(BADGE_SIZE - 4, 4, 8);
      container.add(copyBg);

      const copyText = this.scene.add
        .text(BADGE_SIZE - 4, 4, `×${tag.copies}`, {
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
      this.drawBadgeBg(bg, color, true);
      this.showTooltip(tag, x, y);
    });
    container.on('pointerout', () => {
      this.drawBadgeBg(bg, color, false);
      this.hideTooltip();
    });

    container.setDepth(150);
    this.add(container);
    return container;
  }

  private createTwinWagonBadge(count: number, x: number, y: number): GameObjects.Container {
    const container = this.scene.add.container(x, y);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0xcccccc, 0.9);
    bg.fillRoundedRect(0, 0, BADGE_SIZE, BADGE_SIZE, BADGE_RADIUS);
    bg.lineStyle(2, 0xffdd44, 0.8);
    bg.strokeRoundedRect(0, 0, BADGE_SIZE, BADGE_SIZE, BADGE_RADIUS);
    container.add(bg);

    const text = this.scene.add
      .text(BADGE_SIZE / 2, BADGE_SIZE / 2, `×${count + 1}`, {
        fontFamily: FONTS.HEADING,
        fontSize: '16px',
        color: '#ffdd44',
      })
      .setOrigin(0.5);
    container.add(text);

    container.setSize(BADGE_SIZE, BADGE_SIZE);
    container.setInteractive(new Phaser.Geom.Rectangle(0, 0, BADGE_SIZE, BADGE_SIZE), Phaser.Geom.Rectangle.Contains);

    container.on('pointerover', () => this.showTwinWagonTooltip(count, x, y));
    container.on('pointerout', () => this.hideTooltip());

    container.setDepth(150);
    this.add(container);
    return container;
  }

  private drawBadgeBg(bg: GameObjects.Graphics, color: number, hover: boolean): void {
    bg.clear();
    bg.fillStyle(color, hover ? 1 : 0.9);
    bg.fillRoundedRect(0, 0, BADGE_SIZE, BADGE_SIZE, BADGE_RADIUS);
    bg.lineStyle(hover ? 2 : 1, 0xffffff, hover ? 0.6 : 0.3);
    bg.strokeRoundedRect(0, 0, BADGE_SIZE, BADGE_SIZE, BADGE_RADIUS);
  }

  private showTooltip(tag: TrailTagInstance, badgeX: number, badgeY: number): void {
    this.hideTooltip();

    const tooltipH = 60;
    const tx = badgeX - TOOLTIP_WIDTH - 8;
    const ty = badgeY;

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

    const desc = this.scene.add.text(8, 24, tag.def.description, {
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

  private showTwinWagonTooltip(count: number, badgeX: number, badgeY: number): void {
    this.hideTooltip();

    const tooltipW = 180;
    const tooltipH = 50;
    const tx = badgeX - tooltipW - 8;
    const ty = badgeY;

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

  private getTagIcon(tagId: string): string {
    const icons: Record<string, string> = {
      tag_uncommon: '🏷️',
      tag_rare: '🍺',
      tag_ghost: '👻',
      tag_icy: '❄️',
      tag_fire: '🔥',
      tag_holy: '✝️',
      tag_investment: '💰',
      tag_permit: '📜',
      tag_boss: '🔄',
      tag_dice_mega: '🎲',
      tag_supply_mega: '📦',
      tag_trail_guide_mega: '🗺️',
      tag_equipment_mega: '🔧',
      tag_frontier: '👁️',
      tag_well_traveled: '🥾',
      tag_pack_rat: '🐀',
      tag_company_store: '🏪',
      tag_twin_wagon: '🔁',
      tag_wide_saddle: '🐎',
      tag_free_reroll: '🎫',
      tag_top_up: '🗑️',
      tag_shortcut: '⚡',
      tag_surveyor: '📐',
      tag_bank_deposit: '🏦',
    };
    return icons[tagId] ?? '🏷️';
  }
}
