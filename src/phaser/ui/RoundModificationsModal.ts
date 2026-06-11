// ─── RoundModificationsModal ───
// Portrait top bar: profession info, boss effects, and run status traits.

import { GameObjects, Scene } from 'phaser';
import { TEXT_COLORS, FONTS } from '../../game/Constants';
import type { ProfessionDef } from '../../data/professions';
import { getRunProfession } from '../../game/store/runReads';
import { selectRunSidebarModel } from '../../game/store/selectors/uiSelectors';
import { Button } from './Button';
import { createModalShell, finalizeModal } from './modalShell';

const SECTION_GAP = 10;

export class RoundModificationsModal extends GameObjects.Container {
  constructor(scene: Scene, contentX: number, width: number, height: number, contentY = 0) {
    super(scene, 0, 0);

    const model = selectRunSidebarModel();
    const profession = getRunProfession();
    const traitCount = model.statusTraits.length + (model.boss ? 1 : 0) + (profession ? 1 : 0);
    const panelHeight = Math.min(height - 40, Math.max(260, 140 + traitCount * 72));

    const { layout, dim, panel, title } = createModalShell(scene, 'Round Info', {
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

    if (profession) {
      y += this.addProfessionSection(scene, panelX, panelW, y, profession) + SECTION_GAP;
    }

    if (model.boss) {
      y += this.addBossSection(scene, panelX, panelW, y, model.boss) + SECTION_GAP;
    }

    for (const trait of model.statusTraits.filter((t) => t.polarity === 'positive')) {
      y += this.addTraitSection(scene, panelX, panelW, y, trait.label, trait.lines, 'positive') + SECTION_GAP;
    }

    for (const trait of model.statusTraits.filter((t) => t.polarity === 'negative')) {
      y += this.addTraitSection(scene, panelX, panelW, y, trait.label, trait.lines, 'negative') + SECTION_GAP;
    }

    if (!profession && !model.boss && model.statusTraits.length === 0) {
      const empty = scene.add.text(panelX + panelW / 2, panelY + panelH / 2, 'No active modifiers', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '14px',
        color: TEXT_COLORS.MUTED,
      });
      empty.setOrigin(0.5);
      this.add(empty);
    }

    const closeBtn = new Button(scene, panelX + panelW / 2, panelY + panelH - 32, 'Close', {
      variant: 'secondary',
      size: 'sm',
      width: 120,
      height: 32,
    });
    closeBtn.onClick(() => this.destroy());
    this.add(closeBtn);

    finalizeModal(this, scene);
  }

  private addProfessionSection(scene: Scene, panelX: number, panelW: number, y: number, prof: ProfessionDef): number {
    const pad = 12;
    const imgSize = 48;
    const bodyX = panelX + pad + imgSize + 8;
    const bodyW = panelW - pad * 2 - imgSize - 16;

    const titleText = scene.add.text(bodyX, y + 8, prof.title, {
      fontFamily: FONTS.HEADING,
      fontSize: '14px',
      color: TEXT_COLORS.GOLD,
    });

    const nameText = scene.add.text(bodyX, y + 24, prof.name, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '12px',
      color: TEXT_COLORS.PRIMARY,
    });

    const descText = scene.add.text(bodyX, y + 40, prof.description, {
      fontFamily: FONTS.PRIMARY,
      fontSize: '12px',
      color: TEXT_COLORS.SECONDARY,
      wordWrap: { width: bodyW },
      lineSpacing: 2,
    });

    let bodyBottom = y + 40 + descText.height;

    let synergyName: GameObjects.Text | null = null;
    let synergyEffect: GameObjects.Text | null = null;
    if (prof.specialEquipment) {
      synergyName = scene.add.text(bodyX, bodyBottom + 8, `Equipment Synergy: ${prof.specialEquipment.name}`, {
        fontFamily: FONTS.HEADING,
        fontSize: '12px',
        color: TEXT_COLORS.GOLD,
        wordWrap: { width: bodyW },
      });
      synergyEffect = scene.add.text(bodyX, synergyName.y + synergyName.height + 4, prof.specialEquipment.effect, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '11px',
        color: TEXT_COLORS.SECONDARY,
        wordWrap: { width: bodyW },
        lineSpacing: 2,
      });
      bodyBottom = synergyEffect.y + synergyEffect.height;
    }

    const sectionH = Math.max(72, bodyBottom - y + 12);

    const bg = scene.add.graphics();
    bg.fillStyle(0x1a1a30, 1);
    bg.fillRoundedRect(panelX + pad, y, panelW - pad * 2, sectionH, 6);
    bg.lineStyle(1, 0x444466, 0.9);
    bg.strokeRoundedRect(panelX + pad, y, panelW - pad * 2, sectionH, 6);
    this.add(bg);

    this.add([titleText, nameText, descText]);
    if (synergyName && synergyEffect) {
      this.add([synergyName, synergyEffect]);
    }

    const atlasFrame = `${prof.id}.png`;
    const profTexture = scene.textures.get('professions');
    const canUseAtlas = scene.textures.exists('professions') && profTexture.has(atlasFrame);
    if (canUseAtlas) {
      const img = scene.add.image(panelX + pad + 6 + imgSize / 2, y + sectionH / 2, 'professions', atlasFrame);
      const scale = imgSize / Math.max(img.width, img.height);
      img.setScale(scale);
      this.add(img);
    }

    return sectionH;
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
