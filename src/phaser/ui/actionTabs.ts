// ─── Action tabs (card-agnostic Sell / Use / etc.) ───

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
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

export interface ActionTabsHandle {
  show(tabs: CardActionTabConfig[]): void;
  hide(animate?: boolean): void;
  getContainers(): GameObjects.Container[];
  readonly visible: boolean;
}

interface ActionTabInstance {
  container: GameObjects.Container;
  config: CardActionTabConfig;
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

  const handle: ActionTabsHandle = {
    get visible() {
      return tabsVisible;
    },

    getContainers() {
      return actionTabs.map((tab) => tab.container);
    },

    show(tabs: CardActionTabConfig[]) {
      handle.hide();

      tabsVisible = true;

      const tabRadius = Math.round(6 * scale);
      const fontSize = Math.round(16 * scale);
      const hw = tabAnchorX;
      const hh = layout.cardH / 2;

      const bottomTabs = tabs.filter((t) => t.position === 'bottom');
      const rightTabs = tabs.filter((t) => t.position !== 'bottom');

      if (bottomTabs.length > 0) {
        const btabH = Math.round(30 * scale);
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
          const liftAmount = bottomTabs.length * Math.round(30 * scale);
          tabLiftAmount = liftAmount;
          scene.tweens.add({
            targets: parent,
            y: parent.y - liftAmount,
            duration: 200,
            ease: 'Back.easeOut',
          });
        }
      }

      const tabW = Math.round(50 * scale);
      const tabH = Math.round(45 * scale);
      const tabGap = Math.round(4 * scale);

      for (let i = 0; i < rightTabs.length; i++) {
        const cfg = rightTabs[i]!;
        const tabContainer = scene.add.container(hw, 0);
        tabContainer.setDepth(-1);

        const tabY = hh - tabH - (tabH + tabGap) * i - rightTabYOffset;

        const bg = scene.add.graphics();
        bg.fillStyle(cfg.color, 0.95);
        bg.fillRoundedRect(0, tabY, tabW, tabH, {
          tl: 0,
          tr: tabRadius,
          bl: 0,
          br: tabRadius,
        });
        bg.lineStyle(1, 0xffffff, 0.2);
        bg.strokeRoundedRect(0, tabY, tabW, tabH, {
          tl: 0,
          tr: tabRadius,
          bl: 0,
          br: tabRadius,
        });
        tabContainer.add(bg);

        const label = scene.add
          .text(tabW / 2, tabY + tabH / 2, cfg.label, {
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
          new Phaser.Geom.Rectangle(tabW / 2, tabY + tabH / 2, tabW, tabH),
          Phaser.Geom.Rectangle.Contains,
        );

        tabContainer.on('pointerover', () => {
          bg.clear();
          bg.fillStyle(Phaser.Display.Color.ValueToColor(cfg.color).lighten(20).color, 0.95);
          bg.fillRoundedRect(0, tabY, tabW, tabH, { tl: 0, tr: tabRadius, bl: 0, br: tabRadius });
          bg.lineStyle(1, 0xffffff, 0.4);
          bg.strokeRoundedRect(0, tabY, tabW, tabH, { tl: 0, tr: tabRadius, bl: 0, br: tabRadius });
        });

        tabContainer.on('pointerout', () => {
          bg.clear();
          bg.fillStyle(cfg.color, 0.95);
          bg.fillRoundedRect(0, tabY, tabW, tabH, { tl: 0, tr: tabRadius, bl: 0, br: tabRadius });
          bg.lineStyle(1, 0xffffff, 0.2);
          bg.strokeRoundedRect(0, tabY, tabW, tabH, { tl: 0, tr: tabRadius, bl: 0, br: tabRadius });
        });

        if (!cfg.disabled) {
          tabContainer.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            pointer.event?.stopPropagation();
            cfg.callback();
          });
        } else {
          tabContainer.disableInteractive();
        }

        const finalX = hw;
        tabContainer.x = hw - tabW;
        parent.add(tabContainer);
        parent.sendToBack(tabContainer);

        scene.tweens.add({
          targets: tabContainer,
          x: finalX,
          duration: 200,
          ease: 'Back.easeOut',
          delay: i * 50,
        });

        actionTabs.push({ container: tabContainer, config: cfg });
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
        const tabW = Math.round(50 * scale);
        for (const tab of actionTabs) {
          const container = tab.container;
          if (tab.config.position !== 'bottom') {
            scene.tweens.add({
              targets: container,
              x: tabAnchorX - tabW,
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
