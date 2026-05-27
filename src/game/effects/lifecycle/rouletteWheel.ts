import type { EquipmentInstance } from '../../ItemsSystem';
import { rngOneDecimal } from '../../RunRng';

export function rollRouletteWheelXMult(equip: EquipmentInstance): void {
  const p = equip.def.effectParams as Record<string, unknown>;
  const min = (p.min as number) ?? 1.0;
  const max = (p.max as number) ?? 4.0;
  equip.state.xMult = rngOneDecimal('equipment', min, max);
}
