// ─── ItemCard shared types ───

import type { ItemAura, EquipmentInstance } from '../../../game/ItemsSystem';
import type { ItemDisplayResult } from '../../../game/ItemsSystem';
import type { CardTemplate } from '../../../data/items';
import type { RoundHintContext, ItemDisplayContext } from '../../../game/displayContext';

/** Generic data shape for any card type */
export interface CardData {
  id: string;
  name: string;
  cost?: number;
  rarity?: string;
  aura?: ItemAura | null;
  cardTemplate?: CardTemplate;
  display: (round: RoundHintContext | null, player: ItemDisplayContext) => ItemDisplayResult;
}

export interface ItemCardOptions {
  /** Display mode affects layout and what info is shown */
  mode?: 'shop' | 'inventory' | 'compact';
  /** Show cost badge (shop mode default) */
  showCost?: boolean;
  /** Show sell value instead of cost */
  sellValue?: number;
  /** Scale multiplier (default 1) */
  cardScale?: number;
  /** Legacy texture key prefix. When provided, texture key is `${prefix}${id}` with no frame. */
  texturePrefix?: string;
  /** Texture key for atlas/non-atlas lookup (default 'items' when texturePrefix is unset). */
  textureKey?: string;
  /** Frame suffix when using atlas mode (default '.png'). */
  textureFrameSuffix?: string;
  /** Image fit mode for non-transparent cards */
  imageFit?: 'cover' | 'contain';
  /** If true, no card background is drawn and image is displayed as-is (contain-fit) */
  transparentBg?: boolean;
  /** Override x-anchor for action tabs (default: card half-width). Useful for narrow images. */
  tabAnchorX?: number;
  /** Owned equipment instance — enables modifier badges and tooltip lines */
  equipment?: EquipmentInstance;
}

export interface CardActionTabConfig {
  label: string;
  color: number;
  textColor?: string;
  callback: () => void;
  /** 'bottom' for below-card tabs; omit for side tabs (auto left/right from screen space). */
  position?: 'bottom';
  /** Grayed-out tab with no action (e.g. cursed equipment) */
  disabled?: boolean;
}

export interface SegmentRenderMetrics {
  fontSize: number;
  padX: number;
  padY: number;
}

export interface CardTextureSource {
  key: string;
  frame?: string;
}

export interface ItemCardLayout {
  cardW: number;
  cardH: number;
  cardScale: number;
  tabAnchorX: number;
  /** Extra space above card top (e.g. shop price tag) for active tooltip placement. */
  topClearance: number;
}

export const RARITY_LABELS: Record<string, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  legendary: 'Legendary',
};

export const RARITY_LABEL_COLORS: Record<string, string> = {
  common: '#88aa88',
  uncommon: '#8888cc',
  rare: '#ccaa44',
  legendary: '#cc66aa',
};
