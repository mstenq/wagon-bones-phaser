import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';
import { getAllTrailEvents } from '../TrailEventsSystem';
import { computeCoverScale, computeCoverCrop, trailEventAtlasFrame } from '../trailEventAssets';

const PUBLIC = join(import.meta.dir, '../../../public');

interface TexturePackerAtlas {
  frames: Array<{ filename: string }>;
}

function loadAtlasFrames(jsonPath: string): Set<string> {
  const raw = readFileSync(jsonPath, 'utf8');
  const atlas = JSON.parse(raw) as TexturePackerAtlas;
  return new Set(atlas.frames.map((frame) => frame.filename.replace(/\.png$/, '')));
}

describe('trail event assets', () => {
  test('every trail event has primary and spy atlas frames', () => {
    const primaryFrames = loadAtlasFrames(join(PUBLIC, 'assets/trail-events/trail-events.json'));
    const spyFrames = loadAtlasFrames(join(PUBLIC, 'assets/trail-events-spy/trail-events-spy.json'));
    const missingPrimary: string[] = [];
    const missingSpy: string[] = [];

    for (const event of getAllTrailEvents()) {
      const frameId = trailEventAtlasFrame(event.id).replace(/\.png$/, '');
      if (!primaryFrames.has(frameId)) missingPrimary.push(event.id);
      if (!spyFrames.has(frameId)) missingSpy.push(event.id);
    }

    expect(missingPrimary).toEqual([]);
    expect(missingSpy).toEqual([]);
  });
});

describe('computeCoverScale', () => {
  test('scales wide image to cover tall box', () => {
    expect(computeCoverScale(800, 400, 200, 400)).toBeCloseTo(1, 5);
  });

  test('scales tall image to cover wide box', () => {
    expect(computeCoverScale(400, 800, 400, 200)).toBeCloseTo(1, 5);
  });

  test('uses larger scale when image is smaller than box', () => {
    expect(computeCoverScale(100, 100, 500, 300)).toBeCloseTo(5, 5);
  });

  test('returns 1 for invalid dimensions', () => {
    expect(computeCoverScale(0, 100, 200, 200)).toBe(1);
    expect(computeCoverScale(100, 100, 0, 200)).toBe(1);
  });
});

describe('computeCoverCrop', () => {
  test('centers crop for wide image in tall box', () => {
    const c = computeCoverCrop(800, 400, 200, 400);
    expect(c.scale).toBeCloseTo(1, 5);
    expect(c.cropW).toBeCloseTo(200, 5);
    expect(c.cropH).toBeCloseTo(400, 5);
    expect(c.cropX).toBeCloseTo(300, 5);
    expect(c.cropY).toBeCloseTo(0, 5);
  });

  test('centers crop for tall image in wide box', () => {
    const c = computeCoverCrop(400, 800, 400, 200);
    expect(c.scale).toBeCloseTo(1, 5);
    expect(c.cropW).toBeCloseTo(400, 5);
    expect(c.cropH).toBeCloseTo(200, 5);
    expect(c.cropX).toBeCloseTo(0, 5);
    expect(c.cropY).toBeCloseTo(300, 5);
  });
});
