// ─── Action tabs (card-agnostic Sell / Use / etc.) ───

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { UI } from '../../game/Constants';
import type { CardActionTabConfig } from './itemCard/itemCardTypes';

export interface ActionTabsLayout {
  cardW: number;
  cardH: number;
  cardScale?: number;
  tabAnchorX?: number;
  /** Extra offset above the bottom-right tab stack (default: 30 * scale). */
  rightTabYOffset?: number;
}

export interface ActionTabsOptions {
  scene: Scene;
  parent: GameObjects.Container;
  layout: ActionTabsLayout;
  /** Slide parent up when bottom tabs are shown (default true). */
  liftParentForBottomTabs?: boolean;
  /** Play whoosh SFX on show/hide (default true). */
  playSound?: boolean;
}

export type ActionTabsShowOptions = {
  /** Skip slide-in tween when refreshing tabs during an active pointer gesture. */
  instant?: boolean;
};

export interface ActionTabsHandle {
  show(tabs: CardActionTabConfig[], options?: ActionTabsShowOptions): void;
  hide(animate?: boolean): void;
  getContainers(): GameObjects.Container[];
  readonly visible: boolean;
}

type SideTabDirection = 'left' | 'right';

interface ActionTabInstance {
  container: GameObjects.Container;
  config: CardActionTabConfig;
  side?: SideTabDirection;
}

function clampTabSize(scaled: number): number {
  return Math.max(UI.ACTION_TAB_MIN_SIZE, Math.round(scaled));
}

function resolveSideTabPosition(
  scene: Scene,
  parent: GameObjects.Container,
  tabAnchorX: number,
  tabW: number,
): SideTabDirection {
  const matrix = parent.getWorldTransformMatrix();
  const centerX = matrix.tx;
  const scaleX = matrix.scaleX;
  const worldHalfW = tabAnchorX * scaleX;
  const worldTabW = tabW * scaleX;
  const margin = UI.ACTION_TAB_SCREEN_MARGIN;
  const screenW = scene.scale.width;

  const rightEdge = centerX + worldHalfW + worldTabW;
  const leftEdge = centerX - worldHalfW - worldTabW;

  const fitsRight = rightEdge <= screenW - margin;
  const fitsLeft = leftEdge >= margin;

  if (fitsRight) return 'right';
  if (fitsLeft) return 'left';

  const roomRight = screenW - margin - (centerX + worldHalfW);
  const roomLeft = centerX - worldHalfW - margin;
  return roomLeft > roomRight ? 'left' : 'right';
}

interface SideTabCorners {
  tl: number;
  tr: number;
  bl: number;
  br: number;
}

function sideTabCorners(side: SideTabDirection, tabRadius: number): SideTabCorners {
  if (side === 'right') {
    return { tl: 0, tr: tabRadius, bl: 0, br: tabRadius };
  }
  return { tl: tabRadius, tr: 0, bl: tabRadius, br: 0 };
}

export function createActionTabs(options: ActionTabsOptions): ActionTabsHandle {
  const { scene, parent, layout } = options;
  const liftParentForBottomTabs = options.liftParentForBottomTabs ?? true;
  const playSound = options.playSound ?? true;

  const scale = layout.cardScale ?? 1;
  const tabAnchorX = layout.tabAnchorX ?? layout.cardW / 2;
  const rightTabYOffset = layout.rightTabYOffset ?? Math.round(30 * scale);

  let actionTabs: ActionTabInstance[] = [];
  let tabsVisible = false;
  let tabLiftAmount = 0;
  let lastSideTabW: number = UI.ACTION_TAB_MIN_SIZE;

  const handle: ActionTabsHandle = {
    get visible() {
      return tabsVisible;
    },

    getContainers() {
      return actionTabs.map((tab) => tab.container);
    },

    show(tabs: CardActionTabConfig[], options?: ActionTabsShowOptions) {
      const instant = options?.instant ?? false;
      handle.hide();

      tabsVisible = true;

      const tabRadius = Math.round(6 * scale);
      const fontSize = Math.max(11, Math.round(16 * scale));
      const hw = tabAnchorX;
      const hh = layout.cardH / 2;

      const bottomTabs = tabs.filter((t) => t.position === 'bottom');
      const sideTabs = tabs.filter((t) => t.position !== 'bottom');

      if (bottomTabs.length > 0) {
        const btabH = clampTabSize(30 * scale);
        const btabW = Math.round(layout.cardW * 0.8);

        for (let i = 0; i < bottomTabs.length; i++) {
          const cfg = bottomTabs[i]!;
          const tabContainer = scene.add.container(0, 0);
          tabContainer.setDepth(-1);

          const tabY = hh + btabH * i;

          const bg = scene.add.graphics();
          bg.fillStyle(cfg.color, 0.95);
          bg.fillRoundedRect(-btabW / 2, tabY, btabW, btabH, {
            tl: 0,
            tr: 0,
            bl: tabRadius,
            br: tabRadius,
          });
          bg.lineStyle(1, 0xffffff, 0.2);
          bg.strokeRoundedRect(-btabW / 2, tabY, btabW, btabH, {
            tl: 0,
            tr: 0,
            bl: tabRadius,
            br: tabRadius,
          });
          tabContainer.add(bg);

          const label = scene.add
            .text(0, tabY + btabH / 2, cfg.label, {
              fontFamily: 'sans-serif',
              fontSize: `${fontSize}px`,
              fontStyle: 'bold',
              color: cfg.textColor ?? '#ffffff',
              align: 'center',
            })
            .setOrigin(0.5);
          tabContainer.add(label);

          tabContainer.setSize(btabW, btabH);
          tabContainer.setInteractive(
            new Phaser.Geom.Rectangle(0, tabY + btabH / 2, btabW, btabH),
            Phaser.Geom.Rectangle.Contains,
          );

          tabContainer.on('pointerover', () => {
            bg.clear();
            bg.fillStyle(Phaser.Display.Color.ValueToColor(cfg.color).lighten(20).color, 0.95);
            bg.fillRoundedRect(-btabW / 2, tabY, btabW, btabH, { tl: 0, tr: 0, bl: tabRadius, br: tabRadius });
            bg.lineStyle(1, 0xffffff, 0.4);
            bg.strokeRoundedRect(-btabW / 2, tabY, btabW, btabH, { tl: 0, tr: 0, bl: tabRadius, br: tabRadius });
          });

          tabContainer.on('pointerout', () => {
            bg.clear();
            bg.fillStyle(cfg.color, 0.95);
            bg.fillRoundedRect(-btabW / 2, tabY, btabW, btabH, { tl: 0, tr: 0, bl: tabRadius, br: tabRadius });
            bg.lineStyle(1, 0xffffff, 0.2);
            bg.strokeRoundedRect(-btabW / 2, tabY, btabW, btabH, { tl: 0, tr: 0, bl: tabRadius, br: tabRadius });
          });

          if (!cfg.disabled) {
            tabContainer.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
              pointer.event?.stopPropagation();
              cfg.callback();
            });
          } else {
            tabContainer.disableInteractive();
          }

          parent.add(tabContainer);
          parent.sendToBack(tabContainer);
          actionTabs.push({ container: tabContainer, config: cfg });
        }

        if (liftParentForBottomTabs) {
          const liftAmount = bottomTabs.length * btabH;
          tabLiftAmount = liftAmount;
          scene.tweens.add({
            targets: parent,
            y: parent.y - liftAmount,
            duration: 200,
            ease: 'Back.easeOut',
          });
        }
      }

      const tabW = clampTabSize(50 * scale);
      const tabH = clampTabSize(45 * scale);
      const tabGap = Math.round(4 * scale);
      lastSideTabW = tabW;

      if (sideTabs.length > 0) {
        const side = resolveSideTabPosition(scene, parent, tabAnchorX, tabW);
        const anchorX = side === 'right' ? hw : -hw;
        const corners = sideTabCorners(side, tabRadius);

        for (let i = 0; i < sideTabs.length; i++) {
          const cfg = sideTabs[i]!;
          const tabContainer = scene.add.container(anchorX, 0);
          tabContainer.setDepth(-1);

          const tabY = hh - tabH - (tabH + tabGap) * i - rightTabYOffset;
          const drawX = side === 'right' ? 0 : -tabW;
          const labelX = side === 'right' ? tabW / 2 : -tabW / 2;
          const hitCenterX = side === 'right' ? tabW / 2 : -tabW / 2;

          const bg = scene.add.graphics();
          bg.fillStyle(cfg.color, 0.95);
          bg.fillRoundedRect(drawX, tabY, tabW, tabH, corners);
          bg.lineStyle(1, 0xffffff, 0.2);
          bg.strokeRoundedRect(drawX, tabY, tabW, tabH, corners);
          tabContainer.add(bg);

          const label = scene.add
            .text(labelX, tabY + tabH / 2, cfg.label, {
              fontFamily: 'sans-serif',
              fontSize: `${fontSize}px`,
              color: cfg.textColor ?? '#ffffff',
              align: 'center',
              lineSpacing: -2,
            })
            .setOrigin(0.5);
          tabContainer.add(label);

          tabContainer.setSize(tabW, tabH);
          tabContainer.setInteractive(
            new Phaser.Geom.Rectangle(hitCenterX, tabY + tabH / 2, tabW, tabH),
            Phaser.Geom.Rectangle.Contains,
          );

          const redrawSideTab = (strokeAlpha: number, lighten: number) => {
            bg.clear();
            const fillColor = lighten ? Phaser.Display.Color.ValueToColor(cfg.color).lighten(lighten).color : cfg.color;
            bg.fillStyle(fillColor, 0.95);
            bg.fillRoundedRect(drawX, tabY, tabW, tabH, corners);
            bg.lineStyle(1, 0xffffff, strokeAlpha);
            bg.strokeRoundedRect(drawX, tabY, tabW, tabH, corners);
          };

          tabContainer.on('pointerover', () => redrawSideTab(0.4, 20));
          tabContainer.on('pointerout', () => redrawSideTab(0.2, 0));

          if (!cfg.disabled) {
            tabContainer.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
              pointer.event?.stopPropagation();
              cfg.callback();
            });
          } else {
            tabContainer.disableInteractive();
          }

          const finalX = anchorX;
          const hiddenX = side === 'right' ? anchorX - tabW : anchorX + tabW;
          tabContainer.x = instant ? finalX : hiddenX;
          parent.add(tabContainer);
          parent.sendToBack(tabContainer);

          if (!instant) {
            scene.tweens.add({
              targets: tabContainer,
              x: finalX,
              duration: 200,
              ease: 'Back.easeOut',
              delay: i * 50,
            });
          }

          actionTabs.push({ container: tabContainer, config: cfg, side });
        }
      }

      if (playSound) {
        scene.sound.play('sfx_whoosh', { volume: 0.3 });
      }
    },

    hide(animate: boolean = false) {
      if (!tabsVisible) return;
      tabsVisible = false;

      if (tabLiftAmount > 0) {
        if (animate) {
          scene.tweens.add({
            targets: parent,
            y: parent.y + tabLiftAmount,
            duration: 150,
            ease: 'Power2',
          });
        } else {
          parent.y += tabLiftAmount;
        }
        tabLiftAmount = 0;
      }

      if (animate && actionTabs.length > 0) {
        if (playSound) {
          scene.sound.play('sfx_whoosh2', { volume: 0.3 });
        }
        const tabW = lastSideTabW;
        for (const tab of actionTabs) {
          const container = tab.container;
          if (tab.config.position !== 'bottom' && tab.side) {
            const anchorX = tab.side === 'right' ? tabAnchorX : -tabAnchorX;
            const hiddenX = tab.side === 'right' ? anchorX - tabW : anchorX + tabW;
            scene.tweens.add({
              targets: container,
              x: hiddenX,
              duration: 150,
              ease: 'Power2',
              onComplete: () => container.destroy(),
            });
          } else {
            container.destroy();
          }
        }
      } else {
        for (const tab of actionTabs) {
          tab.container.destroy();
        }
      }
      actionTabs = [];
    },
  };

  return handle;
}
