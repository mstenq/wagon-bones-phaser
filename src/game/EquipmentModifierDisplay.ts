// ─── Equipment Modifier Display (No Phaser imports) ───
// Tooltip and hint text for difficulty equipment modifiers.

import { EQUIPMENT_MODIFIER } from './Constants';
import type { HintSegment } from '../data/items';
import { EquipmentInstance, isEquipmentCursed, isEquipmentLeased, isEquipmentPerishable } from './ItemsSystem';

export interface ModifierTooltipLine {
  text: string;
  color: string;
}

/** Lines appended to equipment card tooltips when modifiers are active. */
export function getModifierTooltipLines(equip: EquipmentInstance): ModifierTooltipLine[] {
  const lines: ModifierTooltipLine[] = [];

  if (isEquipmentCursed(equip)) {
    lines.push({ text: '🔒 Cursed — Cannot sell', color: '#999999' });
  }
  if (isEquipmentPerishable(equip)) {
    const rounds = equip.perishableRoundsLeft ?? '?';
    lines.push({ text: `⏱ Perishable — ${rounds} round${rounds === 1 ? '' : 's'} left`, color: '#ff8800' });
  }
  if (isEquipmentLeased(equip)) {
    lines.push({
      text: `💰 Leased — $${EQUIPMENT_MODIFIER.LEASED_UPKEEP}/round upkeep`,
      color: '#ffd700',
    });
  }

  return lines;
}

/** Hint rows shown below normal equipment hints (one row per modifier). */
export function getModifierHintRows(equip: EquipmentInstance): HintSegment[][] {
  const rows: HintSegment[][] = [];

  if (isEquipmentCursed(equip)) {
    rows.push([{ text: '🔒 Cursed', style: 'inactive' }]);
  }
  if (isEquipmentPerishable(equip)) {
    rows.push([{ text: 'Perishable', style: 'condition' }]);
  }
  if (isEquipmentLeased(equip)) {
    rows.push([{ text: `$${EQUIPMENT_MODIFIER.LEASED_UPKEEP}/r`, style: 'money' }]);
  }

  return rows;
}
