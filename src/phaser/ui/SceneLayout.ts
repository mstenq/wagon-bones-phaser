// ─── SceneLayout ───
// Shared layout scaffolding used by all main scenes (Game, Shop, BoosterPack).
// Creates sidebar, equipment bar, consumable bar, dice pouch, and computes
// content area metrics. Scenes call `createLayout()` and get back references
// to the shared UI elements plus layout dimensions.

import { Scene } from 'phaser';
import { COLORS, UI, GAMEPLAY } from '../../game/Constants';
import { EventBus, Events } from '../../game/EventBus';
import { getPlayerState } from '../../game/PlayerState';
import { Sidebar } from './Sidebar';
import { EquipmentBar } from './EquipmentBar';
import { ConsumableBar } from './ConsumableBar';
import { DicePouch } from './DicePouch';
import { TagStack } from './TagStack';
import { DicePouchModal } from './DicePouchModal';
import { JourneyInfoModal } from './JourneyInfoModal';
import { OptionsModal } from './OptionsModal';
import { BossTestModal } from './BossTestModal';
import { isDevMode } from '../../game/DevMode';
import { startAutoSaveLoop } from '../AutoSaveManager';
import { ensureBackgroundMusic } from '../BackgroundMusic';

export interface LayoutResult {
  sidebar: Sidebar;
  equipBar: EquipmentBar;
  consumableBar: ConsumableBar;
  dicePouch: DicePouch;
  tagStack: TagStack;
  /** Left edge of content area */
  contentX: number;
  /** Width of content area */
  contentW: number;
  /** Horizontal center of content area */
  contentCX: number;
  /** Sidebar width */
  sidebarW: number;
  /** Y where main content begins (below equipment + consumable bars) */
  contentTop: number;
  /** Y where main content ends (above dice pouch) */
  contentBottom: number;
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
  const player = getPlayerState();
  const opts = options ?? {};

  if (player.profession) {
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

  // ─── Sidebar ───
  const sidebarW = Math.floor(width * UI.SIDEBAR_WIDTH_RATIO);
  const sidebar = new Sidebar(scene, sidebarW, height);
  if (opts.sidebarTitle) {
    sidebar.updateData({
      title: opts.sidebarTitle,
      roundScore: 0,
      milesBase: 0,
      mult: 0,
      daysRemaining: player.effectiveDays,
      rerolls: player.effectiveRerolls,
      leg: player.leg,
      totalLegs: player.endlessMode ? undefined : GAMEPLAY.LEGS,
      round: player.round,
      totalRounds: GAMEPLAY.ROUNDS_PER_LEG,
      targetMiles: player.targetMiles,
    });
  }
  sidebar.setJourneyInfoCallback(() => {
    new JourneyInfoModal(scene, sidebarW, width - sidebarW, height);
  });
  sidebar.setOptionsCallback(() => {
    new OptionsModal(scene, sidebarW, width - sidebarW, height);
  });
  if (isDevMode()) {
    sidebar.setDevBossTestCallback(() => {
      new BossTestModal(scene, sidebarW, width - sidebarW, height);
    });
  }

  // ─── Content area metrics ───
  const contentX = sidebarW + UI.FELT_PADDING;
  const contentW = width - sidebarW - UI.FELT_PADDING * 2;
  const contentCX = sidebarW + (width - sidebarW) / 2;

  // ─── Felt overlay ───
  if (opts.felt !== false) {
    const felt = scene.add.graphics();
    felt.fillStyle(COLORS.BG_FELT, UI.FELT_ALPHA);
    felt.fillRoundedRect(sidebarW, 0, width - sidebarW, height, 0);
  }

  // ─── Equipment bar (left 80%) + Consumable bar (right 20%) ───
  const equipBarH = UI.EQUIP_BAR_HEIGHT;
  const barGap = 8;
  const equipW = Math.floor((contentW - barGap) * UI.EQUIP_BAR_RATIO);
  const consumableW = contentW - equipW - barGap;
  const equipBar = new EquipmentBar(scene, contentX, 8, equipW, equipBarH);

  const consumableX = contentX + equipW + barGap;
  const consumableBar = new ConsumableBar(scene, consumableX, 8, consumableW, equipBarH);

  // ─── Dice Pouch (bottom-right) ───
  const pouchX = width - UI.POUCH_MARGIN - UI.POUCH_SIZE;
  const pouchY = height - UI.POUCH_MARGIN - UI.POUCH_SIZE;
  const dicePouch = new DicePouch(scene, pouchX, pouchY);
  dicePouch.setClickCallback(() => {
    new DicePouchModal(scene, sidebarW, width - sidebarW, height);
  });

  const tagStack = new TagStack(scene, pouchX, pouchY);
  const onTagStateChange = () => tagStack.refresh();
  const unregisterTagListeners = () => {
    EventBus.off(Events.TAG_EARNED, onTagStateChange);
    EventBus.off(Events.ROUND_SKIPPED, onTagStateChange);
    EventBus.off(Events.TAG_QUEUE_CHANGED, onTagStateChange);
  };
  EventBus.on(Events.TAG_EARNED, onTagStateChange);
  EventBus.on(Events.ROUND_SKIPPED, onTagStateChange);
  EventBus.on(Events.TAG_QUEUE_CHANGED, onTagStateChange);
  tagStack.on('destroy', unregisterTagListeners);
  scene.events.once('shutdown', unregisterTagListeners);

  const contentTop = equipBarH + 16;
  const contentBottom = height - UI.POUCH_MARGIN - UI.POUCH_SIZE - 8;

  return {
    sidebar,
    equipBar,
    consumableBar,
    dicePouch,
    tagStack,
    contentX,
    contentW,
    contentCX,
    sidebarW,
    contentTop,
    contentBottom,
  };
}
