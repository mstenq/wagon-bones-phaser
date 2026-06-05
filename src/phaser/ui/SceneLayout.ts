// ─── SceneLayout ───
// Shared layout scaffolding used by all main scenes (Game, Shop, BoosterPack).
// Creates sidebar, equipment bar, consumable bar, dice pouch, and computes
// content area metrics. Scenes call `createLayout()` and get back references
// to the shared UI elements plus layout dimensions.

import { Scene } from 'phaser';
import { COLORS, UI, GAMEPLAY, type LayoutMode } from '../../game/Constants';
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
import { BossTestModal } from './BossTestModal';
import { RoundModificationsModal } from './RoundModificationsModal';
import { isDevMode } from '../../game/DevMode';
import { startAutoSaveLoop } from '../AutoSaveManager';
import { ensureBackgroundMusic } from '../BackgroundMusic';

export type { LayoutMode } from '../../game/Constants';

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
}

/** True when the viewport is taller than wide (portrait). */
export function isPortraitLayout(width: number, height: number): boolean {
  return height > width;
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
  const equipBarH = Math.floor(UI.EQUIP_BAR_HEIGHT * uiScale);

  if (layoutMode === 'sidebar') {
    const sidebarW = Math.floor(width * UI.SIDEBAR_WIDTH_RATIO);
    const contentX = sidebarW + feltPadding;
    const contentW = width - sidebarW - feltPadding * 2;
    const contentCX = sidebarW + (width - sidebarW) / 2;
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
      equipBarY,
      feltX: sidebarW,
      feltY: 0,
      feltW: width - sidebarW,
      feltH: height,
      pouchMargin,
      modalRegion: { x: sidebarW, y: 0, w: width - sidebarW, h: height },
    };
  }

  const topBarH = Math.floor(UI.TOP_BAR_BASE_HEIGHT * uiScale);
  const sidebarW = 0;
  const contentX = feltPadding;
  const contentW = width - feltPadding * 2;
  const contentCX = width / 2;
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

/** Horizontal center of the main content area (excludes left sidebar / below top bar). */
export function getContentLayoutCenter(scene: Scene): { cx: number; cy: number } {
  const metrics = computeLayoutMetricsFromScene(scene);
  const cy = metrics.layoutMode === 'topbar' ? metrics.topBarH + metrics.feltH / 2 : scene.scale.height / 2;
  return { cx: metrics.contentCX, cy };
}

export interface LayoutOptions {
  /** Background texture key (e.g. 'bg_1', 'bg_shop'). If null, draws a solid color fill. */
  bgKey?: string | null;
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
    const bg = scene.add.image(width / 2, height / 2, opts.bgKey);
    const scale = Math.max(width / bg.width, height / bg.height);
    bg.setScale(scale);
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
    new JourneyInfoModal(scene, modalRegion.x, modalRegion.w, modalRegion.h, modalRegion.y);
  });
  sidebar.setOptionsCallback(() => {
    new OptionsModal(scene, modalRegion.x, modalRegion.w, modalRegion.h, modalRegion.y);
  });
  sidebar.setModifiersCallback(() => {
    new RoundModificationsModal(scene, modalRegion.x, modalRegion.w, modalRegion.h, modalRegion.y);
  });
  if (isDevMode()) {
    sidebar.setDevBossTestCallback(() => {
      new BossTestModal(scene, modalRegion.x, modalRegion.w, modalRegion.h, modalRegion.y);
    });
  }

  // ─── Felt overlay ───
  if (opts.felt !== false) {
    const felt = scene.add.graphics();
    felt.fillStyle(COLORS.BG_FELT, UI.FELT_ALPHA);
    felt.fillRoundedRect(metrics.feltX, metrics.feltY, metrics.feltW, metrics.feltH, 0);
  }

  // ─── Equipment bar (left 80%) + Consumable bar (right 20%) ───
  const barGap = 8;
  const equipW = Math.floor((metrics.contentW - barGap) * UI.EQUIP_BAR_RATIO);
  const consumableW = metrics.contentW - equipW - barGap;
  const equipBar = new EquipmentBar(scene, metrics.contentX, metrics.equipBarY, equipW, metrics.equipBarH);

  const consumableX = metrics.contentX + equipW + barGap;
  const consumableBar = new ConsumableBar(scene, consumableX, metrics.equipBarY, consumableW, metrics.equipBarH);

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
  };
}
