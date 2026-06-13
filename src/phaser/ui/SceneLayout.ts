// ─── SceneLayout ───
// Shared layout scaffolding used by all main scenes (Game, Shop, BoosterPack).
// Creates sidebar, equipment bar, consumable bar, dice pouch, and computes
// content area metrics. Scenes call `createLayout()` and get back references
// to the shared UI elements plus layout dimensions.

import { Scene, type GameObjects } from 'phaser';
import { COLORS, DICE, UI, GAMEPLAY, type LayoutMode } from '../../game/Constants';
import { computeDiceDisplayScale } from '../scenes/game/diceRowGeometry';
import { getRunState } from '../../game/store/runStore';
import { selectRunSidebarModel } from '../../game/store/selectors/uiSelectors';
import { selectRoundTotalMiles } from '../../game/store/selectors/roundSelectors';
import { Sidebar } from './Sidebar';
import { EquipmentBar } from './EquipmentBar';
import { ConsumableBar } from './ConsumableBar';
import { DicePouch } from './DicePouch';
import { TagStack } from './TagStack';
import { DicePouchModal } from './DicePouchModal';
import { JourneyInfoModal } from './JourneyInfoModal';
import { OptionsModal } from './OptionsModal';
import { openRunModalSingleton } from './modalShell';
import { RoundModificationsModal } from './RoundModificationsModal';
import { startAutoSaveLoop } from '../AutoSaveManager';
import { ensureBackgroundMusic } from '../BackgroundMusic';

export type { LayoutMode } from '../../game/Constants';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Shared card metrics for equipment and consumable bars. */
export interface CardBarMetrics {
  displayScale: number;
  cardScale: number;
  cardSpacing: number;
  barPadding: number;
  barHeight: number;
  /** Local Y for card centers (top-anchored inside the bar). */
  cardCenterY: number;
  /** Hide on-card hint chips; tooltips still work on tap (Balatro-style mobile). */
  hideCardHints: boolean;
}

export interface CardBarWidths {
  equipW: number;
  consumableW: number;
  barGap: number;
}

/** Shrink card bars when the content area is narrower than the dice-row compact breakpoint. */
export function computeCardBarDisplayScale(contentWidth: number): number {
  if (contentWidth >= UI.DICE_ROW_COMPACT_WIDTH) return 1;
  const minWidth = 360;
  const t = clamp01((contentWidth - minWidth) / (UI.DICE_ROW_COMPACT_WIDTH - minWidth));
  return UI.CARD_BAR_SCALE_MIN + t * (1 - UI.CARD_BAR_SCALE_MIN);
}

/** Minimum consumable bar width to fit two overlapping cards with side padding. */
export function computeMinConsumableBarWidth(cardBar: CardBarMetrics): number {
  const cardW = UI.CARD_W * cardBar.cardScale;
  const twoCardSpan = cardW + computeCompactCardSpacing(cardW);
  return Math.ceil(twoCardSpan + cardBar.barPadding * 2);
}

/** Split content width between equipment (left) and consumable (right) bars. */
export function computeCardBarWidths(contentW: number, cardBar: CardBarMetrics): CardBarWidths {
  const barGap = UI.CARD_BAR_GAP;
  const innerW = contentW - barGap;
  const isCompact = contentW < UI.DICE_ROW_COMPACT_WIDTH;

  if (!isCompact) {
    const equipW = Math.floor(innerW * UI.EQUIP_BAR_RATIO);
    return { equipW, consumableW: innerW - equipW, barGap };
  }

  const minConsumableW = computeMinConsumableBarWidth(cardBar);
  const maxConsumableW = Math.floor(innerW * UI.CONSUMABLE_BAR_COMPACT_MAX_RATIO);
  let consumableW = Math.min(maxConsumableW, Math.max(minConsumableW, Math.floor(innerW * 0.34)));
  const minEquipW = cardBar.barPadding * 2 + UI.CARD_W * cardBar.cardScale;
  const equipW = innerW - consumableW;
  if (equipW < minEquipW) {
    consumableW = Math.max(minConsumableW, innerW - minEquipW);
  }

  return { equipW: innerW - consumableW, consumableW, barGap };
}

/** Overlap spacing for consumable fan layout (supply / trail / frontier slots). */
export function computeCompactCardSpacing(cardWidth: number): number {
  return cardWidth * UI.CARD_BAR_COMPACT_SPACING_RATIO;
}

/** Spread cards in a row; shrink center-to-center spacing only when the row would overflow. */
export function computeFittedRowSpacing(
  count: number,
  areaWidth: number,
  cardWidth: number,
  preferredSpacing: number,
): number {
  if (count <= 1) return 0;
  const availableW = Math.max(0, areaWidth - cardWidth);
  const neededW = (count - 1) * preferredSpacing;
  if (neededW <= availableW) return preferredSpacing;
  if (availableW <= 0) return preferredSpacing;
  return availableW / (count - 1);
}

/** Unified equipment + consumable card sizing derived from content width. */
export function computeCardBarMetrics(contentWidth: number): CardBarMetrics {
  const displayScale = computeCardBarDisplayScale(contentWidth);
  const cardScale = UI.CARD_BAR_BASE_SCALE * displayScale;
  const cardHeight = UI.CARD_H * cardScale;
  const isCompact = contentWidth < UI.DICE_ROW_COMPACT_WIDTH;
  const cardSpacing = UI.CARD_BAR_SPACING * displayScale;
  const topInset = Math.max(6, Math.floor(UI.CARD_BAR_TOP_INSET * displayScale));
  const bottomPad = isCompact ? UI.CARD_BAR_HEIGHT_PAD_COMPACT : UI.CARD_BAR_HEIGHT_PAD;
  const barPadding = Math.max(8, Math.floor(UI.CARD_BAR_PADDING * displayScale));
  return {
    displayScale,
    cardScale,
    cardSpacing,
    barPadding,
    barHeight: Math.ceil(topInset + cardHeight + bottomPad * displayScale),
    cardCenterY: topInset + cardHeight / 2,
    hideCardHints: isCompact,
  };
}

export interface ModalRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutMetrics {
  width: number;
  height: number;
  layoutMode: LayoutMode;
  uiScale: number;
  sidebarW: number;
  topBarH: number;
  contentX: number;
  contentW: number;
  contentCX: number;
  contentTop: number;
  contentBottom: number;
  equipBarH: number;
  cardBar: CardBarMetrics;
  equipBarY: number;
  feltX: number;
  feltY: number;
  feltW: number;
  feltH: number;
  pouchMargin: number;
  modalRegion: ModalRegion;
}

export interface LayoutResult {
  sidebar: Sidebar;
  equipBar: EquipmentBar;
  consumableBar: ConsumableBar;
  dicePouch: DicePouch;
  tagStack: TagStack;
  layoutMode: LayoutMode;
  uiScale: number;
  /** Left edge of content area */
  contentX: number;
  /** Width of content area */
  contentW: number;
  /** Horizontal center of content area */
  contentCX: number;
  /** Sidebar width (0 in portrait) */
  sidebarW: number;
  /** Top bar height (0 in landscape) */
  topBarH: number;
  modalRegion: ModalRegion;
  /** Y where main content begins (below equipment + consumable bars) */
  contentTop: number;
  /** Y where main content ends (above dice pouch) */
  contentBottom: number;
  /** Equipment / consumable bar height (content-width responsive) */
  equipBarH: number;
  cardBar: CardBarMetrics;
}

/** True on narrow viewports (portrait top-bar layout). */
export function isPortraitLayout(width: number, _height: number): boolean {
  return width <= 970;
}

export type PortraitSelectActionBarLayout = {
  btnY: number;
  /** Reserved strip at bottom — scroll padding and drag hit-test guard */
  bottomBarH: number;
};

/** Portrait bottom action bar for profession/difficulty select scenes. */
export function computePortraitSelectActionBar(height: number): PortraitSelectActionBarLayout {
  const btnH = UI.PORTRAIT_SELECT_ACTION_BTN_H;
  const bottomPad = UI.PORTRAIT_SELECT_ACTION_BOTTOM_PAD;
  const btnY = height - bottomPad - btnH / 2;
  const bottomBarH = bottomPad + btnH + 8;
  return { btnY, bottomBarH };
}

/** Shrink chrome on narrow portrait viewports; capped at 1. */
export function computeUiScale(width: number, height: number): number {
  if (!isPortraitLayout(width, height)) {
    return 1;
  }
  const byWidth = width / UI.UI_SCALE_REF_WIDTH;
  return Math.max(UI.UI_SCALE_MIN, Math.min(1, byWidth));
}

export function computeLayoutMetrics(width: number, height: number): LayoutMetrics {
  const layoutMode: LayoutMode = isPortraitLayout(width, height) ? 'topbar' : 'sidebar';
  const uiScale = computeUiScale(width, height);
  const feltPadding = Math.floor(UI.FELT_PADDING * uiScale);
  const pouchMargin = Math.floor(UI.POUCH_MARGIN * uiScale);

  if (layoutMode === 'sidebar') {
    const sidebarW = UI.SIDEBAR_WIDTH;
    const contentX = sidebarW + feltPadding;
    const contentW = width - sidebarW - feltPadding * 2;
    const contentCX = sidebarW + (width - sidebarW) / 2;
    const cardBar = computeCardBarMetrics(contentW);
    const equipBarH = cardBar.barHeight;
    const equipBarY = 8;
    const contentTop = equipBarH + 16;
    const contentBottom = height - pouchMargin - UI.POUCH_SIZE - 8;
    return {
      width,
      height,
      layoutMode,
      uiScale,
      sidebarW,
      topBarH: 0,
      contentX,
      contentW,
      contentCX,
      contentTop,
      contentBottom,
      equipBarH,
      cardBar,
      equipBarY,
      feltX: sidebarW,
      feltY: 0,
      feltW: width - sidebarW,
      feltH: height,
      pouchMargin,
      modalRegion: { x: sidebarW, y: 0, w: width - sidebarW, h: height },
    };
  }

  const topBarH = UI.TOP_BAR_BASE_HEIGHT;
  const sidebarW = 0;
  const contentX = feltPadding;
  const contentW = width - feltPadding * 2;
  const contentCX = width / 2;
  const cardBar = computeCardBarMetrics(contentW);
  const equipBarH = cardBar.barHeight;
  const equipBarY = topBarH + 8;
  const contentTop = topBarH + equipBarH + 16;
  const contentBottom = height - pouchMargin - UI.POUCH_SIZE - 8;
  return {
    width,
    height,
    layoutMode,
    uiScale,
    sidebarW,
    topBarH,
    contentX,
    contentW,
    contentCX,
    contentTop,
    contentBottom,
    equipBarH,
    cardBar,
    equipBarY,
    feltX: 0,
    feltY: topBarH,
    feltW: width,
    feltH: height - topBarH,
    pouchMargin,
    modalRegion: { x: 0, y: topBarH, w: width, h: height - topBarH },
  };
}

export function computeLayoutMetricsFromScene(scene: Scene): LayoutMetrics {
  const { width, height } = scene.scale;
  return computeLayoutMetrics(width, height);
}

/** Bottom HUD positions for GameScene — keeps corner pouch / loaded-die clear. */
export interface GameHudLayout {
  btnY: number;
  /** Center X for solo action buttons (roll / continue) inside the corner-widget band */
  btnCenterX: number;
  instructionY: number;
  showInstruction: boolean;
  rollY: number;
  scoreY: number;
  bottomReserve: number;
  scoreBtnX: number;
  sortBtnX: number;
  rerollBtnX: number;
  scoreBtnW: number;
  sortBtnW: number;
  rerollBtnW: number;
}

/** Score row Y: ratio on landscape; die-aware gap above roll row on portrait. */
export function computeScoreRowY(height: number, rollY: number, portrait: boolean, contentWidth: number): number {
  if (!portrait) {
    return height * UI.SCORE_Y_RATIO;
  }
  const dieScale = computeDiceDisplayScale(contentWidth);
  const dieHeight = DICE.SIZE * dieScale;
  const arc = UI.DICE_ARC_HEIGHT * dieScale;
  const gap = UI.DICE_SCORE_FILLER_DROP_Y + dieHeight + arc + UI.SCORE_ROW_GAP_PAD;
  return rollY - gap;
}

function computeRollPhaseButtonBand(
  width: number,
  portrait: boolean,
  metrics: Pick<LayoutMetrics, 'contentX' | 'contentCX' | 'pouchMargin'>,
): { left: number; right: number; centerX: number } {
  if (portrait) {
    // Buttons sit above corner widgets — use content padding, not loaded-die width.
    const left = metrics.contentX;
    const right = width - metrics.contentX;
    return { left, right, centerX: (left + right) / 2 };
  }
  const left = metrics.contentX;
  const right = width - metrics.pouchMargin - UI.POUCH_SIZE;
  return { left, right, centerX: metrics.contentCX };
}

function computeRollPhaseButtonPositions(
  left: number,
  right: number,
  centerX: number,
  scoreW: number,
  sortW: number,
  rerollW: number,
  gap: number,
): { scoreBtnX: number; sortBtnX: number; rerollBtnX: number } {
  const trioW = scoreW + gap + sortW + gap + rerollW;
  const startX = Math.max(left, Math.min(right - trioW, centerX - trioW / 2));

  return {
    scoreBtnX: startX + scoreW / 2,
    sortBtnX: startX + scoreW + gap + sortW / 2,
    rerollBtnX: startX + scoreW + gap + sortW + gap + rerollW / 2,
  };
}

export function computeGameHudLayout(
  width: number,
  height: number,
  _contentCX: number,
  contentWidth: number,
): GameHudLayout {
  const portrait = isPortraitLayout(width, height);
  const metrics = computeLayoutMetrics(width, height);
  const cornerH = metrics.pouchMargin + UI.POUCH_SIZE;
  const btnHalfH = 20;

  let btnY: number;
  if (portrait) {
    btnY = height - cornerH - btnHalfH - 10 - UI.GAME_HUD_PORTRAIT_LIFT;
  } else {
    btnY = height - UI.GAME_BOTTOM_BTN_MARGIN;
  }

  const showInstruction = !portrait;
  const instructionY = btnY - UI.GAME_INSTRUCTION_ABOVE_BTN;

  const rollYRatio = portrait ? UI.GAME_ROLL_Y_RATIO_PORTRAIT : UI.ROLL_Y_RATIO;
  const diceYOffset = portrait ? UI.GAME_PORTRAIT_DICE_Y_OFFSET : 0;
  const rollY = height * rollYRatio + diceYOffset;
  const scoreY = computeScoreRowY(height, rollY, portrait, contentWidth);

  const scoreBtnW = portrait ? UI.GAME_HUD_SCORE_BTN_W_PORTRAIT : 160;
  const sortBtnW = UI.GAME_HUD_SORT_BTN_SIZE;
  const rerollBtnW = portrait ? UI.GAME_HUD_REROLL_BTN_W_PORTRAIT : UI.GAME_HUD_REROLL_BTN_W;
  const btnGap = portrait ? UI.GAME_HUD_BTN_GAP_PORTRAIT : UI.GAME_HUD_BTN_GAP;
  const { left, right, centerX } = computeRollPhaseButtonBand(width, portrait, metrics);
  const btnCenterX = centerX;

  const { scoreBtnX, sortBtnX, rerollBtnX } = computeRollPhaseButtonPositions(
    left,
    right,
    centerX,
    scoreBtnW,
    sortBtnW,
    rerollBtnW,
    btnGap,
  );

  const hudTop = btnY - btnHalfH;
  const bottomReserve = height - hudTop + 16;

  return {
    btnY,
    btnCenterX,
    instructionY,
    showInstruction,
    rollY,
    scoreY,
    bottomReserve,
    scoreBtnX,
    sortBtnX,
    rerollBtnX,
    scoreBtnW,
    sortBtnW,
    rerollBtnW,
  };
}

/** Horizontal center of the main content area (excludes left sidebar / below top bar). */
export function getContentLayoutCenter(scene: Scene): { cx: number; cy: number } {
  const metrics = computeLayoutMetricsFromScene(scene);
  const cy = metrics.layoutMode === 'topbar' ? metrics.topBarH + metrics.feltH / 2 : scene.scale.height / 2;
  return { cx: metrics.contentCX, cy };
}

export interface BackgroundCoverRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Play area to the right of the sidebar or below the top bar — not covered by chrome. */
export function getContentBackgroundRegion(metrics: LayoutMetrics): BackgroundCoverRegion {
  return {
    x: metrics.feltX,
    y: metrics.feltY,
    w: metrics.feltW,
    h: metrics.feltH,
  };
}

/** Cover-scale an image into a region (centered, no letterboxing). */
export function applyCoverBackgroundImage(image: GameObjects.Image, region: BackgroundCoverRegion): void {
  const cx = region.x + region.w / 2;
  const cy = region.y + region.h / 2;
  image.setPosition(cx, cy);
  const scale = Math.max(region.w / image.width, region.h / image.height);
  image.setScale(scale);
}

/** Fit-scale an image into a region (centered, letterboxed). Returns the displayed image bounds. */
export function applyFitBackgroundImage(image: GameObjects.Image, region: BackgroundCoverRegion): BackgroundCoverRegion {
  const cx = region.x + region.w / 2;
  const cy = region.y + region.h / 2;
  image.setPosition(cx, cy);
  const scale = Math.min(region.w / image.width, region.h / image.height);
  image.setScale(scale);
  const displayW = image.width * scale;
  const displayH = image.height * scale;
  return {
    x: cx - displayW / 2,
    y: cy - displayH / 2,
    w: displayW,
    h: displayH,
  };
}

export interface LayoutOptions {
  /** Background texture key (e.g. 'bg_1', 'bg_shop'). If null, draws a solid color fill. */
  bgKey?: string | null;
  /**
   * 'screen' — full canvas (shop, etc.).
   * 'content' — cover the play area beside/below sidebar chrome so less art sits behind HUD.
   */
  bgRegion?: 'screen' | 'content';
  /** Whether to draw the felt overlay behind the content area (default true) */
  felt?: boolean;
  /** Sidebar title override */
  sidebarTitle?: string;
}

/**
 * Creates the shared layout elements that every scene needs:
 * background, sidebar, equipment bar, consumable bar, dice pouch.
 */
export function createLayout(scene: Scene, options?: LayoutOptions): LayoutResult {
  const { width, height } = scene.scale;
  const metrics = computeLayoutMetrics(width, height);
  const run = getRunState();
  const opts = options ?? {};

  if (run.professionId) {
    ensureBackgroundMusic(scene);
    startAutoSaveLoop();
  }

  // ─── Background ───
  if (opts.bgKey) {
    const bg = scene.add.image(0, 0, opts.bgKey);
    if (opts.bgRegion === 'content') {
      applyCoverBackgroundImage(bg, getContentBackgroundRegion(metrics));
    } else {
      bg.setPosition(width / 2, height / 2);
      const scale = Math.max(width / bg.width, height / bg.height);
      bg.setScale(scale);
    }
  } else if (opts.bgKey === null) {
    const bg = scene.add.graphics();
    bg.fillStyle(COLORS.BG_PRIMARY, 1);
    bg.fillRect(0, 0, width, height);
  }

  // ─── Sidebar / TopBar ───
  const sidebarW = metrics.layoutMode === 'topbar' ? metrics.width : metrics.sidebarW;
  const sidebarH = metrics.layoutMode === 'topbar' ? metrics.topBarH : metrics.height;
  const sidebar = new Sidebar(scene, sidebarW, sidebarH, metrics.layoutMode);
  if (opts.sidebarTitle) {
    const model = selectRunSidebarModel(run);
    const roundMiles = selectRoundTotalMiles();
    sidebar.updateData({
      title: opts.sidebarTitle,
      roundScore: roundMiles ?? 0,
      milesBase: 0,
      mult: 0,
      daysRemaining: model.daysRemaining,
      rerolls: model.rerolls,
      leg: model.leg,
      round: model.round,
      totalRounds: GAMEPLAY.ROUNDS_PER_LEG,
      targetMiles: model.targetMiles,
    });
  }
  const { modalRegion } = metrics;
  sidebar.setJourneyInfoCallback(() => {
    openRunModalSingleton(
      scene,
      'journey-info',
      () => new JourneyInfoModal(scene, modalRegion.x, modalRegion.w, modalRegion.h, modalRegion.y),
    );
  });
  sidebar.setOptionsCallback(() => {
    openRunModalSingleton(
      scene,
      'options',
      () => new OptionsModal(scene, modalRegion.x, modalRegion.w, modalRegion.h, modalRegion.y),
    );
  });
  sidebar.setModifiersCallback(() => {
    new RoundModificationsModal(scene, modalRegion.x, modalRegion.w, modalRegion.h, modalRegion.y);
  });

  // ─── Felt overlay ───
  if (opts.felt !== false) {
    const felt = scene.add.graphics();
    felt.fillStyle(COLORS.BG_FELT, UI.FELT_ALPHA);
    felt.fillRoundedRect(metrics.feltX, metrics.feltY, metrics.feltW, metrics.feltH, 0);
  }

  // ─── Equipment bar (left) + Consumable bar (right) ───
  const { equipW, consumableW, barGap } = computeCardBarWidths(metrics.contentW, metrics.cardBar);
  const equipBar = new EquipmentBar(
    scene,
    metrics.contentX,
    metrics.equipBarY,
    equipW,
    metrics.equipBarH,
    metrics.cardBar,
  );

  const consumableX = metrics.contentX + equipW + barGap;
  const consumableBar = new ConsumableBar(
    scene,
    consumableX,
    metrics.equipBarY,
    consumableW,
    metrics.equipBarH,
    metrics.cardBar,
  );

  // Card bars above sidebar/topbar so cards, tabs, and drag lifts overlap HUD chrome.
  sidebar.setDepth(UI.SIDEBAR_DEPTH);
  equipBar.setDepth(UI.EQUIP_BAR_DEPTH);
  consumableBar.setDepth(UI.CONSUMABLE_BAR_DEPTH);

  // ─── Dice Pouch (bottom-right) ───
  const pouchX = width - metrics.pouchMargin - UI.POUCH_SIZE;
  const pouchY = height - metrics.pouchMargin - UI.POUCH_SIZE;
  const dicePouch = new DicePouch(scene, pouchX, pouchY);
  dicePouch.setClickCallback(() => {
    new DicePouchModal(scene, modalRegion.x, modalRegion.w, modalRegion.h, modalRegion.y);
  });

  const tagStack = new TagStack(scene, pouchX, pouchY);

  return {
    sidebar,
    equipBar,
    consumableBar,
    dicePouch,
    tagStack,
    layoutMode: metrics.layoutMode,
    uiScale: metrics.uiScale,
    contentX: metrics.contentX,
    contentW: metrics.contentW,
    contentCX: metrics.contentCX,
    sidebarW: metrics.sidebarW,
    topBarH: metrics.topBarH,
    modalRegion: metrics.modalRegion,
    contentTop: metrics.contentTop,
    contentBottom: metrics.contentBottom,
    equipBarH: metrics.equipBarH,
    cardBar: metrics.cardBar,
  };
}
