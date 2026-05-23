// ─── RoundInfo ───
// Reusable round column UI (Balatro blind-style) for RoundSelectScene and JourneyInfoModal.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { GAMEPLAY, TEXT_COLORS, FONTS } from '../../game/Constants';
import { computeRoundReward, computeTargetMiles, getPlayerState } from '../../game/PlayerState';
import type { DifficultyLevel } from '../../game/types';
import { formatScore } from '../../game/formatScore';
import { Button } from './Button';
import type { TrailTagDef, TagCategory } from '../../game/types';

export const ROUND_NAMES = ['Mile Marker', 'River Ford', 'Showdown'] as const;

export type RoundColumnState = 'skipped' | 'complete' | 'select' | 'upcoming';

const TAG_CATEGORY_COLORS: Record<TagCategory, number> = {
  shop: 0x4488ff,
  shop_aura: 0xaa44ff,
  boss: 0xff4444,
  immediate_pack: 0x44aa44,
  immediate_money: 0xffd700,
  immediate_equipment: 0x8b7355,
  immediate_upgrade: 0xff8800,
  next_round: 0x44cccc,
  meta: 0xff66cc,
};

const BTN_H = 44;
const BTN_GAP = 10;
const COL_PAD = 14;
const TAG_SIZE = 36;
/** Boss portrait on round-select boss column (~2× former circle diameter). */
const BOSS_PORTRAIT_SIZE = { compact: 64, normal: 96 } as const;
/** Extra space below round title before boss portrait (avoids overlapping heading). */
const BOSS_PORTRAIT_TOP_GAP = { compact: 20, normal: 28 } as const;

export function targetMilesForRound(
  leg: number,
  round: number,
  permitScoreReduction: number,
  difficulty: DifficultyLevel = 1,
): number {
  return computeTargetMiles(leg, round, permitScoreReduction, difficulty);
}

export function getRoundColumnState(
  round: number,
  currentRound: number,
  skippedRoundsThisLeg: number[],
): RoundColumnState {
  if (skippedRoundsThisLeg.includes(round)) return 'skipped';
  if (round < currentRound) return 'complete';
  if (round === currentRound) return 'select';
  return 'upcoming';
}

export interface RoundInfoConfig {
  round: number;
  state: RoundColumnState;
  leg: number;
  difficulty: DifficultyLevel;
  permitScoreReduction: number;
  skippedTag?: TrailTagDef;
  /** Skip-reward tag for this round (preview on current/upcoming, earned when skipped). */
  skipPreviewTag?: TrailTagDef;
  showActions?: boolean;
  compact?: boolean;
  depth?: number;
  onPlay?: () => void;
  onSkip?: () => void;
  onRerollBoss?: () => void;
  canRerollBoss?: () => boolean;
  onTagHover?: (tag: TrailTagDef, anchorX: number, anchorY: number) => void;
  onTagHoverEnd?: () => void;
}

export interface LegRoundPanelsConfig {
  bounds: { x: number; y: number; width: number; height: number };
  /** When set, panels are added to this container instead of the scene root. */
  parent?: GameObjects.Container;
  gap?: number;
  currentRound: number;
  leg: number;
  difficulty: DifficultyLevel;
  permitScoreReduction: number;
  skippedRoundsThisLeg: number[];
  getSkippedTagForRound: (round: number) => TrailTagDef | undefined;
  getSkipPreviewTagForRound?: (round: number) => TrailTagDef | undefined;
  showActions?: boolean;
  compact?: boolean;
  depth?: number;
  onPlay?: () => void;
  onSkip?: () => void;
  onRerollBoss?: () => void;
  canRerollBoss?: () => boolean;
  onTagHover?: (tag: TrailTagDef, anchorX: number, anchorY: number) => void;
  onTagHoverEnd?: () => void;
}

/** Build three round columns for the current leg within a bounding box. */
export function createLegRoundPanels(scene: Scene, config: LegRoundPanelsConfig): RoundInfoPanel[] {
  const gap = config.gap ?? (config.compact ? 10 : 20);
  const colW = Math.min(config.compact ? 170 : 220, (config.bounds.width - gap * 2) / 3);
  const totalW = colW * 3 + gap * 2;
  const startX = config.bounds.x + (config.bounds.width - totalW) / 2;
  const panels: RoundInfoPanel[] = [];

  for (let r = 1; r <= GAMEPLAY.ROUNDS_PER_LEG; r++) {
    const x = startX + (r - 1) * (colW + gap);
    const state = getRoundColumnState(r, config.currentRound, config.skippedRoundsThisLeg);
    const isSkippable = r <= 2;
    const skipPreviewTag =
      isSkippable && !config.skippedRoundsThisLeg.includes(r) ? config.getSkipPreviewTagForRound?.(r) : undefined;
    const panel = new RoundInfoPanel(scene, x, config.bounds.y, colW, config.bounds.height, {
      round: r,
      state,
      leg: config.leg,
      difficulty: config.difficulty,
      permitScoreReduction: config.permitScoreReduction,
      skippedTag: config.getSkippedTagForRound(r),
      skipPreviewTag,
      showActions: config.showActions,
      compact: config.compact,
      depth: config.depth,
      onPlay: config.onPlay,
      onSkip: config.onSkip,
      onRerollBoss: config.onRerollBoss,
      canRerollBoss: config.canRerollBoss,
      onTagHover: config.onTagHover,
      onTagHoverEnd: config.onTagHoverEnd,
    });
    panels.push(panel);
    if (config.parent) {
      config.parent.add(panel);
    } else {
      scene.add.existing(panel);
    }
  }

  return panels;
}

/** Build panels from current player state (convenience for modals). */
export function createLegRoundPanelsForPlayer(
  scene: Scene,
  bounds: LegRoundPanelsConfig['bounds'],
  options?: Omit<
    LegRoundPanelsConfig,
    | 'bounds'
    | 'currentRound'
    | 'leg'
    | 'difficulty'
    | 'permitScoreReduction'
    | 'skippedRoundsThisLeg'
    | 'getSkippedTagForRound'
    | 'getSkipPreviewTagForRound'
  >,
): RoundInfoPanel[] {
  const player = getPlayerState();
  return createLegRoundPanels(scene, {
    bounds,
    currentRound: player.round,
    leg: player.leg,
    difficulty: player.difficulty,
    permitScoreReduction: player.permitScoreReduction,
    skippedRoundsThisLeg: player.skippedRoundsThisLeg,
    getSkippedTagForRound: (r) => player.getSkippedTagForRound(r),
    getSkipPreviewTagForRound: (r) => player.getSkipPreviewTagForRound(r),
    ...options,
  });
}

export class RoundInfoPanel extends GameObjects.Container {
  constructor(scene: Scene, x: number, y: number, width: number, height: number, config: RoundInfoConfig) {
    super(scene, x, y);
    const depth = config.depth ?? 0;
    this.setDepth(depth);

    const compact = config.compact ?? false;
    const round = config.round;
    const isBoss = round === GAMEPLAY.ROUNDS_PER_LEG;
    const isSkipped = config.state === 'skipped';
    const isActive = config.state === 'select';
    const isUpcoming = config.state === 'upcoming';
    const showRoundActions = (config.showActions ?? false) && isActive;
    const showBossReroll =
      (config.showActions ?? false) &&
      isBoss &&
      !isSkipped &&
      config.state !== 'complete' &&
      !!config.onRerollBoss &&
      getPlayerState().bossPermitRerollLimit !== 0;

    const bg = scene.add.graphics();
    const bgColor = isActive ? 0x1a2a1a : isSkipped ? 0x151520 : 0x0d0d1a;
    const borderColor = isActive ? 0xcc7722 : isSkipped ? 0x444466 : 0x333355;
    bg.fillStyle(bgColor, 0.9);
    bg.fillRoundedRect(0, 0, width, height, 12);
    bg.lineStyle(isActive ? 3 : 2, borderColor, isActive ? 1 : 0.55);
    bg.strokeRoundedRect(0, 0, width, height, 12);
    this.add(bg);

    const cx = width / 2;
    let cy = compact ? 16 : 22;

    const headerLabels: Record<RoundColumnState, string> = {
      skipped: 'Skipped',
      complete: 'Complete',
      select: 'Select',
      upcoming: 'Upcoming',
    };
    const headerColors: Record<RoundColumnState, string> = {
      skipped: TEXT_COLORS.ERROR_RED,
      complete: TEXT_COLORS.SCORE_GREEN,
      select: '#ffaa44',
      upcoming: TEXT_COLORS.SECONDARY,
    };

    this.addLabel(cx, cy, headerLabels[config.state], {
      fontSize: compact ? '12px' : '14px',
      color: headerColors[config.state],
    });
    cy += compact ? 22 : 28;

    this.addLabel(cx, cy, ROUND_NAMES[round - 1], {
      fontFamily: FONTS.HEADING,
      fontSize: compact ? '16px' : '20px',
      color: isUpcoming ? TEXT_COLORS.MUTED : TEXT_COLORS.PRIMARY,
    });
    cy += compact ? 28 : 34;

    if (isBoss) {
      const boss = getPlayerState().getBossForLeg(config.leg);
      if (boss) {
        cy += compact ? BOSS_PORTRAIT_TOP_GAP.compact : BOSS_PORTRAIT_TOP_GAP.normal;
        const portraitSize = compact ? BOSS_PORTRAIT_SIZE.compact : BOSS_PORTRAIT_SIZE.normal;
        this.addBossPortrait(cx, cy, boss.id, portraitSize);
        cy += portraitSize / 2 + (compact ? 10 : 12);

        this.addLabel(cx, cy, boss.name, {
          fontFamily: FONTS.HEADING,
          fontSize: compact ? '12px' : '14px',
          color: TEXT_COLORS.GOLD,
          wordWrap: { width: width - 20 },
          align: 'center',
        });
        cy += compact ? 28 : 34;

        this.addLabel(cx, cy, boss.description, {
          fontSize: compact ? '12px' : '14px',
          color: TEXT_COLORS.SECONDARY,
          wordWrap: { width: width - 20 },
          align: 'center',
        });
        cy += compact ? 30 : 36;
      }
    } else {
      const emblem = scene.add.graphics();
      const emblemColor = round === 1 ? 0x666688 : 0x448866;
      emblem.fillStyle(emblemColor, 1);
      emblem.fillCircle(cx, cy, compact ? 15 : 18);
      emblem.lineStyle(2, 0xffffff, 0.4);
      emblem.strokeCircle(cx, cy, compact ? 15 : 18);
      this.add(emblem);
      cy += compact ? 34 : 40;
    }

    const target = targetMilesForRound(config.leg, round, config.permitScoreReduction, config.difficulty);

    this.addLabel(cx, cy, 'Score at least', {
      fontSize: compact ? '11px' : '12px',
      color: TEXT_COLORS.SECONDARY,
    });
    cy += compact ? 16 : 18;

    this.addLabel(cx, cy, formatScore(target), {
      fontFamily: FONTS.HEADING,
      fontSize: compact ? '18px' : '22px',
      color: TEXT_COLORS.SCORE_GREEN,
    });
    cy += compact ? 20 : 24;

    const roundReward = computeRoundReward(round, config.difficulty);
    if (roundReward === 0) {
      this.addLabel(cx, cy, 'Thin Supplies: No reward', {
        fontSize: compact ? '11px' : '12px',
        color: TEXT_COLORS.ERROR_RED,
      });
    } else {
      const rewardDollars = '$'.repeat(roundReward);
      this.addLabel(cx, cy, `Reward: ${rewardDollars}+`, {
        fontSize: compact ? '11px' : '12px',
        color: TEXT_COLORS.MONEY,
      });
    }

    if (isSkipped) {
      const stampY = height * 0.52;

      if (config.skippedTag) {
        this.addRoundTagDisplay(config.skippedTag, config, stampY - 8, compact);
      }

      const stamp = scene.add
        .text(cx, stampY, 'SKIPPED', {
          fontFamily: FONTS.HEADING,
          fontSize: compact ? '20px' : '24px',
          color: TEXT_COLORS.ERROR_RED,
        })
        .setOrigin(0.5)
        .setRotation(-0.25)
        .setAlpha(0.75);
      this.add(stamp);
    } else if (!showRoundActions && !showBossReroll && !isBoss && config.skipPreviewTag) {
      const footerY = height - (compact ? 48 : 56);
      this.addRoundTagDisplay(config.skipPreviewTag, config, footerY, compact);
    }

    if (showBossReroll || showRoundActions) {
      const bottomY = height - COL_PAD;
      const hasSkip = showRoundActions && !isBoss && !!config.skipPreviewTag;
      let actionY = bottomY - BTN_H / 2;
      const absX = x + cx;

      if (showRoundActions) {
        const playY = hasSkip ? actionY - BTN_H - BTN_GAP : actionY;

        const playBtn = new Button(scene, absX, y + playY, 'Play Round', width - 30, BTN_H)
          .setColor(0x2d6b2d, 0x3d8b3d)
          .setDepth(depth + 5);
        if (config.onPlay) playBtn.onClick(config.onPlay);
        this.registerButton(playBtn);

        if (hasSkip && config.skipPreviewTag) {
          const skipY = actionY;
          const tag = config.skipPreviewTag;
          const tagX = 14;
          const tagY = skipY - TAG_SIZE / 2;
          const skipBtnW = width - 30 - TAG_SIZE - 10;
          const skipBtnX = x + tagX + TAG_SIZE + 10 + skipBtnW / 2;

          this.addTagBadge(tagX, tagY, tag, TAG_SIZE, config);
          const skipBtn = new Button(scene, skipBtnX, y + skipY, 'Skip Round', skipBtnW, BTN_H)
            .setColor(0x8b2020, 0xb03030)
            .setDepth(depth + 5);
          if (config.onSkip) skipBtn.onClick(config.onSkip);
          this.registerButton(skipBtn);

          if (config.onTagHover) {
            const ax = x + tagX + TAG_SIZE / 2;
            const ay = y + tagY;
            skipBtn.on('pointerover', () => config.onTagHover!(tag, ax, ay));
            skipBtn.on('pointerout', () => config.onTagHoverEnd?.());
          }
        }

        if (showBossReroll) {
          actionY = (hasSkip ? actionY : playY) - BTN_H - BTN_GAP;
        }
      }

      if (showBossReroll) {
        const rerollBtn = new Button(scene, absX, y + actionY, 'Reroll $10', width - 30, BTN_H)
          .setColor(0x6b2d6b, 0x8b3d8b)
          .setDepth(depth + 5);
        const rerollEnabled = config.canRerollBoss?.() ?? true;
        rerollBtn.setEnabled(rerollEnabled);
        rerollBtn.onClick(config.onRerollBoss!);
        this.registerButton(rerollBtn);
      }
    }
  }

  private externalButtons: Button[] = [];

  private registerButton(btn: Button): void {
    this.externalButtons.push(btn);
  }

  private addRoundTagDisplay(tag: TrailTagDef, config: RoundInfoConfig, tagY: number, compact: boolean): void {
    const size = compact ? 28 : TAG_SIZE;
    const tagX = 16;
    this.addTagBadge(tagX, tagY, tag, size, config);
  }

  private addBossPortrait(cx: number, cy: number, bossId: string, size: number): void {
    const imgKey = `boss_${bossId}`;
    if (this.scene.textures.exists(imgKey)) {
      const img = this.scene.add.image(cx, cy, imgKey);
      const tex = img.texture.getSourceImage();
      img.setScale(size / Math.max(tex.width, tex.height));
      this.add(img);
      return;
    }

    const badge = this.scene.add.graphics();
    const r = size / 2;
    badge.fillStyle(0x662244, 1);
    badge.fillCircle(cx, cy, r);
    badge.lineStyle(2, 0xff66aa, 0.9);
    badge.strokeCircle(cx, cy, r);
    this.add(badge);
  }

  private addLabel(x: number, y: number, content: string, style: Phaser.Types.GameObjects.Text.TextStyle): void {
    const text = this.scene.add
      .text(x, y, content, {
        fontFamily: FONTS.PRIMARY,
        ...style,
      })
      .setOrigin(0.5);
    this.add(text);
  }

  private addTagBadge(x: number, y: number, tag: TrailTagDef, size: number, config: RoundInfoConfig): void {
    const color = TAG_CATEGORY_COLORS[tag.category] ?? 0x888888;
    const g = this.scene.add.graphics();
    g.fillStyle(color, 1);
    g.fillRoundedRect(x, y, size, size, 4);
    g.lineStyle(2, 0xffffff, 0.5);
    g.strokeRoundedRect(x, y, size, size, 4);
    g.fillStyle(0xffffff, 0.35);
    g.fillRect(x, y, size / 2, size);
    this.add(g);

    if (config.onTagHover) {
      const zone = this.scene.add.zone(x + size / 2, y + size / 2, size, size).setInteractive({ useHandCursor: true });
      zone.on('pointerover', () => {
        const matrix = this.getWorldTransformMatrix();
        config.onTagHover!(tag, matrix.tx + x + size / 2, matrix.ty + y);
      });
      zone.on('pointerout', () => config.onTagHoverEnd?.());
      this.add(zone);
    }
  }

  destroy(fromScene?: boolean): void {
    for (const btn of this.externalButtons) {
      btn.destroy();
    }
    this.externalButtons = [];
    super.destroy(fromScene);
  }
}
