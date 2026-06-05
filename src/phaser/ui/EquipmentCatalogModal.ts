// ─── EquipmentCatalogModal ───
// Scrollable grid of all equipment definitions, sorted by rarity.
// Available from Options — reference catalog for every player.

import { GameObjects, Scene } from 'phaser';
import { TEXT_COLORS, FONTS, UI } from '../../game/Constants';
import { getAllEquipment, type EquipmentDef } from '../../game/ItemsSystem';
import { getItemDisplayContext } from '../../game/displayContext';
import type { CardTemplate } from '../../data/items';
import { ItemCard } from './ItemCard';
import { createCatalogModalShell, finalizeCatalogModal, type CatalogModalShell } from './catalogModal';

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

export class EquipmentCatalogModal extends GameObjects.Container {
  private shell!: CatalogModalShell;
  private readonly itemCards: ItemCard[] = [];

  constructor(scene: Scene) {
    super(scene, 0, 0);

    const screenW = scene.scale.width;
    const screenH = scene.scale.height;
    const cardH = UI.CARD_H;

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
      listBottomOffset: 48,
      onClose: () => this.destroy(),
    });

    const innerPad = 24;
    const gridW = panelW - innerPad * 2;
    const cols = Math.max(1, Math.floor((gridW + SHOP_CARD_SPACING) / SHOP_CARD_SPACING)) - 1;
    const gridStartX = -((cols - 1) * SHOP_CARD_SPACING) / 2;

    let layoutY = 0;

    for (const rarity of RARITY_ORDER) {
      const group = getAllEquipment()
        .filter((item) => item.rarity === rarity)
        .sort((a, b) => a.name.localeCompare(b.name));
      if (group.length === 0) continue;

      layoutY += SECTION_HEADER_H / 2;
      const sectionLabel = scene.add
        .text(0, layoutY, RARITY_SECTION_LABELS[rarity] ?? rarity, {
          fontFamily: FONTS.HEADING,
          fontSize: '14px',
          color: RARITY_SECTION_COLORS[rarity] ?? TEXT_COLORS.SECONDARY,
        })
        .setOrigin(0.5);
      this.shell.scrollContainer.add(sectionLabel);
      layoutY += SECTION_HEADER_H / 2 + SECTION_GAP;

      const rows = Math.ceil(group.length / cols);
      const gridTop = layoutY;

      for (let i = 0; i < group.length; i++) {
        const def = group[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = gridStartX + col * SHOP_CARD_SPACING;
        const cy = gridTop + cardH / 2 + row * CARD_ROW_SPACING;

        const card = this.createCatalogCard(scene, cx, cy, def);
        this.shell.scrollContainer.add(card);
        this.itemCards.push(card);
      }

      layoutY += rows * CARD_ROW_SPACING + SECTION_GAP;
    }

    this.shell.setContentHeight(layoutY);

    finalizeCatalogModal(this, scene);
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
    return card;
  }

  destroy(fromScene?: boolean): void {
    for (const card of this.itemCards) {
      card.destroy();
    }
    this.itemCards.length = 0;
    this.shell.destroyManagedObjects();
    super.destroy(fromScene);
  }
}
