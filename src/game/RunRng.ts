import seedrandom from 'seedrandom';

export const RNG_STREAMS = [
  'meta',
  'dice',
  'shop',
  'trail',
  'pack',
  'sticker',
  'createRare',
  'createLegendary',
  'createRandomEquipment',
  'supplyPack',
  'trailPack',
  'frontierPack',
  'loadedDice',
  'luckyDice',
  'diamondDice',
  'wantedHand',
  'luckyNumber',
  'consumables',
  'equipment',
  'tags',
  'boss',
] as const;

export type RngStream = (typeof RNG_STREAMS)[number];
type StreamPrng = seedrandom.StatefulPRNG<seedrandom.State.Arc4>;

export interface RunRngState {
  streamStates: Record<RngStream, seedrandom.State.Arc4>;
  idCounter: number;
}

let currentRunSeed = '';
let streamPrngs: Record<RngStream, StreamPrng> | null = null;
let nextIdCounter = 0;
const RUN_SEED_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const RUN_SEED_LENGTH = 8;

function buildStreamsFromSeed(runSeed: string): Record<RngStream, StreamPrng> {
  const master = seedrandom(runSeed);
  const streams = {} as Record<RngStream, StreamPrng>;
  for (const stream of RNG_STREAMS) {
    streams[stream] = seedrandom(String(master.int32()), { state: true });
  }
  return streams;
}

export function generateRunSeed(): string {
  let seed = '';
  for (let i = 0; i < RUN_SEED_LENGTH; i++) {
    const idx = Math.floor(Math.random() * RUN_SEED_CHARS.length);
    seed += RUN_SEED_CHARS[idx];
  }
  return seed;
}

export function initRunRng(runSeed: string): string {
  currentRunSeed = String(runSeed || '').trim() || generateRunSeed();
  streamPrngs = buildStreamsFromSeed(currentRunSeed);
  nextIdCounter = 0;
  return currentRunSeed;
}

export function getRunSeed(): string {
  return currentRunSeed;
}

export function getRunRngState(): RunRngState {
  if (!streamPrngs) {
    const fallbackStreams = buildStreamsFromSeed(generateRunSeed());
    const streamStates = {} as Record<RngStream, seedrandom.State.Arc4>;
    for (const stream of RNG_STREAMS) {
      streamStates[stream] = fallbackStreams[stream].state();
    }
    return { streamStates, idCounter: 0 };
  }
  const streams = streamPrngs;
  const streamStates = {} as Record<RngStream, seedrandom.State.Arc4>;
  for (const stream of RNG_STREAMS) {
    streamStates[stream] = streams[stream].state();
  }
  return { streamStates, idCounter: nextIdCounter };
}

export function restoreRunRng(runSeed: string, state: RunRngState): void {
  currentRunSeed = String(runSeed || '').trim() || generateRunSeed();
  const streams = {} as Record<RngStream, StreamPrng>;
  for (const stream of RNG_STREAMS) {
    const streamState = state.streamStates?.[stream];
    streams[stream] = streamState
      ? seedrandom('', { state: streamState })
      : seedrandom(`${currentRunSeed}:${stream}`, { state: true });
  }
  streamPrngs = streams;
  nextIdCounter = Math.max(0, state.idCounter ?? 0);
}

export function resetRunRng(): void {
  currentRunSeed = '';
  streamPrngs = null;
  nextIdCounter = 0;
}

export function rngFloat(stream: RngStream): number {
  if (!streamPrngs) return Math.random();
  return streamPrngs[stream]();
}

export function rngInt(stream: RngStream, minInclusive: number, maxInclusive: number): number {
  if (maxInclusive <= minInclusive) return minInclusive;
  return Math.floor(rngFloat(stream) * (maxInclusive - minInclusive + 1)) + minInclusive;
}

/** Random value in [min, max] inclusive, at most one decimal place (e.g. 1.0–4.0). */
export function rngOneDecimal(stream: RngStream, min: number, max: number): number {
  const minTenths = Math.round(min * 10);
  const maxTenths = Math.round(max * 10);
  if (maxTenths <= minTenths) return minTenths / 10;
  return rngInt(stream, minTenths, maxTenths) / 10;
}

export function rngChance(stream: RngStream, numerator: number, denominator: number): boolean {
  if (denominator <= 0) return false;
  return rngFloat(stream) < numerator / denominator;
}

export function rngPick<T>(stream: RngStream, values: T[]): T {
  if (values.length === 0) {
    throw new Error(`Cannot pick from empty array for stream "${stream}"`);
  }
  const idx = Math.floor(rngFloat(stream) * values.length);
  return values[idx];
}

export function rngShuffle<T>(stream: RngStream, values: T[]): T[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rngFloat(stream) * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function nextRunId(prefix: string): string {
  if (!streamPrngs) return `${prefix}_${Math.random().toString(36).slice(2, 6)}`;
  nextIdCounter += 1;
  return `${prefix}_${nextIdCounter.toString(36)}`;
}
