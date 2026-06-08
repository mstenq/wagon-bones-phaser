// ─── Consumable eligibility types (No Phaser imports) ───

export type { ConsumableUseMode } from '../../data/consumableTypes';

export type ConsumableUseSource = 'bar' | 'shop_buy_use' | 'pack_card' | 'pack_bar';

export type ConsumableEligibilityContext =
  | { scene: 'shop'; source: ConsumableUseSource }
  | { scene: 'other'; source: ConsumableUseSource }
  | { scene: 'booster_pack'; source: ConsumableUseSource; visibleDieIds: string[] }
  | {
      scene: 'game';
      source: ConsumableUseSource;
      phase: 'SELECT' | 'ROLL';
      visibleDieIds: string[];
      scoreableDieIds: string[];
      isScoreActionVisible: boolean;
    };

export type ConsumableUseEligibility = { allowed: true } | { allowed: false; reason: string };
