// ─── BossTestModal ───
// Developer profession: pick any boss and jump straight into a boss round.
// Scrolling/clipping matches ProfessionSelectScene (scene-level container + cover rects).

import { GameObjects, Scene } from 'phaser';
import { devGetAllBosses, devStartBossRound } from '../../game/DevMode';
import type { BossDef } from '../../game/types';
import { Button } from './Button';
import { createCatalogModalShell, finalizeCatalogModal, type CatalogModalShell } from './catalogModal';

const ROW_H = 34;
const ROW_GAP = 4;

export class BossTestModal extends GameObjects.Container {
  private shell!: CatalogModalShell;

  constructor(scene: Scene, contentX: number, width: number, height: number, contentY = 0) {
    super(scene, 0, 0);

    const bosses = [...devGetAllBosses()].sort((a, b) => a.name.localeCompare(b.name));
    const screenW = scene.scale.width;

    const panelW = Math.min(width - 40, 420);
    const panelH = Math.min(height - 60, 560);
    const panelX = contentX + (width - panelW) / 2;
    const panelY = contentY + (height - panelH) / 2;

    this.shell = createCatalogModalShell({
      scene,
      parent: this,
      screenW,
      screenH: height,
      contentY,
      panel: { panelX, panelY, panelW, panelH },
      title: 'Test Boss',
      subtitle: 'Jump to boss round (round 3)',
      onClose: () => this.destroy(),
    });

    const btnW = panelW - 32;
    let rowY = ROW_H / 2 + 4;
    const startBoss = (boss: BossDef) => {
      devStartBossRound(boss.id);
      this.destroy();
      scene.scene.start('Game', {});
    };

    for (const boss of bosses) {
      const minLeg = boss.minimumLeg ?? 1;
      const label = minLeg > 1 ? `${boss.name} (leg ${minLeg}+)` : boss.name;
      const btn = new Button(scene, 0, rowY, label, btnW, ROW_H);
      btn.onClick(() => startBoss(boss));
      this.shell.scrollContainer.add(btn);
      rowY += ROW_H + ROW_GAP;
    }

    this.shell.setContentHeight(rowY + ROW_H / 2);

    finalizeCatalogModal(this, scene);
  }

  destroy(fromScene?: boolean): void {
    this.shell.destroyManagedObjects();
    super.destroy(fromScene);
  }
}
