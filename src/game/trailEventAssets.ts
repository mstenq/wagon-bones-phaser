// ─── Trail event image paths and layout helpers (pure TS, no Phaser) ───

export const TRAIL_EVENT_IMAGE_DIR = 'assets/trail-events';
export const TRAIL_EVENT_SPY_IMAGE_DIR = 'assets/trail-events-spy';

export function trailEventImagePath(id: string): string {
  return `${TRAIL_EVENT_IMAGE_DIR}/${id}.png`;
}

export function trailEventSpyImagePath(id: string): string {
  return `${TRAIL_EVENT_SPY_IMAGE_DIR}/${id}.png`;
}

export function trailEventImageKey(id: string): string {
  return `trail_event_${id}`;
}

export function trailEventSpyImageKey(id: string): string {
  return `trail_event_spy_${id}`;
}

/** Scale factor to cover a box (like CSS background-size: cover). */
export function computeCoverScale(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
): number {
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
export function computeCoverCrop(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
): CoverCropResult {
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
