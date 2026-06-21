// ─── EquipmentCatalogModal ───
// Scrollable grid of all equipment definitions, sorted by rarity.
// Available from Options — reference catalog for every player.

import { GameObjects, Scene } from 'phaser';
import { TEXT_COLORS, FONTS, UI, DIFFICULTIES } from '../../game/Constants';
import { getAllEquipment, type EquipmentDef } from '../../game/ItemsSystem';
import { getItemDisplayContext } from '../../game/displayContext';
import type { CardTemplate } from '../../data/items';
import { getEquipmentHighestDifficultyBeaten } from '../../game/UserStats';
import type { DifficultyLevel } from '../../game/types';
import { ItemCard } from './ItemCard';
import { Button } from './Button';
import { addDifficultyImage } from './DifficultyAssets';
import { addTopRightBadge } from './itemCard/ItemCardBadges';
import {
  CATALOG_CHROME_DEPTH,
  createCatalogModalShell,
  finalizeCatalogModal,
  type CatalogModalShell,
} from './catalogModal';

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'legendary'] as const;

const RARITY_SECTION_LABELS: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  legendary: 'Legendary',
};

const RARITY_SECTION_COLORS: Record<string, string> = {
  common: '#88aa88',
  uncommon: '#8888cc',
  rare: '#ccaa44',
  legendary: '#cc66aa',
};

/** Match ShopScene equipment card spacing (center-to-center). */
const SHOP_CARD_SPACING = 185;
const CARD_ROW_SPACING = 220;
const SECTION_GAP = 16;
const SECTION_HEADER_H = 28;
const SCREEN_MARGIN = 12;
const MAX_DIFFICULTY = DIFFICULTIES.length;

type CatalogFilter = 'all' | 'gold' | 'notGold';

export class EquipmentCatalogModal extends GameObjects.Container {
  private shell!: CatalogModalShell;
  private readonly itemCards: ItemCard[] = [];
  private readonly sectionLabels: GameObjects.Text[] = [];
  private filterMode: CatalogFilter = 'all';
  private filterBtns: Button[] = [];
  private cols = 1;
  private gridStartX = 0;

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
      title: 'Equipment',
      subtitle: `${getAllEquipment().length} items · hover for details`,
      titleFontSize: '24px',
      titleY: 24,
      subtitleY: 50,
      listTopOffset: 90,
      listBottomOffset: 48,
      onClose: () => this.destroy(),
    });

    const innerPad = 24;
    const gridW = panelW - innerPad * 2;
    this.cols = Math.max(1, Math.floor((gridW + SHOP_CARD_SPACING) / SHOP_CARD_SPACING)) - 1;
    this.gridStartX = -((this.cols - 1) * SHOP_CARD_SPACING) / 2;

    const filterY = panelY + 56;
    const filterLabels: { label: string; mode: CatalogFilter }[] = [
      { label: 'All', mode: 'all' },
      { label: 'Gold Sticker', mode: 'gold' },
      { label: 'No Gold Sticker', mode: 'notGold' },
    ];
    const filterBtnW = 120;
    const filterGap = 8;
    const totalFilterW = filterLabels.length * filterBtnW + (filterLabels.length - 1) * filterGap;
    const filterStartX = panelX + panelW / 2 - totalFilterW / 2 + filterBtnW / 2;

    for (let i = 0; i < filterLabels.length; i++) {
      const { label, mode } = filterLabels[i];
      const btn = new Button(scene, filterStartX + i * (filterBtnW + filterGap), filterY, label, {
        variant: 'secondary',
        width: filterBtnW,
        height: 28,
      });
      btn.setDepth(CATALOG_CHROME_DEPTH);
      btn.onClick(() => {
        this.filterMode = mode;
        this.updateFilterButtons();
        this.rebuildGrid();
      });
      this.shell.track(btn);
      this.filterBtns.push(btn);
    }

    this.updateFilterButtons();
    this.rebuildGrid();

    finalizeCatalogModal(this, scene);
  }

  private updateFilterButtons(): void {
    const modes: CatalogFilter[] = ['all', 'gold', 'notGold'];
    for (let i = 0; i < this.filterBtns.length; i++) {
      this.filterBtns[i].setEnabled(modes[i] !== this.filterMode);
    }
  }

  private matchesFilter(defId: string): boolean {
    const highest = getEquipmentHighestDifficultyBeaten(defId);
    if (this.filterMode === 'all') return true;
    if (this.filterMode === 'gold') return highest >= MAX_DIFFICULTY;
    return highest < MAX_DIFFICULTY;
  }

  private clearGrid(): void {
    for (const card of this.itemCards) {
      card.destroy();
    }
    this.itemCards.length = 0;

    for (const label of this.sectionLabels) {
      label.destroy();
    }
    this.sectionLabels.length = 0;
  }

  private rebuildGrid(): void {
    this.clearGrid();

    const cardH = UI.CARD_H;
    let layoutY = 0;

    for (const rarity of RARITY_ORDER) {
      const group = getAllEquipment()
        .filter((item) => item.rarity === rarity && this.matchesFilter(item.id))
        .sort((a, b) => a.name.localeCompare(b.name));
      if (group.length === 0) continue;

      layoutY += SECTION_HEADER_H / 2;
      const sectionLabel = this.scene.add
        .text(0, layoutY, RARITY_SECTION_LABELS[rarity] ?? rarity, {
          fontFamily: FONTS.HEADING,
          fontSize: '14px',
          color: RARITY_SECTION_COLORS[rarity] ?? TEXT_COLORS.SECONDARY,
        })
        .setOrigin(0.5);
      this.shell.scrollContainer.add(sectionLabel);
      this.sectionLabels.push(sectionLabel);
      layoutY += SECTION_HEADER_H / 2 + SECTION_GAP;

      const rows = Math.ceil(group.length / this.cols);
      const gridTop = layoutY;

      for (let i = 0; i < group.length; i++) {
        const def = group[i];
        const col = i % this.cols;
        const row = Math.floor(i / this.cols);
        const cx = this.gridStartX + col * SHOP_CARD_SPACING;
        const cy = gridTop + cardH / 2 + row * CARD_ROW_SPACING;

        const card = this.createCatalogCard(this.scene, cx, cy, def);
        this.shell.scrollContainer.add(card);
        this.itemCards.push(card);
      }

      layoutY += rows * CARD_ROW_SPACING + SECTION_GAP;
    }

    this.shell.setContentHeight(layoutY);
  }

  private createCatalogCard(scene: Scene, x: number, y: number, def: EquipmentDef): ItemCard {
    const cardData = {
      id: def.id,
      name: def.name,
      description: '',
      cost: def.cost,
      rarity: def.rarity,
      aura: def.aura,
      cardTemplate: (def as { cardTemplate?: CardTemplate }).cardTemplate,
      display: def.display,
    };
    const card = new ItemCard(scene, x, y, cardData, {
      mode: 'shop',
      showCost: false,
    });
    card.setTooltipContext(null, getItemDisplayContext());
    card.setSuppressHints(true);

    const highest = getEquipmentHighestDifficultyBeaten(def.id);
    if (highest > 0) {
      card.setEquipmentBeatLevel(highest);
      addTopRightBadge(scene, card, { cardW: UI.CARD_W, cardH: UI.CARD_H }, 0, (badgeScene, container, size) => {
        addDifficultyImage(badgeScene, container, highest as DifficultyLevel, 0, 0, size);
      });
    }

    return card;
  }

  destroy(fromScene?: boolean): void {
    this.clearGrid();
    this.shell.destroyManagedObjects();
    super.destroy(fromScene);
  }
}
