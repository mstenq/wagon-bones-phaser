// ─── RoundInfo ───
// Reusable round column UI (Balatro blind-style) for RoundSelectScene and JourneyInfoModal.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { GAMEPLAY, TEXT_COLORS, FONTS } from '../../game/Constants';
import { computeRoundReward, computeTargetMiles } from '../../game/runProgression';
import { getRunState } from '../../game/store/runStore';
import {
  selectBlindSizeMultiplier,
  selectBossForLeg,
  selectBossPermitRerollLimit,
  selectSkipPreviewTagForRound,
  selectSkippedTagForRound,
} from '../../game/store/selectors/runSelectors';
import type { DifficultyLevel } from '../../game/types';
import { formatScore } from '../../game/formatScore';
import type { DecimalSource } from '../../game/decimal';
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
const ROW_TAG_SIZE = 30;
const STACK_PAD = 10;
const STACK_BTN_H = 32;
const STACK_ART = 44;
const STACK_EMBLEM_R = 15;
/** Gap below header text before the divider line (portrait stacked cards). */
const STACK_DIVIDER_GAP = 6;
/** Gap below divider before the score/reward row. */
const STACK_STATS_GAP = 8;
/** Portrait stacked row heights — per round, not derived from viewport. */
const STACKED_PANEL_H_REGULAR = 110;
const STACKED_PANEL_H_REGULAR_ACTIVE = 132;
const STACKED_PANEL_H_BOSS = 180;
/** Stats block: label line + value line. */
const STACK_STATS_ROW_H = 26;
/** Boss portrait on round-select boss column (~2× former circle diameter). */
const BOSS_PORTRAIT_SIZE = { compact: 64, normal: 96, stacked: 44 } as const;
/** Extra space below round title before boss portrait (avoids overlapping heading). */
const BOSS_PORTRAIT_TOP_GAP = { compact: 20, normal: 28 } as const;

export type LegRoundPanelLayout = 'columns' | 'rows';

export interface LegRoundPanelSlot {
  round: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LegRoundPanelGeometry {
  panels: LegRoundPanelSlot[];
  layout: LegRoundPanelLayout;
  compact: boolean;
  gap: number;
}

export function targetMilesForRound(
  leg: number,
  round: number,
  permitScoreReduction: number,
  difficulty: DifficultyLevel = 1,
): DecimalSource {
  const run = getRunState();
  const boss = round === GAMEPLAY.ROUNDS_PER_LEG ? selectBossForLeg(run, leg) : null;
  return computeTargetMiles(leg, round, permitScoreReduction, difficulty, boss, selectBlindSizeMultiplier(run));
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
  /** Portrait stacked rows — horizontal content within each panel. */
  stacked?: boolean;
  depth?: number;
  onPlay?: () => void;
  onSkip?: () => void;
  onRerollBoss?: () => void;
  canRerollBoss?: () => boolean;
  onTagHover?: (tag: TrailTagDef, round: number, anchorX: number, anchorY: number) => void;
  onTagHoverEnd?: () => void;
}

export interface LegRoundPanelsConfig {
  bounds: { x: number; y: number; width: number; height: number };
  /** When set, panels are added to this container instead of the scene root. */
  parent?: GameObjects.Container;
  gap?: number;
  layout?: LegRoundPanelLayout;
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
  onTagHover?: (tag: TrailTagDef, round: number, anchorX: number, anchorY: number) => void;
  onTagHoverEnd?: () => void;
}

function stackedPanelHeight(round: number, currentRound: number, showActions: boolean): number {
  if (round === GAMEPLAY.ROUNDS_PER_LEG) return STACKED_PANEL_H_BOSS;
  if (showActions && round === currentRound) return STACKED_PANEL_H_REGULAR_ACTIVE;
  return STACKED_PANEL_H_REGULAR;
}

/** Compute panel slots for three leg rounds within a bounding box. */
export function computeLegRoundPanelGeometry(
  bounds: LegRoundPanelsConfig['bounds'],
  options: {
    gap?: number;
    compact?: boolean;
    layout?: LegRoundPanelLayout;
    currentRound?: number;
    showActions?: boolean;
  } = {},
): LegRoundPanelGeometry {
  const layout = options.layout ?? 'columns';
  const compact = options.compact ?? layout === 'rows';
  const gap = options.gap ?? (layout === 'rows' ? 8 : compact ? 10 : 20);

  if (layout === 'rows') {
    const currentRound = options.currentRound ?? 1;
    const showActions = options.showActions ?? false;
    const panelHeights = Array.from({ length: GAMEPLAY.ROUNDS_PER_LEG }, (_, i) =>
      stackedPanelHeight(i + 1, currentRound, showActions),
    );
    const totalStackH =
      panelHeights.reduce((sum, h) => sum + h, 0) + gap * (GAMEPLAY.ROUNDS_PER_LEG - 1);
    const startY = bounds.y + Math.max(0, Math.floor((bounds.height - totalStackH) / 2));
    const panels: LegRoundPanelSlot[] = [];
    let y = startY;
    for (let r = 1; r <= GAMEPLAY.ROUNDS_PER_LEG; r++) {
      const panelH = panelHeights[r - 1]!;
      panels.push({
        round: r,
        x: bounds.x,
        y,
        width: bounds.width,
        height: panelH,
      });
      y += panelH + gap;
    }
    return { panels, layout, compact, gap };
  }

  const colW = Math.min(compact ? 170 : 220, (bounds.width - gap * 2) / 3);
  const totalW = colW * 3 + gap * 2;
  const startX = bounds.x + (bounds.width - totalW) / 2;
  const panels: LegRoundPanelSlot[] = [];
  for (let r = 1; r <= GAMEPLAY.ROUNDS_PER_LEG; r++) {
    panels.push({
      round: r,
      x: startX + (r - 1) * (colW + gap),
      y: bounds.y,
      width: colW,
      height: bounds.height,
    });
  }
  return { panels, layout, compact, gap };
}

/** Build three round columns for the current leg within a bounding box. */
export function createLegRoundPanels(scene: Scene, config: LegRoundPanelsConfig): RoundInfoPanel[] {
  const geometry = computeLegRoundPanelGeometry(config.bounds, {
    gap: config.gap,
    compact: config.compact,
    layout: config.layout,
    currentRound: config.currentRound,
    showActions: config.showActions,
  });
  const panels: RoundInfoPanel[] = [];

  for (const slot of geometry.panels) {
    const r = slot.round;
    const state = getRoundColumnState(r, config.currentRound, config.skippedRoundsThisLeg);
    const isSkippable = r <= 2;
    const skipPreviewTag =
      isSkippable && !config.skippedRoundsThisLeg.includes(r) ? config.getSkipPreviewTagForRound?.(r) : undefined;
    const panel = new RoundInfoPanel(scene, slot.x, slot.y, slot.width, slot.height, {
      round: r,
      state,
      leg: config.leg,
      difficulty: config.difficulty,
      permitScoreReduction: config.permitScoreReduction,
      skippedTag: config.getSkippedTagForRound(r),
      skipPreviewTag,
      showActions: config.showActions,
      compact: geometry.compact,
      stacked: geometry.layout === 'rows',
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
  const run = getRunState();
  return createLegRoundPanels(scene, {
    bounds,
    currentRound: run.round,
    leg: run.leg,
    difficulty: run.difficulty,
    permitScoreReduction: run.permitScoreReduction,
    skippedRoundsThisLeg: run.skippedRoundsThisLeg,
    getSkippedTagForRound: (r) => selectSkippedTagForRound(run, r),
    getSkipPreviewTagForRound: (r) => selectSkipPreviewTagForRound(run, r),
    ...options,
  });
}

export class RoundInfoPanel extends GameObjects.Container {
  constructor(scene: Scene, x: number, y: number, width: number, height: number, config: RoundInfoConfig) {
    super(scene, x, y);
    const depth = config.depth ?? 0;
    this.setDepth(depth);

    const compact = config.compact ?? false;
    const stacked = config.stacked ?? false;
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
      selectBossPermitRerollLimit(getRunState()) !== 0;

    this.drawPanelBackground(scene, width, height, isActive, isSkipped);

    if (stacked) {
      this.buildStackedContent(scene, x, y, width, height, config, {
        depth,
        round,
        isBoss,
        isSkipped,
        isUpcoming,
        showRoundActions,
        showBossReroll,
      });
      return;
    }

    this.buildColumnContent(scene, x, y, width, height, config, {
      depth,
      compact,
      round,
      isBoss,
      isSkipped,
      isActive,
      isUpcoming,
      showRoundActions,
      showBossReroll,
    });
  }

  private drawPanelBackground(
    scene: Scene,
    width: number,
    height: number,
    isActive: boolean,
    isSkipped: boolean,
  ): void {
    const bg = scene.add.graphics();
    const bgColor = isActive ? 0x1a2a1a : isSkipped ? 0x151520 : 0x0d0d1a;
    const borderColor = isActive ? 0xcc7722 : isSkipped ? 0x444466 : 0x333355;
    bg.fillStyle(bgColor, 0.9);
    bg.fillRoundedRect(0, 0, width, height, 12);
    bg.lineStyle(isActive ? 3 : 2, borderColor, isActive ? 1 : 0.55);
    bg.strokeRoundedRect(0, 0, width, height, 12);
    this.add(bg);
  }

  private buildColumnContent(
    scene: Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    config: RoundInfoConfig,
    ctx: {
      depth: number;
      compact: boolean;
      round: number;
      isBoss: boolean;
      isSkipped: boolean;
      isActive: boolean;
      isUpcoming: boolean;
      showRoundActions: boolean;
      showBossReroll: boolean;
    },
  ): void {
    const { depth, compact, round, isBoss, isSkipped, isUpcoming, showRoundActions, showBossReroll } = ctx;
    const cx = width / 2;
    let cy = compact ? 16 : 22;

    const headerLabels = this.headerLabels();
    const headerColors = this.headerColors();

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
      const boss = selectBossForLeg(getRunState(), config.leg);
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

    this.addRewardLabel(cx, cy, round, config.difficulty, compact);

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

    this.addColumnActions(scene, x, y, width, height, config, {
      depth,
      isBoss,
      showRoundActions,
      showBossReroll,
    });
  }

  private buildStackedContent(
    scene: Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    config: RoundInfoConfig,
    ctx: {
      depth: number;
      round: number;
      isBoss: boolean;
      isSkipped: boolean;
      isUpcoming: boolean;
      showRoundActions: boolean;
      showBossReroll: boolean;
    },
  ): void {
    const { depth, round, isBoss, isSkipped, isUpcoming, showRoundActions, showBossReroll } = ctx;
    const hasSkip = showRoundActions && !isBoss && !!config.skipPreviewTag;
    const hasActionRow = showRoundActions || showBossReroll;
    const actionBlockH = hasActionRow ? STACK_BTN_H + STACK_STATS_GAP : 0;
    const textMaxW = width - STACK_PAD * 2 - STACK_ART - 10;
    const headerLabels = this.headerLabels();
    const headerColors = this.headerColors();

    this.addStackedTopRightArt(scene, width, round, isBoss, config.leg);

    let ty = STACK_PAD + 2;
    this.addLeftLabel(STACK_PAD, ty, headerLabels[config.state], {
      fontSize: '10px',
      color: headerColors[config.state],
    });
    ty += 13;

    let dividerY: number;
    let statsLabelY: number;

    if (isBoss) {
      const statsBottom = height - STACK_PAD - actionBlockH;
      statsLabelY = statsBottom - STACK_STATS_ROW_H;
      dividerY = statsLabelY - STACK_STATS_GAP;
      const headerBottom = dividerY - STACK_DIVIDER_GAP;

      ty += this.addStackedWrappedLabel(STACK_PAD, ty, ROUND_NAMES[round - 1], headerBottom, {
        fontFamily: FONTS.HEADING,
        fontSize: '14px',
        color: isUpcoming ? TEXT_COLORS.MUTED : TEXT_COLORS.PRIMARY,
        wordWrap: { width: textMaxW },
      });

      const boss = selectBossForLeg(getRunState(), config.leg);
      if (boss) {
        ty += this.addStackedWrappedLabel(STACK_PAD, ty, boss.name, headerBottom, {
          fontFamily: FONTS.HEADING,
          fontSize: '11px',
          color: TEXT_COLORS.GOLD,
          wordWrap: { width: textMaxW },
        });
        ty += this.addStackedWrappedLabel(STACK_PAD, ty, boss.description, headerBottom, {
          fontSize: '10px',
          color: TEXT_COLORS.SECONDARY,
          wordWrap: { width: textMaxW },
        });
      }
    } else {
      ty += this.addStackedWrappedLabel(STACK_PAD, ty, ROUND_NAMES[round - 1], height, {
        fontFamily: FONTS.HEADING,
        fontSize: '14px',
        color: isUpcoming ? TEXT_COLORS.MUTED : TEXT_COLORS.PRIMARY,
        wordWrap: { width: textMaxW },
      });
      dividerY = ty + STACK_DIVIDER_GAP;
      statsLabelY = dividerY + STACK_STATS_GAP;
    }

    const divider = scene.add.graphics();
    divider.lineStyle(1, 0x444466, 0.45);
    divider.lineBetween(STACK_PAD, dividerY, width - STACK_PAD, dividerY);
    this.add(divider);

    const target = targetMilesForRound(config.leg, round, config.permitScoreReduction, config.difficulty);
    const showPreviewTag = !hasActionRow && !isBoss && !!config.skipPreviewTag;
    const hasStatsRowTag = showPreviewTag || (isSkipped && !!config.skippedTag);
    const scoreX = hasStatsRowTag ? STACK_PAD + ROW_TAG_SIZE + 20 : STACK_PAD;
    this.addLeftLabel(scoreX, statsLabelY, 'Score at least', {
      fontSize: '10px',
      color: TEXT_COLORS.SECONDARY,
    });
    this.addLeftLabel(scoreX, statsLabelY + 13, formatScore(target), {
      fontFamily: FONTS.HEADING,
      fontSize: '15px',
      color: TEXT_COLORS.SCORE_GREEN,
    });
    this.addStackedRewardLabel(width - STACK_PAD, statsLabelY, round, config.difficulty);

    if (isSkipped) {
      if (config.skippedTag) {
        this.addRoundTagDisplay(config.skippedTag, config, statsLabelY - 2, true);
      }
      const stamp = scene.add
        .text(width * 0.62, statsLabelY + 8, 'SKIPPED', {
          fontFamily: FONTS.HEADING,
          fontSize: '16px',
          color: TEXT_COLORS.ERROR_RED,
        })
        .setOrigin(0.5)
        .setRotation(-0.25)
        .setAlpha(0.75);
      this.add(stamp);
    } else if (showPreviewTag) {
      this.addRoundTagDisplay(config.skipPreviewTag!, config, height - STACK_PAD - ROW_TAG_SIZE, true);
    }

    this.addStackedActions(scene, x, y, width, height, config, {
      depth,
      showRoundActions,
      showBossReroll,
      hasSkip,
    });
  }

  private addStackedTopRightArt(scene: Scene, width: number, round: number, isBoss: boolean, leg: number): void {
    const artCx = width - STACK_PAD - STACK_ART / 2;
    const artCy = STACK_PAD + STACK_ART / 2;

    if (isBoss) {
      const boss = selectBossForLeg(getRunState(), leg);
      if (boss) {
        this.addBossPortrait(artCx, artCy, boss.id, BOSS_PORTRAIT_SIZE.stacked);
      }
      return;
    }

    const emblem = scene.add.graphics();
    const emblemColor = round === 1 ? 0x666688 : 0x448866;
    emblem.fillStyle(emblemColor, 1);
    emblem.fillCircle(artCx, artCy, STACK_EMBLEM_R);
    emblem.lineStyle(2, 0xffffff, 0.4);
    emblem.strokeCircle(artCx, artCy, STACK_EMBLEM_R);
    this.add(emblem);
  }

  private addStackedRewardLabel(rightX: number, y: number, round: number, difficulty: DifficultyLevel): void {
    const roundReward = computeRoundReward(round, difficulty);
    if (roundReward === 0) {
      this.addRightLabel(rightX, y, 'No reward', {
        fontSize: '10px',
        color: TEXT_COLORS.ERROR_RED,
      });
      this.addRightLabel(rightX, y + 13, 'Thin Supplies', {
        fontSize: '10px',
        color: TEXT_COLORS.ERROR_RED,
      });
      return;
    }

    this.addRightLabel(rightX, y, 'Reward', {
      fontSize: '10px',
      color: TEXT_COLORS.SECONDARY,
    });
    const rewardDollars = '$'.repeat(roundReward);
    this.addRightLabel(rightX, y + 13, `${rewardDollars}+`, {
      fontFamily: FONTS.HEADING,
      fontSize: '14px',
      color: TEXT_COLORS.MONEY,
    });
  }

  private addColumnActions(
    scene: Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    config: RoundInfoConfig,
    ctx: { depth: number; isBoss: boolean; showRoundActions: boolean; showBossReroll: boolean },
  ): void {
    const { depth, isBoss, showRoundActions, showBossReroll } = ctx;
    if (!showBossReroll && !showRoundActions) return;

    const bottomY = height - COL_PAD;
    const hasSkip = showRoundActions && !isBoss && !!config.skipPreviewTag;
    let actionY = bottomY - BTN_H / 2;
    const absX = x + width / 2;

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
          skipBtn.on('pointerover', () => config.onTagHover!(tag, config.round, ax, ay));
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

  private addStackedActions(
    scene: Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    config: RoundInfoConfig,
    ctx: {
      depth: number;
      showRoundActions: boolean;
      showBossReroll: boolean;
      hasSkip: boolean;
    },
  ): void {
    const { depth, showRoundActions, showBossReroll, hasSkip } = ctx;
    if (!showBossReroll && !showRoundActions) return;

    const btnH = STACK_BTN_H;
    const actionY = y + height - STACK_PAD - btnH / 2;
    const innerLeft = x + STACK_PAD;
    const innerW = width - STACK_PAD * 2;
    const gap = 6;

    if (showRoundActions && hasSkip && config.skipPreviewTag) {
      const tag = config.skipPreviewTag;
      const tagX = STACK_PAD;
      const tagY = height - STACK_PAD - btnH;
      const buttonsW = innerW - ROW_TAG_SIZE - gap;
      const skipW = Math.floor(buttonsW * 0.4);
      const playW = buttonsW - skipW - gap;
      const skipCenterX = innerLeft + ROW_TAG_SIZE + gap + skipW / 2;
      const playCenterX = innerLeft + ROW_TAG_SIZE + gap + skipW + gap + playW / 2;

      this.addTagBadge(tagX, tagY, tag, ROW_TAG_SIZE, config);
      const skipBtn = new Button(scene, skipCenterX, actionY, 'Skip', skipW, btnH)
        .setColor(0x8b2020, 0xb03030)
        .setDepth(depth + 5);
      if (config.onSkip) skipBtn.onClick(config.onSkip);
      this.registerButton(skipBtn);

      const playBtn = new Button(scene, playCenterX, actionY, 'Play Round', playW, btnH)
        .setColor(0x2d6b2d, 0x3d8b3d)
        .setDepth(depth + 5);
      if (config.onPlay) playBtn.onClick(config.onPlay);
      this.registerButton(playBtn);

      if (config.onTagHover) {
        const ax = x + tagX + ROW_TAG_SIZE / 2;
        const ay = y + tagY;
        skipBtn.on('pointerover', () => config.onTagHover!(tag, config.round, ax, ay));
        skipBtn.on('pointerout', () => config.onTagHoverEnd?.());
      }
      return;
    }

    if (showRoundActions && showBossReroll) {
      const btnW = (innerW - gap) / 2;
      const rerollCenterX = innerLeft + btnW / 2;
      const playCenterX = innerLeft + btnW + gap + btnW / 2;

      const rerollBtn = new Button(scene, rerollCenterX, actionY, 'Reroll $10', btnW, btnH)
        .setColor(0x6b2d6b, 0x8b3d8b)
        .setDepth(depth + 5);
      rerollBtn.setEnabled(config.canRerollBoss?.() ?? true);
      rerollBtn.onClick(config.onRerollBoss!);
      this.registerButton(rerollBtn);

      const playBtn = new Button(scene, playCenterX, actionY, 'Play Round', btnW, btnH)
        .setColor(0x2d6b2d, 0x3d8b3d)
        .setDepth(depth + 5);
      if (config.onPlay) playBtn.onClick(config.onPlay);
      this.registerButton(playBtn);
      return;
    }

    if (showRoundActions) {
      const playBtn = new Button(scene, x + width / 2, actionY, 'Play Round', innerW, btnH)
        .setColor(0x2d6b2d, 0x3d8b3d)
        .setDepth(depth + 5);
      if (config.onPlay) playBtn.onClick(config.onPlay);
      this.registerButton(playBtn);
      return;
    }

    if (showBossReroll) {
      const rerollBtn = new Button(scene, x + width / 2, actionY, 'Reroll $10', innerW, btnH)
        .setColor(0x6b2d6b, 0x8b3d8b)
        .setDepth(depth + 5);
      rerollBtn.setEnabled(config.canRerollBoss?.() ?? true);
      rerollBtn.onClick(config.onRerollBoss!);
      this.registerButton(rerollBtn);
    }
  }

  private headerLabels(): Record<RoundColumnState, string> {
    return {
      skipped: 'Skipped',
      complete: 'Complete',
      select: 'Select',
      upcoming: 'Upcoming',
    };
  }

  private headerColors(): Record<RoundColumnState, string> {
    return {
      skipped: TEXT_COLORS.ERROR_RED,
      complete: TEXT_COLORS.SCORE_GREEN,
      select: '#ffaa44',
      upcoming: TEXT_COLORS.SECONDARY,
    };
  }

  private addRewardLabel(
    x: number,
    y: number,
    round: number,
    difficulty: DifficultyLevel,
    compact: boolean,
    align: 'center' | 'left' = 'center',
  ): void {
    const roundReward = computeRoundReward(round, difficulty);
    const style = {
      fontSize: compact ? '11px' : '12px',
    };
    if (roundReward === 0) {
      const label = 'Thin Supplies: No reward';
      if (align === 'left') {
        this.addLeftLabel(x, y, label, { ...style, color: TEXT_COLORS.ERROR_RED });
      } else {
        this.addLabel(x, y, label, { ...style, color: TEXT_COLORS.ERROR_RED });
      }
      return;
    }

    const rewardDollars = '$'.repeat(roundReward);
    const label = `Reward: ${rewardDollars}+`;
    if (align === 'left') {
      this.addLeftLabel(x, y, label, { ...style, color: TEXT_COLORS.MONEY });
    } else {
      this.addLabel(x, y, label, { ...style, color: TEXT_COLORS.MONEY });
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
    const atlasFrame = `${bossId}.png`;
    const bossTexture = this.scene.textures.get('bosses');
    const canUseAtlas = this.scene.textures.exists('bosses') && bossTexture.has(atlasFrame);
    if (canUseAtlas) {
      const img = this.scene.add.image(cx, cy, 'bosses', atlasFrame);
      img.setScale(size / Math.max(img.width, img.height));
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

  private addLeftLabel(x: number, y: number, content: string, style: Phaser.Types.GameObjects.Text.TextStyle): void {
    const text = this.scene.add
      .text(x, y, content, {
        fontFamily: FONTS.PRIMARY,
        ...style,
      })
      .setOrigin(0, 0);
    this.add(text);
  }

  /** Left-aligned label that advances layout by measured height, clamped to a header ceiling. */
  private addStackedWrappedLabel(
    x: number,
    y: number,
    content: string,
    headerBottom: number,
    style: Phaser.Types.GameObjects.Text.TextStyle,
  ): number {
    if (y >= headerBottom) return 0;

    const text = this.scene.add
      .text(x, y, content, {
        fontFamily: FONTS.PRIMARY,
        ...style,
      })
      .setOrigin(0, 0);
    const maxH = headerBottom - y;
    if (text.height > maxH) {
      text.setCrop(0, 0, text.width, maxH);
    }
    this.add(text);
    return Math.min(text.height, maxH) + 4;
  }

  private addRightLabel(x: number, y: number, content: string, style: Phaser.Types.GameObjects.Text.TextStyle): void {
    const text = this.scene.add
      .text(x, y, content, {
        fontFamily: FONTS.PRIMARY,
        ...style,
      })
      .setOrigin(1, 0);
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
        config.onTagHover!(tag, config.round, matrix.tx + x + size / 2, matrix.ty + y);
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
