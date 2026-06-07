export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: number;
  alpha: number;
};

export function createParticlePool(max: number): Particle[] {
  return Array.from({ length: max }, () => ({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 2,
    color: 0xffffff,
    alpha: 1,
  }));
}

export function spawnParticle(
  pool: Particle[],
  config: Omit<Particle, 'life' | 'maxLife'> & { maxLife: number },
): void {
  const slot = pool.find((p) => p.life <= 0);
  if (!slot) {
    return;
  }
  Object.assign(slot, config, { life: config.maxLife });
}

export function stepParticles(pool: Particle[], dt: number): void {
  for (const p of pool) {
    if (p.life <= 0) {
      continue;
    }
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}
