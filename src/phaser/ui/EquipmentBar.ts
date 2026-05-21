// ─── EquipmentBar ───
// Top bar in the main content area showing owned equipment cards.
// Balatro-style: always visible across shop and game scenes.
// Cards are drag-to-reorder since scoring depends on equipment order (L→R).

import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { UI } from '../../game/Constants';
import { EventBus, Events } from '../../game/EventBus';
import { getPlayerState } from '../../game/PlayerState';
import { ItemCard, CardActionTabConfig } from './ItemCard';
import { CardBar } from './CardBar';
import type { GameState } from '../../game/GameState';
import type { PlayerState } from '../../game/PlayerState';
import { isDevMode, devGetAllAuras } from '../../game/DevMode';
import { getItemAuraById } from '../../game/ItemsSystem';
import {
  getBossEquipmentDisplayOrder,
  isBossEquipmentHidden,
  isBossEquipmentHintsHidden,
  isEquipmentDisabledByBoss,
  remapEquipmentDisplayOrderAfterRemove,
  remapEquipmentDisplayOrderAfterReorder,
  syncEquipmentDisplayOrder,
} from '../../game/BossEffectsSystem';
import { isEquipmentCursed, isEquipmentPerishable } from '../../game/ItemsSystem';
import {
  applyEquipmentModifierDestructions,
  type EquipmentModifierRoundResult,
} from '../../game/EquipmentModifiers';

export class EquipmentBar extends CardBar {
  protected readonly cardScale = UI.EQUIP_CARD_SCALE;
  protected readonly preferredSpacing = UI.EQUIP_CARD_SPACING;
  protected readonly barPadding = 20;
  private devIcons: Phaser.GameObjects.Text[] = [];
  private lastGame: GameState | null = null;

  constructor(scene: Scene, x: number, y: number, width: number, height: number) {
    super(scene, x, y, width, height);
    this.refresh();
  }

  /** Update all card hints with current game context */
  updateHints(game: GameState | null, player: PlayerState): void {
    this.lastGame = game;
    const hintsHidden = isBossEquipmentHintsHidden();
    const faceHidden = isBossEquipmentHidden();
    for (const card of this.cards) {
      const equipIndex = card.getData('equipIndex') as number;
      const equip = player.equipment[equipIndex];
      card.setSuppressHints(hintsHidden);
      card.setSuppressTooltip(hintsHidden);
      card.setFaceDown(faceHidden);
      card.setBossDisabled(isEquipmentDisabledByBoss(equipIndex));
      if (equip) card.updateModifierBadges(equip);
      if (!hintsHidden) card.updateHints(game, player);
    }
  }

  /** Animate perished/repossessed cards, then apply destruction and refresh. */
  animateModifierDestructions(
    result: EquipmentModifierRoundResult,
    onComplete: () => void,
  ): void {
    const entries = [
      ...result.perished.map((p) => ({ index: p.index, type: 'perished' as const })),
      ...result.leaseDefaulted.map((p) => ({ index: p.index, type: 'repossessed' as const })),
    ];

    const run = (i: number) => {
      if (i >= entries.length) {
        applyEquipmentModifierDestructions(getPlayerState(), result);
        this.refresh();
        this.updateHints(this.lastGame, getPlayerState());
        onComplete();
        return;
      }

      const card = this.getCardByEquipIndex(entries[i].index);
      if (!card) {
        run(i + 1);
        return;
      }

      card.animateModifierDestruction(entries[i].type, () => run(i + 1));
    };

    run(0);
  }

  /** Flash warnings on perishable items with one round left. */
  flashPerishableWarnings(): void {
    const player = getPlayerState();
    for (const card of this.cards) {
      const equipIndex = card.getData('equipIndex') as number;
      const equip = player.equipment[equipIndex];
      if (equip && isEquipmentPerishable(equip) && equip.perishableRoundsLeft === 1) {
        card.flashPerishableWarning();
      }
    }
  }

  /** Brief pulse on leased badges when upkeep was paid. */
  flashLeasedUpkeepPaid(indices: number[]): void {
    for (const index of indices) {
      this.getCardByEquipIndex(index)?.flashLeasedPaid();
    }
  }

  /** Find the card showing a specific equipment array index (respects Land Slide shuffle) */
  getCardByEquipIndex(equipIndex: number): ItemCard | null {
    return this.cards.find((c) => (c.getData('equipIndex') as number) === equipIndex) ?? null;
  }

  protected isDragReorderEnabled(): boolean {
    return !isBossEquipmentHidden();
  }

  refresh(): void {
    syncEquipmentDisplayOrder();

    // Remove old dev icons
    for (const icon of this.devIcons) icon.destroy();
    this.devIcons = [];

    super.refresh();

    // Add dev icons for aura change
    if (isDevMode()) {
      const player = getPlayerState();
      const count = player.equipment.length;
      if (count === 0) return;
      const spacing = this.getCardSpacing(count);
      const totalW = (count - 1) * spacing;
      const startX = this.barWidth / 2 - totalW / 2;
      const cy = this.barHeight / 2 - 20; // same CARD_VERTICAL_OFFSET

      for (let i = 0; i < count; i++) {
        const ix = startX + i * spacing + 45;
        const iy = cy - 60;
        const icon = this.scene.add.text(ix, iy, '🔧', { fontSize: '14px' })
          .setOrigin(0.5)
          .setDepth(300)
          .setInteractive({ useHandCursor: true });
        const equipIndex = i;
        icon.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
          pointer.event.stopPropagation();
          this.devChangeAura(equipIndex);
        });
        icon.on('pointerover', () => icon.setScale(1.3));
        icon.on('pointerout', () => icon.setScale(1));
        this.add(icon);
        this.devIcons.push(icon);
      }
    }
  }

  private devChangeAura(equipIndex: number): void {
    const player = getPlayerState();
    const equip = player.equipment[equipIndex];
    if (!equip) return;

    const auras = devGetAllAuras();
    const options = ['none', ...auras.map(a => `${a.id} (${a.name})`)];
    const current = equip.def.aura?.id ?? 'none';
    const choice = window.prompt(
      `Select aura for "${equip.def.name}"\nCurrent: ${current}\nOptions: ${options.join(', ')}`,
      current,
    );
    if (choice === null) return;

    const trimmed = choice.trim().split(' ')[0]; // take first word (the ID)
    if (trimmed === 'none') {
      equip.def = { ...equip.def, aura: null };
    } else {
      const aura = getItemAuraById(trimmed);
      if (!aura) {
        // Show brief error - we can't easily use scene tweens from here, so just alert
        window.alert('Aura not found');
        return;
      }
      equip.def = { ...equip.def, aura };
    }
    this.refresh();
    this.emit('equipment-changed');
  }

  // ─── CardBar abstract implementations ───

  protected getSlotLabel(): string {
    const player = getPlayerState();
    return `${player.usedEquipmentSlots}/${player.maxEquipmentSlots}`;
  }

  protected getItemCount(): number {
    return getPlayerState().equipment.length;
  }

  /** Visual slot index → equipment array index (Land Slide shuffle) */
  private getEquipmentIndexForSlot(slotIndex: number): number {
    const order = getBossEquipmentDisplayOrder();
    if (order && slotIndex < order.length) return order[slotIndex];
    return slotIndex;
  }

  protected createCardForItem(x: number, y: number, index: number): ItemCard {
    const equipIndex = this.getEquipmentIndexForSlot(index);
    const equip = getPlayerState().equipment[equipIndex];
    const card = new ItemCard(this.scene, x, y, equip.def, {
      mode: 'compact',
      cardScale: UI.EQUIP_CARD_SCALE,
      equipment: equip,
    });
    card.setData('equipIndex', equipIndex);
    card.setBossDisabled(isEquipmentDisabledByBoss(equipIndex));
    card.setFaceDown(isBossEquipmentHidden());
    card.setSuppressTooltip(isBossEquipmentHintsHidden());
    card.setSuppressHints(isBossEquipmentHintsHidden());
    return card;
  }

  protected buildActionTabs(card: ItemCard, index: number): CardActionTabConfig[] | null {
    const player = getPlayerState();
    const equipIndex = (card.getData('equipIndex') as number) ?? this.getEquipmentIndexForSlot(index);
    const equip = player.equipment[equipIndex];
    if (!equip) return null;
    if (isEquipmentCursed(equip)) {
      return [
        {
          label: 'SELL\n—',
          color: 0x333333,
          textColor: '#666666',
          disabled: true,
          callback: () => {},
        },
      ];
    }

    return [
      {
        label: `SELL\n$${equip.sellValue}`,
        color: 0x338833,
        callback: () => this.animateSellCard(card, equipIndex),
      },
    ];
  }

  protected onReorder(fromIndex: number, toIndex: number): void {
    const fromEquip = this.getEquipmentIndexForSlot(fromIndex);
    const toEquip = this.getEquipmentIndexForSlot(toIndex);
    getPlayerState().reorderEquipment(fromEquip, toEquip);
    if (getBossEquipmentDisplayOrder()) {
      remapEquipmentDisplayOrderAfterReorder(fromEquip, toEquip);
      this.refresh();
    }
    this.updateHints(this.lastGame, getPlayerState());
  }

  protected onSellComplete(index: number): void {
    remapEquipmentDisplayOrderAfterRemove(index);
    const player = getPlayerState();
    const grantsTag = player.equipment[index]?.def.effectType === 'SELL_GRANT_TAG';
    if (!player.sellEquipment(index)) return;
    if (grantsTag) {
      EventBus.emit(Events.TAG_QUEUE_CHANGED);
    }
    this.emit('equipment-changed');
  }
}
