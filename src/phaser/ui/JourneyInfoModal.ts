// ─── JourneyInfoModal ───
// Modal showing trail knowledge levels (hand types and how many times played),
// and a Permits tab showing purchased frontier permits.

import * as Phaser from 'phaser';
import { GameObjects, Scene } from 'phaser';
import { COLORS, TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import { EventBus, Events } from '../../game/EventBus';
import { getPlayerState } from '../../game/PlayerState';
import { HandType } from '../../game/types';
import { Button } from './Button';
import { getPermitById } from '../../game/PermitsSystem';
import { devGrantPermit, isDevMode } from '../../game/DevMode';
import { createLegRoundPanelsForPlayer } from './RoundInfo';
import { ensureRoundSkipPreviewTags } from '../../game/TagSystem';
import { TagTooltip } from './TagTooltip';
import hands from '../../data/hands';

export class JourneyInfoModal extends GameObjects.Container {
  private scene: Scene;
  private panelX: number;
  private panelY: number;
  private panelW: number;
  private panelH: number;
  private tabContent: GameObjects.Container;
  private tabButtons: GameObjects.Container[] = [];
  private closeBtn: Button;
  private activeTab: string = 'knowledge';
  private tagTooltip = new TagTooltip();
  private permitsDirty = false;

  /** Layout below tab row — shared by all tabs */
  private getContentArea(): { top: number; bottom: number } {
    const tabBottom = this.panelY + 58 + 14;
    return {
      top: tabBottom + 18,
      bottom: this.panelY + this.panelH - 52,
    };
  }

  private bringTabsToFront(): void {
    for (const tab of this.tabButtons) {
      this.bringToTop(tab);
    }
    this.bringToTop(this.closeBtn);
  }

  constructor(scene: Scene, contentX: number, width: number, height: number) {
    super(scene, 0, 0);
    this.scene = scene;

    // Dim background
    const dim = scene.add.graphics();
    dim.fillStyle(0x000000, UI.MODAL_DIM_ALPHA);
    dim.fillRect(0, 0, scene.scale.width, height);
    dim.setInteractive(new Phaser.Geom.Rectangle(0, 0, scene.scale.width, height), Phaser.Geom.Rectangle.Contains);
    this.add(dim);

    // Modal panel (wider to fit three round columns on the Rounds tab)
    this.panelW = Math.min(width - 40, 680);
    this.panelH = Math.min(height - 80, 560);
    this.panelX = contentX + (width - this.panelW) / 2;
    this.panelY = (height - this.panelH) / 2;

    const panel = scene.add.graphics();
    panel.fillStyle(UI.MODAL_BG, 1);
    panel.fillRoundedRect(this.panelX, this.panelY, this.panelW, this.panelH, UI.MODAL_RADIUS);
    panel.lineStyle(2, UI.MODAL_BORDER, 1);
    panel.strokeRoundedRect(this.panelX, this.panelY, this.panelW, this.panelH, UI.MODAL_RADIUS);
    this.add(panel);

    // Title
    const title = scene.add
      .text(this.panelX + this.panelW / 2, this.panelY + 28, 'Journey Info', {
        fontFamily: FONTS.HEADING,
        fontSize: '24px',
        color: TEXT_COLORS.GOLD,
      })
      .setOrigin(0.5);
    this.add(title);

    // ─── Tab Buttons ───
    this.buildTabButtons();

    // ─── Tab Content Container ───
    this.tabContent = scene.add.container(0, 0);
    this.add(this.tabContent);

    // Default: show knowledge tab
    this.showKnowledgeTab();

    // Close button
    this.closeBtn = new Button(scene, this.panelX + this.panelW / 2, this.panelY + this.panelH - 38, 'Close', 120, 34);
    this.closeBtn.onClick(() => {
      this.tagTooltip.hide();
      const dirty = this.permitsDirty;
      this.permitsDirty = false;
      this.destroy();
      if (dirty) EventBus.emit(Events.PERMITS_CHANGED);
    });
    this.add(this.closeBtn);

    this.bringTabsToFront();

    this.setDepth(500);
    scene.add.existing(this);
  }

  destroy(fromScene?: boolean): void {
    this.tagTooltip.hide();
    super.destroy(fromScene);
  }

  private buildTabButtons(): void {
    const tabs = [
      { id: 'knowledge', label: 'Trail Knowledge' },
      { id: 'rounds', label: 'Rounds' },
      { id: 'permits', label: 'Permits' },
    ];

    const tabY = this.panelY + 58;
    const tabW = 120;
    const tabH = 28;
    const tabGap = 8;
    const totalW = tabs.length * tabW + (tabs.length - 1) * tabGap;
    const startX = this.panelX + this.panelW / 2 - totalW / 2;

    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      const x = startX + i * (tabW + tabGap);
      const y = tabY - tabH / 2;

      const container = this.scene.add.container(x, y);

      const bg = this.scene.add.graphics();
      bg.fillStyle(tab.id === this.activeTab ? 0x333366 : 0x1a1a30, 1);
      bg.fillRoundedRect(0, 0, tabW, tabH, 6);
      bg.lineStyle(1, 0x555588, 0.6);
      bg.strokeRoundedRect(0, 0, tabW, tabH, 6);
      container.add(bg);

      const label = this.scene.add
        .text(tabW / 2, tabH / 2, tab.label, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '12px',
          color: tab.id === this.activeTab ? TEXT_COLORS.PRIMARY : TEXT_COLORS.MUTED,
        })
        .setOrigin(0.5);
      container.add(label);

      // Transparent zone on top — Text blocks container hits on glyph pixels otherwise
      const hitZone = this.scene.add.zone(tabW / 2, tabH / 2, tabW, tabH);
      hitZone.setInteractive({ useHandCursor: true });
      hitZone.on('pointerup', () => this.switchTab(tab.id));
      container.add(hitZone);

      this.add(container);
      this.tabButtons.push(container);
    }
  }

  private switchTab(tabId: string): void {
    if (tabId === this.activeTab) return;
    this.activeTab = tabId;

    // Rebuild tab button styling
    const tabs = ['knowledge', 'rounds', 'permits'];
    const tabW = 120;
    const tabH = 28;
    for (let i = 0; i < this.tabButtons.length; i++) {
      const container = this.tabButtons[i];
      const isActive = tabs[i] === tabId;
      const bg = container.list[0] as GameObjects.Graphics;
      const label = container.list[1] as GameObjects.Text;
      bg.clear();
      bg.fillStyle(isActive ? 0x333366 : 0x1a1a30, 1);
      bg.fillRoundedRect(0, 0, tabW, tabH, 6);
      bg.lineStyle(1, 0x555588, 0.6);
      bg.strokeRoundedRect(0, 0, tabW, tabH, 6);
      label.setColor(isActive ? TEXT_COLORS.PRIMARY : TEXT_COLORS.MUTED);
    }

    this.refreshActiveTab();
  }

  private showRoundsTab(): void {
    ensureRoundSkipPreviewTags();

    const { top, bottom } = this.getContentArea();
    const labelY = top + 4;
    const panelsY = top + 26;

    const legLabel = this.scene.add
      .text(this.panelX + this.panelW / 2, labelY, `Leg ${getPlayerState().leg} — Current Leg Rounds`, {
        fontFamily: FONTS.PRIMARY,
        fontSize: '12px',
        color: TEXT_COLORS.MUTED,
      })
      .setOrigin(0.5, 0);
    this.tabContent.add(legLabel);

    createLegRoundPanelsForPlayer(
      this.scene,
      {
        x: this.panelX + 12,
        y: panelsY,
        width: this.panelW - 24,
        height: bottom - panelsY - 8,
      },
      {
        parent: this.tabContent,
        compact: true,
        showActions: false,
        depth: 510,
        onTagHover: (tag, ax, ay) => {
          this.tagTooltip.show(this.scene, tag, ax, ay, {
            minX: this.panelX + 8,
            maxX: this.panelX + this.panelW - 8,
            minY: this.getContentArea().top,
          }, 600);
        },
        onTagHoverEnd: () => this.tagTooltip.hide(),
      },
    );
  }

  private showKnowledgeTab(): void {
    const scene = this.scene;
    const panelX = this.panelX;
    const panelW = this.panelW;
    const panelY = this.panelY;

    const { top } = this.getContentArea();
    let rowY = top + 4;
    const rowH = 32;

    // Column positions
    const colName = panelX + 24;
    const colLevel = panelX + panelW * 0.38;
    const colMiles = panelX + panelW * 0.52;
    const colMult = panelX + panelW * 0.7;
    const colPlayed = panelX + panelW - 50;

    // Header row
    const headerName = scene.add.text(colName, rowY, 'Hand', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '11px',
      color: TEXT_COLORS.MUTED,
    });
    const headerLevel = scene.add.text(colLevel, rowY, 'Level', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '11px',
      color: TEXT_COLORS.MUTED,
    });
    const headerMiles = scene.add.text(colMiles, rowY, 'Miles', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '11px',
      color: TEXT_COLORS.MUTED,
    });
    const headerMult = scene.add.text(colMult, rowY, 'Mult', {
      fontFamily: FONTS.PRIMARY,
      fontSize: '11px',
      color: TEXT_COLORS.MUTED,
    });
    const headerPlayed = scene.add
      .text(colPlayed, rowY, 'Played', {
        fontFamily: FONTS.PRIMARY,
        fontSize: '11px',
        color: TEXT_COLORS.MUTED,
      })
      .setOrigin(0.5, 0);
    this.tabContent.add([headerName, headerLevel, headerMiles, headerMult, headerPlayed]);
    rowY += 20;

    // Separator
    const sep = scene.add.graphics();
    sep.lineStyle(1, COLORS.SIDEBAR_SECTION_BORDER, 0.5);
    sep.lineBetween(panelX + 20, rowY, panelX + panelW - 20, rowY);
    this.tabContent.add(sep);
    rowY += 6;

    const player = getPlayerState();

    for (let i = 0; i < hands.length; i++) {
      const hand = hands[i];
      const handType = hand.type as HandType;
      const stats = player.getHandStats(handType);

      // Row background (alternating)
      if (i % 2 === 0) {
        const rowBg = scene.add.graphics();
        rowBg.fillStyle(COLORS.SIDEBAR_SECTION, 0.5);
        rowBg.fillRect(panelX + 16, rowY - 2, panelW - 32, rowH);
        this.tabContent.add(rowBg);
      }

      const nameText = scene.add
        .text(colName, rowY + rowH / 2, hand.name, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '13px',
          color: TEXT_COLORS.PRIMARY,
        })
        .setOrigin(0, 0.5);

      const levelText = scene.add
        .text(colLevel, rowY + rowH / 2, `Lv.${stats.level}`, {
          fontFamily: FONTS.HEADING,
          fontSize: '13px',
          color: stats.level > 1 ? TEXT_COLORS.GOLD : TEXT_COLORS.SECONDARY,
        })
        .setOrigin(0, 0.5);

      const milesText = scene.add
        .text(colMiles, rowY + rowH / 2, `${hand.baseMiles + stats.milesPerLevel * (stats.level - 1)}`, {
          fontFamily: FONTS.HEADING,
          fontSize: '14px',
          color: '#6699ff',
        })
        .setOrigin(0, 0.5);

      const multText = scene.add
        .text(colMult, rowY + rowH / 2, `×${hand.baseMult + stats.multPerLevel * (stats.level - 1)}`, {
          fontFamily: FONTS.HEADING,
          fontSize: '14px',
          color: '#ff6666',
        })
        .setOrigin(0, 0.5);

      const playedText = scene.add
        .text(colPlayed, rowY + rowH / 2, `${stats.timesPlayed}`, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '13px',
          color: stats.timesPlayed > 0 ? TEXT_COLORS.PRIMARY : TEXT_COLORS.MUTED,
        })
        .setOrigin(0.5, 0.5);

      this.tabContent.add([nameText, levelText, milesText, multText, playedText]);
      rowY += rowH;
    }
  }

  private refreshActiveTab(): void {
    this.tagTooltip.hide();
    this.tabContent.removeAll(true);
    if (this.activeTab === 'knowledge') {
      this.showKnowledgeTab();
    } else if (this.activeTab === 'rounds') {
      this.showRoundsTab();
    } else {
      this.showPermitsTab();
    }
    this.bringTabsToFront();
  }

  private devAddPermit(): void {
    const id = window.prompt('Enter permit ID:');
    if (!id?.trim()) return;

    const result = devGrantPermit(id.trim());
    if (!result.ok) {
      window.alert(result.error);
      return;
    }

    this.permitsDirty = true;
    this.refreshActiveTab();
  }

  private showPermitsTab(): void {
    const scene = this.scene;
    const panelX = this.panelX;
    const panelW = this.panelW;
    const panelY = this.panelY;
    const player = getPlayerState();

    const { top } = this.getContentArea();
    let rowY = top + 4;
    const rowH = 44;

    if (player.purchasedPermits.length === 0) {
      const emptyText = scene.add
        .text(panelX + panelW / 2, panelY + this.panelH / 2 - 20, 'No permits purchased yet', {
          fontFamily: FONTS.PRIMARY,
          fontSize: '14px',
          color: TEXT_COLORS.MUTED,
        })
        .setOrigin(0.5);
      this.tabContent.add(emptyText);
    } else for (let i = 0; i < player.purchasedPermits.length; i++) {
      const permitId = player.purchasedPermits[i];
      const permit = getPermitById(permitId);
      if (!permit) continue;

      // Row background (alternating)
      if (i % 2 === 0) {
        const rowBg = scene.add.graphics();
        rowBg.fillStyle(COLORS.SIDEBAR_SECTION, 0.5);
        rowBg.fillRect(panelX + 16, rowY - 2, panelW - 32, rowH);
        this.tabContent.add(rowBg);
      }

      // Stage indicator
      const stageText = scene.add
        .text(panelX + 24, rowY + rowH / 2, `★${'★'.repeat(permit.stage - 1)}`, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '12px',
          color: '#aa88ff',
        })
        .setOrigin(0, 0.5);

      const nameText = scene.add
        .text(panelX + 60, rowY + rowH / 2 - 8, permit.name, {
          fontFamily: FONTS.HEADING,
          fontSize: '13px',
          color: TEXT_COLORS.PRIMARY,
        })
        .setOrigin(0, 0.5);

      const descText = scene.add
        .text(panelX + 60, rowY + rowH / 2 + 8, permit.description, {
          fontFamily: FONTS.PRIMARY,
          fontSize: '11px',
          color: TEXT_COLORS.SECONDARY,
          wordWrap: { width: panelW - 100 },
        })
        .setOrigin(0, 0.5);

      this.tabContent.add([stageText, nameText, descText]);
      rowY += rowH;
    }

    if (isDevMode()) {
      const addBtn = new Button(
        scene,
        panelX + panelW / 2,
        this.panelY + this.panelH - 78,
        'Add Permit',
        140,
        32,
      )
        .setColor(0x4a3a6b, 0x6a4a8b)
        .setDepth(510);
      addBtn.onClick(() => this.devAddPermit());
      this.tabContent.add(addBtn);
    }
  }
}
