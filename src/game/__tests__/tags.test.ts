import { describe, it, expect, beforeEach } from 'bun:test';
import trailTags, { getTrailTagById } from '../../data/trail_tags';
import type { TrailTagDef } from '../../data/trail_tags';
import { getTagPool, processImmediateTags } from '../TagSystem';
import { getPlayerState, resetPlayerState } from '../PlayerState';

const ALL_TAGS = trailTags;

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

describe('TagSystem', () => {
  beforeEach(() => {
    resetPlayerState();
  });

  describe('Tag Pool', () => {
    it('filters tags by minLeg', () => {
      const pool1 = getTagPool(1);
      const pool2 = getTagPool(2);
      expect(pool2.length).toBeGreaterThan(pool1.length);
      expect(pool1.every((t) => t.minLeg <= 1)).toBe(true);
    });
  });

  describe('Twin Wagon', () => {
    it('doubles the next tag', () => {
      const player = getPlayerState();
      player.addTag(ALL_TAGS.find((t) => t.id === 'tag_twin_wagon')!);
      expect(player.twinWagonCount).toBe(1);

      player.addTag(ALL_TAGS.find((t) => t.id === 'tag_shortcut')!);
      expect(player.twinWagonCount).toBe(0);
      expect(player.pendingTags[0].copies).toBe(2);
    });

    it('stacks multiple Twin Wagons', () => {
      const player = getPlayerState();
      const tw = ALL_TAGS.find((t) => t.id === 'tag_twin_wagon')!;
      player.addTag(tw);
      player.addTag(tw);
      expect(player.twinWagonCount).toBe(3);

      player.addTag(ALL_TAGS.find((t) => t.id === 'tag_shortcut')!);
      expect(player.pendingTags[0].copies).toBe(4);
    });
  });

  describe('Immediate Money Tags', () => {
    it('Well-Traveled pays $1 per day scored', () => {
      const player = getPlayerState();
      player.daysScored = 10;
      const tag = ALL_TAGS.find((t) => t.id === 'tag_well_traveled')!;
      player.addTag(tag);
      const balanceBefore = player.economy.balance;
      processImmediateTags(player);
      expect(player.economy.balance).toBe(balanceBefore + 10);
    });

    it('Bank Deposit doubles money capped at +$40', () => {
      const player = getPlayerState();
      player.economy.setBalance(50);
      const tag = ALL_TAGS.find((t) => t.id === 'tag_bank_deposit')!;
      player.addTag(tag);
      processImmediateTags(player);
      expect(player.economy.balance).toBe(90);
    });

    it('Shortcut pays $5 per skipped round', () => {
      const player = getPlayerState();
      player.roundsSkipped = 3;
      const tag = ALL_TAGS.find((t) => t.id === 'tag_shortcut')!;
      player.addTag(tag);
      const before = player.economy.balance;
      processImmediateTags(player);
      expect(player.economy.balance).toBe(before + 15);
    });
  });

  describe("Surveyor's Mark", () => {
    it('upgrades a random hand by 3 levels', () => {
      const player = getPlayerState();
      const tag = ALL_TAGS.find((t) => t.id === 'tag_surveyor')!;
      player.addTag(tag);
      const results = processImmediateTags(player);
      expect(results.length).toBe(1);
      expect(results[0].levelsGained).toBe(3);
      const stats = player.getHandStats(results[0].handType!);
      expect(stats.level).toBe(4);
    });
  });
});
