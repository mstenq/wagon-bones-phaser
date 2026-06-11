// ─── Button theme helpers ───
// Pure helpers — no Phaser imports.

import { COLORS, TEXT_COLORS } from '../../game/Constants';

export const BUTTON_VARIANTS = ['primary', 'secondary', 'dark', 'danger', 'warning', 'success'] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];

export const BUTTON_SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
export type ButtonSize = (typeof BUTTON_SIZES)[number];

export type ButtonOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  width?: number;
  height?: number;
};

export type ButtonVariantTheme = {
  face: number;
  disabledFace: number;
};

export type ButtonSizeMetrics = {
  height: number;
  fontSize: number;
  minWidth: number;
};

const SIZE_METRICS: Record<ButtonSize, ButtonSizeMetrics> = {
  xs: { height: 24, fontSize: 12, minWidth: 24 },
  sm: { height: 32, fontSize: 14, minWidth: 80 },
  md: { height: 44, fontSize: 18, minWidth: 120 },
  lg: { height: 48, fontSize: 20, minWidth: 160 },
  xl: { height: 52, fontSize: 22, minWidth: 200 },
};

const VARIANT_FACE: Record<ButtonVariant, number> = {
  primary: COLORS.BTN_FACE_PRIMARY,
  secondary: COLORS.BTN_FACE_SECONDARY,
  dark: COLORS.BTN_FACE_DARK,
  danger: COLORS.BTN_FACE_DANGER,
  warning: COLORS.BTN_FACE_WARNING,
  success: COLORS.BTN_FACE_SUCCESS,
};

export function getButtonVariantTheme(variant: ButtonVariant): ButtonVariantTheme {
  return {
    face: VARIANT_FACE[variant],
    disabledFace: COLORS.BTN_FACE_DISABLED,
  };
}

export function getButtonSizeMetrics(size: ButtonSize): ButtonSizeMetrics {
  return SIZE_METRICS[size];
}

/** Darken a 0xRRGGBB face color by `amount` (0–1). */
export function darkenFaceColor(color: number, amount: number): number {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  const factor = 1 - amount;
  const dr = Math.round(r * factor);
  const dg = Math.round(g * factor);
  const db = Math.round(b * factor);
  return (dr << 16) | (dg << 8) | db;
}

export function buttonLabelColor(variant: ButtonVariant, disabled: boolean): string {
  if (disabled) return TEXT_COLORS.BTN_DISABLED_LABEL;
  if (variant === 'dark') return TEXT_COLORS.PRIMARY;
  return '#000000';
}

export function resolveButtonDimensions(
  options: ButtonOptions | undefined,
  legacyWidth?: number,
  legacyHeight?: number,
): { width: number; height: number; fontSize: number; variant: ButtonVariant; size: ButtonSize } {
  const size = options?.size ?? 'md';
  const metrics = getButtonSizeMetrics(size);
  const variant = options?.variant ?? 'primary';
  const height = options?.height ?? legacyHeight ?? metrics.height;
  const width = options?.width ?? legacyWidth ?? metrics.minWidth;
  return { width, height, fontSize: metrics.fontSize, variant, size };
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
