// ─── AchievementsModal ───
// Cross-run achievement progress (Completionist+ / Completionist++).

import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS } from '../../game/Constants';
import {
  getCompletionistPlusPlusProgress,
  getCompletionistPlusProgress,
  type AchievementProgress,
} from '../../game/Achievements';
import { createCatalogModalShell, finalizeCatalogModal, type CatalogModalShell } from './catalogModal';

const SCREEN_MARGIN = 12;
const ROW_GAP = 48;
const BAR_W = 320;
const BAR_H = 14;

interface AchievementDef {
  id: string;
  title: string;
  description: string;
  getProgress: () => AchievementProgress;
}

const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'completionist_plus',
    title: 'Completionist+',
    description: 'Beat every profession at Level 8 difficulty',
    getProgress: getCompletionistPlusProgress,
  },
  {
    id: 'completionist_plus_plus',
    title: 'Completionist++',
    description: 'Beat Level 8 while holding each equipment item at least once (across runs)',
    getProgress: getCompletionistPlusPlusProgress,
  },
];

export class AchievementsModal extends GameObjects.Container {
  private shell!: CatalogModalShell;

  constructor(scene: Scene) {
    super(scene, 0, 0);

    const screenW = scene.scale.width;
    const screenH = scene.scale.height;

    const panelX = SCREEN_MARGIN;
    const panelY = SCREEN_MARGIN;
    const panelW = screenW - SCREEN_MARGIN * 2;
    const panelH = screenH - SCREEN_MARGIN * 2;

    this.shell = createCatalogModalShell({
      scene,
      parent: this,
      screenW,
      screenH,
      panel: { panelX, panelY, panelW, panelH },
      title: 'Achievements',
      subtitle: 'Cross-run completion goals',
      titleFontSize: '24px',
      titleY: 24,
      subtitleY: 50,
      listBottomOffset: 48,
      onClose: () => this.destroy(),
    });

    let layoutY = 24;

    for (const achievement of ACHIEVEMENTS) {
      const progress = achievement.getProgress();
      layoutY = this.renderAchievementRow(achievement, progress, layoutY);
      layoutY += ROW_GAP;
    }

    this.shell.setContentHeight(layoutY);

    finalizeCatalogModal(this, scene);
  }

  private renderAchievementRow(achievement: AchievementDef, progress: AchievementProgress, startY: number): number {
    const titleColor = progress.complete ? '#ffd700' : TEXT_COLORS.PRIMARY;
    const statusSuffix = progress.complete ? ' — Unlocked!' : '';

    const title = this.scene.add
      .text(0, startY, `${achievement.title}${statusSuffix}`, {
        fontFamily: FONTS.HEADING,
        fontSize: '18px',
        color: titleColor,
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);
    this.shell.scrollContainer.add(title);

    const desc = this.scene.add
      .text(0, startY + 26, achievement.description, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '12px',
        color: TEXT_COLORS.SECONDARY,
        wordWrap: { width: BAR_W, useAdvancedWrap: true },
        align: 'center',
      })
      .setOrigin(0.5, 0);
    this.shell.scrollContainer.add(desc);

    const barY = startY + 26 + desc.height + 12;
    const barX = -BAR_W / 2;

    const barBg = this.scene.add.graphics();
    barBg.fillStyle(COLORS.SIDEBAR_SECTION_BORDER, 0.5);
    barBg.fillRoundedRect(barX, barY, BAR_W, BAR_H, 4);
    this.shell.scrollContainer.add(barBg);

    const fillW = progress.total > 0 ? (progress.done / progress.total) * BAR_W : 0;
    if (fillW > 0) {
      const barFill = this.scene.add.graphics();
      barFill.fillStyle(progress.complete ? 0xffd700 : 0x66aa66, 0.9);
      barFill.fillRoundedRect(barX, barY, fillW, BAR_H, 4);
      this.shell.scrollContainer.add(barFill);
    }

    const progressText = this.scene.add
      .text(0, barY + BAR_H + 8, `${progress.done} / ${progress.total}`, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '13px',
        color: TEXT_COLORS.MUTED,
      })
      .setOrigin(0.5, 0);
    this.shell.scrollContainer.add(progressText);

    return barY + BAR_H + 8 + progressText.height;
  }

  destroy(fromScene?: boolean): void {
    this.shell.destroyManagedObjects();
    super.destroy(fromScene);
  }
}
