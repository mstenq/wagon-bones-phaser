// ─── ItemCard action tabs (Sell / Use) ───

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import type { CardActionTabConfig, ItemCardLayout } from './itemCardTypes';

interface ActionTabInstance {
  container: GameObjects.Container;
  config: CardActionTabConfig;
}

export class ItemCardActionTabs {
  private readonly scene: Scene;
  private readonly card: GameObjects.Container;
  private readonly layout: ItemCardLayout;
  private actionTabs: ActionTabInstance[] = [];
  private tabsVisible = false;
  private tabLiftAmount = 0;

  constructor(scene: Scene, card: GameObjects.Container, layout: ItemCardLayout) {
    this.scene = scene;
    this.card = card;
    this.layout = layout;
  }

  get visible(): boolean {
    return this.tabsVisible;
  }

  getActionTabContainers(): GameObjects.Container[] {
    return this.actionTabs.map((tab) => tab.container);
  }

  /** Show action tabs. Bottom tabs slide the card up; right tabs slide out from the side. */
  show(tabs: CardActionTabConfig[]): void {
    this.hide();
    this.tabsVisible = true;

    const scale = this.layout.cardScale;
    const tabRadius = Math.round(6 * scale);
    const fontSize = Math.round(16 * scale);
    const hw = this.layout.tabAnchorX;
    const hh = this.layout.cardH / 2;

    const bottomTabs = tabs.filter((t) => t.position === 'bottom');
    const rightTabs = tabs.filter((t) => t.position !== 'bottom');

    if (bottomTabs.length > 0) {
      const btabH = Math.round(30 * scale);
      const btabW = Math.round(this.layout.cardW * 0.8);

      for (let i = 0; i < bottomTabs.length; i++) {
        const cfg = bottomTabs[i];
        const tabContainer = this.scene.add.container(0, 0);
        tabContainer.setDepth(-1);

        const tabY = hh + btabH * i;

        const bg = this.scene.add.graphics();
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

        const label = this.scene.add
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

        this.card.add(tabContainer);
        this.card.sendToBack(tabContainer);
        this.actionTabs.push({ container: tabContainer, config: cfg });
      }

      const liftAmount = bottomTabs.length * Math.round(30 * scale);
      this.tabLiftAmount = liftAmount;
      this.scene.tweens.add({
        targets: this.card,
        y: this.card.y - liftAmount,
        duration: 200,
        ease: 'Back.easeOut',
      });
    }

    const tabW = Math.round(50 * scale);
    const tabH = Math.round(45 * scale);
    const tabGap = Math.round(4 * scale);

    for (let i = 0; i < rightTabs.length; i++) {
      const cfg = rightTabs[i];
      const tabContainer = this.scene.add.container(hw, 0);
      tabContainer.setDepth(-1);

      const tabY = hh - tabH - (tabH + tabGap) * i - 30;

      const bg = this.scene.add.graphics();
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

      const label = this.scene.add
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
      this.card.add(tabContainer);
      this.card.sendToBack(tabContainer);

      this.scene.tweens.add({
        targets: tabContainer,
        x: finalX,
        duration: 200,
        ease: 'Back.easeOut',
        delay: i * 50,
      });

      this.actionTabs.push({ container: tabContainer, config: cfg });
    }

    this.scene.sound.play('sfx_whoosh', { volume: 0.3 });
  }

  /** Hide action tabs with optional slide-back animation */
  hide(animate: boolean = false): void {
    if (!this.tabsVisible) return;
    this.tabsVisible = false;

    if (this.tabLiftAmount > 0) {
      if (animate) {
        this.scene.tweens.add({
          targets: this.card,
          y: this.card.y + this.tabLiftAmount,
          duration: 150,
          ease: 'Power2',
        });
      } else {
        this.card.y += this.tabLiftAmount;
      }
      this.tabLiftAmount = 0;
    }

    if (animate && this.actionTabs.length > 0) {
      this.scene.sound.play('sfx_whoosh2', { volume: 0.3 });
      const hw = this.layout.cardW / 2;
      const scale = this.layout.cardScale;
      const tabW = Math.round(50 * scale);
      for (const tab of this.actionTabs) {
        const container = tab.container;
        if (tab.config.position !== 'bottom') {
          this.scene.tweens.add({
            targets: container,
            x: hw - tabW,
            duration: 150,
            ease: 'Power2',
            onComplete: () => container.destroy(),
          });
        } else {
          container.destroy();
        }
      }
    } else {
      for (const tab of this.actionTabs) {
        tab.container.destroy();
      }
    }
    this.actionTabs = [];
  }
}
