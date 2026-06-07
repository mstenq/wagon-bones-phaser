export function hash(n: number): number {
  return fract(Math.sin(n * 12.9898) * 43758.5453);
}

export function fract(n: number): number {
  return n - Math.floor(n);
}

export function burstTimer(time: number, seed: number, interval: number, window = 0.12): number {
  const phase = (time * (0.7 + seed * 0.11) + seed * 1.7) % interval;
  return phase < window ? 1 - phase / window : 0;
}
