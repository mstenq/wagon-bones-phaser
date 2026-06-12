// ─── Trail event image paths and layout helpers (pure TS, no Phaser) ───

export const TRAIL_EVENTS_ATLAS_KEY = 'trail_events';
export const TRAIL_EVENTS_SPY_ATLAS_KEY = 'trail_events_spy';

export const TRAIL_EVENTS_ATLAS_IMAGE = 'assets/trail-events/trail-events.png';
export const TRAIL_EVENTS_ATLAS_JSON = 'assets/trail-events/trail-events.json';
export const TRAIL_EVENTS_SPY_ATLAS_IMAGE = 'assets/trail-events-spy/trail-events-spy.png';
export const TRAIL_EVENTS_SPY_ATLAS_JSON = 'assets/trail-events-spy/trail-events-spy.json';

export function trailEventAtlasFrame(id: string): string {
  return `${id}.png`;
}

/** Scale factor to cover a box (like CSS background-size: cover). */
export function computeCoverScale(imgW: number, imgH: number, boxW: number, boxH: number): number {
  if (imgW <= 0 || imgH <= 0 || boxW <= 0 || boxH <= 0) return 1;
  return Math.max(boxW / imgW, boxH / imgH);
}

export interface CoverCropResult {
  scale: number;
  cropX: number;
  cropY: number;
  cropW: number;
  cropH: number;
}

/** Cover-scale plus texture crop so the image fits a box exactly (no bleed). */
export function computeCoverCrop(imgW: number, imgH: number, boxW: number, boxH: number): CoverCropResult {
  const scale = computeCoverScale(imgW, imgH, boxW, boxH);
  const cropW = boxW / scale;
  const cropH = boxH / scale;
  return {
    scale,
    cropX: (imgW - cropW) / 2,
    cropY: (imgH - cropH) / 2,
    cropW,
    cropH,
  };
}
