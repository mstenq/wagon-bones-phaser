import type { Scene } from 'phaser';
import type { EffectFrameContext, EffectRuntime } from './types';

type BusEntry = {
  runtime: EffectRuntime;
  getFrame: () => EffectFrameContext;
};

const buses = new WeakMap<Scene, Map<BusEntry, true>>();

function getBus(scene: Scene): Map<BusEntry, true> {
  let bus = buses.get(scene);
  if (!bus) {
    bus = new Map();
    buses.set(scene, bus);
    scene.events.once('shutdown', () => {
      buses.delete(scene);
    });
    scene.events.on('update', (_time: number, delta: number) => {
      const dt = delta / 1000;
      const now = performance.now() / 1000;
      for (const entry of bus!.keys()) {
        const frame = entry.getFrame();
        frame.dt = dt;
        frame.time = now;
        entry.runtime.step(frame);
      }
    });
  }
  return bus;
}

export function registerAuraEffectHost(
  scene: Scene,
  runtime: EffectRuntime,
  getFrame: () => EffectFrameContext,
): () => void {
  const bus = getBus(scene);
  const entry: BusEntry = { runtime, getFrame };
  bus.set(entry, true);
  return () => {
    bus.delete(entry);
  };
}
