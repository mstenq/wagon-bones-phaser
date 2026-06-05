// ─── EquipmentBar ───
// Top bar in the main content area showing owned equipment cards.
// Balatro-style: always visible across shop and game scenes.
// Cards are drag-to-reorder since scoring depends on equipment order (L→R).

import * as Phaser from 'phaser';
import { Scene } from 'phaser';
import { UI } from '../../game/Constants';
import { getItemDisplayContext } from '../../game/displayContext';
import { equipmentActions } from '../../game/store/actions/equipmentActions';
import { resolveEquipmentList } from '../../game/store/resolve';
import { runStore } from '../../game/store/runStore';
import { roundStore } from '../../game/store/roundStore';
import {
  selectEquipmentBarSlotLabel,
  selectEquipmentBarSnapshot,
  selectEquipmentHintRoundContext,
} from '../../game/store/selectors/uiSelectors';
import { ItemCard, CardActionTabConfig } from './ItemCard';
import { CardBar } from './CardBar';
import type { RoundHintContext } from '../../game/displayContext';
import { isDevMode, devGetAllAuras } from '../../game/DevMode';
import { getItemAuraById, isEquipmentCursed, isEquipmentPerishable } from '../../game/ItemsSystem';
import {
  getBossEquipmentDisplayOrder,
  isBossEquipmentHidden,
  isBossEquipmentHintsHidden,
  isEquipmentDisabledByBoss,
  remapEquipmentDisplayOrderAfterRemove,
  remapEquipmentDisplayOrderAfterReorder,
  syncEquipmentDisplayOrder,
} from '../../game/BossEffectsSystem';
import { applyEquipmentModifierDestructions, type EquipmentModifierRoundResult } from '../../game/EquipmentModifiers';
import { bindGameObject } from '../store/subscribe';

export class EquipmentBar extends CardBar {
  protected readonly cardScale = UI.EQUIP_CARD_SCALE;
  protected readonly preferredSpacing = UI.EQUIP_CARD_SPACING;
  protected readonly barPadding = 20;
  private devIcons: Phaser.GameObjects.Text[] = [];
  private hintRound: RoundHintContext | null = null;
  private slotLabel = '';

  constructor(scene: Scene, x: number, y: number, width: number, height: number) {
    super(scene, x, y, width, height);

    bindGameObject(this, runStore, selectEquipmentBarSnapshot, () => this.rebuildFromStore(), {
      equalityFn: (a, b) => a === b,
    });
    bindGameObject(this, runStore, selectEquipmentBarSlotLabel, (label) => {
      this.slotLabel = label;
      this.slotCountText.setText(label);
    });
    bindGameObject(this, roundStore, selectEquipmentHintRoundContext, () => this.syncHintsFromStore());
  }

  /** Round facade for item hint display (null in shop / pack scenes). */
  setHintRound(round: RoundHintContext | null): void {
    this.hintRound = round;
    this.syncHintsFromStore();
  }

  private rebuildFromStore(): void {
    if (this.isDragSettling()) return;
    syncEquipmentDisplayOrder();
    for (const icon of this.devIcons) icon.destroy();
    this.devIcons = [];
    if (!this.tryRefreshCardsInPlace()) {
      super.rebuildCards();
    }
    this.addDevIconsIfNeeded();
    this.syncHintsFromStore();
  }

  /** Update hints/badges without destroying cards (preserves idle wobble tweens). */
  private tryRefreshCardsInPlace(): boolean {
    const count = this.getItemCount();
    if (this.cards.length !== count) return false;
    for (let i = 0; i < count; i++) {
      const equipIndex = this.getEquipmentIndexForSlot(i);
      const card = this.cards[i];
      const equip = resolveEquipmentList()[equipIndex];
      if (!card || (card.getData('equipIndex') as number) !== equipIndex) return false;
      if (!equip || card.equipment?.def.id !== equip.def.id) return false;
      if ((card.def.aura?.id ?? '') !== (equip.def.aura?.id ?? '')) return false;
    }
    return true;
  }

  private syncHintsFromStore(): void {
    const player = getItemDisplayContext();
    const equipment = resolveEquipmentList();
    const hintsHidden = isBossEquipmentHintsHidden();
    const faceHidden = isBossEquipmentHidden();
    for (const card of this.cards) {
      if (!card.scene) continue;
      const equipIndex = card.getData('equipIndex') as number;
      const equip = equipment[equipIndex];
      card.setSuppressHints(hintsHidden);
      card.setSuppressTooltip(hintsHidden);
      card.setFaceDown(faceHidden);
      card.setBossDisabled(isEquipmentDisabledByBoss(equipIndex));
      if (equip) {
        card.updateModifierBadges(equip);
        card.syncAuraFromEquipment(equip);
      }
      card.setTooltipContext(this.hintRound, player);
      if (!hintsHidden) card.updateHints(this.hintRound, player);
    }
  }

  /** Animate perished/repossessed cards, then apply destruction and refresh. */
  animateModifierDestructions(result: EquipmentModifierRoundResult, onComplete: () => void): void {
    const entries = [
      ...result.perished.map((p) => ({ index: p.index, type: 'perished' as const })),
      ...result.leaseDefaulted.map((p) => ({ index: p.index, type: 'repossessed' as const })),
    ];

    const run = (i: number) => {
      if (i >= entries.length) {
        applyEquipmentModifierDestructions(result);
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
    const equipment = resolveEquipmentList();
    for (const card of this.cards) {
      const equipIndex = card.getData('equipIndex') as number;
      const equip = equipment[equipIndex];
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

  private addDevIconsIfNeeded(): void {
    if (!isDevMode()) return;
    const equipment = resolveEquipmentList();
    const count = equipment.length;
    if (count === 0) return;
    const spacing = this.getCardSpacing(count);
    const totalW = (count - 1) * spacing;
    const startX = this.barWidth / 2 - totalW / 2;
    const cy = this.barHeight / 2 - 20;

    for (let i = 0; i < count; i++) {
      const ix = startX + i * spacing + 45;
      const iy = cy - 60;
      const icon = this.scene.add
        .text(ix, iy, '🔧', { fontSize: '14px' })
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

  private devChangeAura(equipIndex: number): void {
    const equipment = resolveEquipmentList();
    const equip = equipment[equipIndex];
    if (!equip) return;

    const auras = devGetAllAuras();
    const options = ['none', ...auras.map((a) => `${a.id} (${a.name})`)];
    const current = equip.def.aura?.id ?? 'none';
    const choice = window.prompt(
      `Select aura for "${equip.def.name}"\nCurrent: ${current}\nOptions: ${options.join(', ')}`,
      current,
    );
    if (choice === null) return;

    const trimmed = choice.trim().split(' ')[0];
    if (trimmed === 'none') {
      equip.def = { ...equip.def, aura: null };
    } else {
      const aura = getItemAuraById(trimmed);
      if (!aura) {
        window.alert('Aura not found');
        return;
      }
      equip.def = { ...equip.def, aura };
    }
    this.emit('equipment-changed');
  }

  protected getSlotLabel(): string {
    return this.slotLabel || selectEquipmentBarSlotLabel();
  }

  protected getItemCount(): number {
    return resolveEquipmentList().length;
  }

  private getEquipmentIndexForSlot(slotIndex: number): number {
    const order = getBossEquipmentDisplayOrder();
    if (order && slotIndex < order.length) return order[slotIndex];
    return slotIndex;
  }

  protected createCardForItem(x: number, y: number, index: number): ItemCard {
    const equipIndex = this.getEquipmentIndexForSlot(index);
    const equip = resolveEquipmentList()[equipIndex]!;
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
    const equipIndex = (card.getData('equipIndex') as number) ?? this.getEquipmentIndexForSlot(index);
    const equip = resolveEquipmentList()[equipIndex];
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
    equipmentActions.reorderEquipment(fromEquip, toEquip);
    if (getBossEquipmentDisplayOrder()) {
      remapEquipmentDisplayOrderAfterReorder(fromEquip, toEquip);
    }
    this.syncCardEquipIndices();
    this.syncHintsFromStore();
  }

  /** Keep card equipIndex data aligned with visual slot after drag reorder (store order changed). */
  private syncCardEquipIndices(): void {
    for (let i = 0; i < this.cards.length; i++) {
      this.cards[i].setData('equipIndex', this.getEquipmentIndexForSlot(i));
    }
  }

  protected onSellComplete(index: number): void {
    remapEquipmentDisplayOrderAfterRemove(index);
    if (!equipmentActions.sellEquipment(index)) return;
    this.emit('equipment-changed');
  }
}
