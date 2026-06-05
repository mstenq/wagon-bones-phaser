// ─── RoundModificationsModal ───
// Portrait top bar: full list of boss effects and run status traits.

import { GameObjects, Scene } from 'phaser';
import { TEXT_COLORS, FONTS } from '../../game/Constants';
import { selectRunSidebarModel } from '../../game/store/selectors/uiSelectors';
import { Button } from './Button';
import { createModalShell, finalizeModal } from './modalShell';

const SECTION_GAP = 10;

export class RoundModificationsModal extends GameObjects.Container {
  constructor(scene: Scene, contentX: number, width: number, height: number, contentY = 0) {
    super(scene, 0, 0);

    const model = selectRunSidebarModel();
    const traitCount = model.statusTraits.length + (model.boss ? 1 : 0);
    const panelHeight = Math.min(height - 40, Math.max(220, 120 + traitCount * 72));

    const { layout, dim, panel, title } = createModalShell(scene, 'Round Modifiers', {
      contentX,
      width,
      height,
      contentY,
      panelHeight,
      panelMaxWidth: 420,
    });
    const { panelX, panelY, panelW, panelH } = layout;

    this.add([dim, panel, title]);

    let y = panelY + 58;

    if (model.boss) {
      y += this.addBossSection(scene, panelX, panelW, y, model.boss) + SECTION_GAP;
    }

    for (const trait of model.statusTraits.filter((t) => t.polarity === 'positive')) {
      y += this.addTraitSection(scene, panelX, panelW, y, trait.label, trait.lines, 'positive') + SECTION_GAP;
    }

    for (const trait of model.statusTraits.filter((t) => t.polarity === 'negative')) {
      y += this.addTraitSection(scene, panelX, panelW, y, trait.label, trait.lines, 'negative') + SECTION_GAP;
    }

    if (!model.boss && model.statusTraits.length === 0) {
      const empty = scene.add.text(panelX + panelW / 2, panelY + panelH / 2, 'No active modifiers', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '14px',
        color: TEXT_COLORS.MUTED,
      });
      empty.setOrigin(0.5);
      this.add(empty);
    }

    const closeBtn = new Button(scene, panelX + panelW / 2, panelY + panelH - 32, 'Close', 120, 32);
    closeBtn.onClick(() => this.destroy());
    this.add(closeBtn);

    finalizeModal(this, scene);
  }

  private addBossSection(
    scene: Scene,
    panelX: number,
    panelW: number,
    y: number,
    boss: NonNullable<ReturnType<typeof selectRunSidebarModel>['boss']>,
  ): number {
    const pad = 12;
    const imgSize = 48;
    const bodyText = scene.add.text(panelX + pad + imgSize + 8, y + 22, boss.description, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '12px',
      color: TEXT_COLORS.SECONDARY,
      wordWrap: { width: panelW - pad * 2 - imgSize - 16 },
      lineSpacing: 2,
    });
    const sectionH = Math.max(64, 24 + bodyText.height + 12);

    const bg = scene.add.graphics();
    bg.fillStyle(0x3a1a1a, 1);
    bg.fillRoundedRect(panelX + pad, y, panelW - pad * 2, sectionH, 6);
    bg.lineStyle(1, 0x8a3333, 0.9);
    bg.strokeRoundedRect(panelX + pad, y, panelW - pad * 2, sectionH, 6);
    this.add(bg);

    const nameText = scene.add.text(panelX + pad + imgSize + 8, y + 8, boss.name, {
      fontFamily: FONTS.HEADING,
      fontSize: '14px',
      color: TEXT_COLORS.ERROR_RED,
    });
    this.add(nameText);
    this.add(bodyText);

    const atlasFrame = `${boss.id}.png`;
    const bossTexture = scene.textures.get('bosses');
    const canUseAtlas = scene.textures.exists('bosses') && bossTexture.has(atlasFrame);
    if (canUseAtlas) {
      const img = scene.add.image(panelX + pad + 6 + imgSize / 2, y + sectionH / 2, 'bosses', atlasFrame);
      const scale = imgSize / Math.max(img.width, img.height);
      img.setScale(scale);
      this.add(img);
    }

    return sectionH;
  }

  private addTraitSection(
    scene: Scene,
    panelX: number,
    panelW: number,
    y: number,
    label: string,
    lines: string[],
    style: 'positive' | 'negative',
  ): number {
    const pad = 12;
    const body = lines.join('\n');
    const bodyText = scene.add.text(panelX + pad + 8, y + 20, body, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '12px',
      color: style === 'positive' ? TEXT_COLORS.SCORE_GREEN : '#e8a070',
      lineSpacing: 2,
      wordWrap: { width: panelW - pad * 2 - 16 },
    });
    const sectionH = Math.max(52, 18 + bodyText.height + 12);

    const bg = scene.add.graphics();
    if (style === 'positive') {
      bg.fillStyle(0x1a3020, 0.95);
      bg.fillRoundedRect(panelX + pad, y, panelW - pad * 2, sectionH, 6);
      bg.lineStyle(1, 0x4a8a55, 0.85);
      bg.strokeRoundedRect(panelX + pad, y, panelW - pad * 2, sectionH, 6);
    } else {
      bg.fillStyle(0x3a2018, 0.95);
      bg.fillRoundedRect(panelX + pad, y, panelW - pad * 2, sectionH, 6);
      bg.lineStyle(1, 0x8a4433, 0.85);
      bg.strokeRoundedRect(panelX + pad, y, panelW - pad * 2, sectionH, 6);
    }
    this.add(bg);

    const labelColor = style === 'positive' ? TEXT_COLORS.SCORE_GREEN : TEXT_COLORS.MUTED;
    const labelText = scene.add.text(panelX + pad + 8, y + 6, label, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '11px',
      color: labelColor,
    });
    this.add(labelText);
    this.add(bodyText);

    return sectionH;
  }
}
