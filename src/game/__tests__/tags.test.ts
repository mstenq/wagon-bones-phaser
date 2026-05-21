import { describe, it, expect } from 'bun:test';
import trailTags, { getTrailTagById } from '../../data/trail_tags';
import type { TrailTagDef } from '../../data/trail_tags';

describe('Trail Tags Data', () => {
  it('exports all 24 tags', () => {
    expect(trailTags.length).toBe(24);
  });

  it('every tag has required fields', () => {
    for (const tag of trailTags) {
      expect(tag.id).toBeTruthy();
      expect(tag.name).toBeTruthy();
      expect(tag.description).toBeTruthy();
      expect(tag.category).toBeTruthy();
      expect(typeof tag.minLeg).toBe('number');
      expect(typeof tag.weight).toBe('number');
    }
  });

  it('has unique tag IDs', () => {
    const ids = trailTags.map((t: TrailTagDef) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('getTrailTagById finds a tag', () => {
    const tag = getTrailTagById('tag_twin_wagon');
    expect(tag).toBeDefined();
    expect(tag!.name).toBe('Twin Wagon');
    expect(tag!.category).toBe('meta');
  });

  it('getTrailTagById returns undefined for unknown ID', () => {
    expect(getTrailTagById('tag_nonexistent')).toBeUndefined();
  });
});
