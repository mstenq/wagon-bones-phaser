# Fire Aura Effect — Complete Rebuild Guide

This document contains everything required to port the **fire** card/die aura from Wagon Bones into another PixiJS v8 project using only this file as reference.

Pixi project located "/home/mstenq/web/wagon-bones-pixi/"

---

## Table of Contents

1. [Overview](#overview)
2. [Dependencies](#dependencies)
3. [Required Textures](#required-textures)
4. [Architecture](#architecture)
5. [File Layout](#file-layout)
6. [Integration Checklist](#integration-checklist)
7. [Source: Types](#source-types)
8. [Source: Registry & Runtime](#source-registry--runtime)
9. [Source: Effect Mount (React)](#source-effect-mount-react)
10. [Source: Frame Context](#source-frame-context)
11. [Source: Effect Helpers](#source-effect-helpers)
12. [Source: Die Tuning](#source-die-tuning)
13. [Source: Border Frame](#source-border-frame)
14. [Source: Die Outline](#source-die-outline)
15. [Source: Surface Projection](#source-surface-projection)
16. [Source: Glow / Blur Helpers](#source-glow--blur-helpers)
17. [Source: Card Backdrop](#source-card-backdrop)
18. [Source: Particles](#source-particles)
19. [Source: Pseudo-Random Burst](#source-pseudo-random-burst)
20. [Source: Art Color Matrix (Fire)](#source-art-color-matrix-fire)
21. [Source: Texture Loader](#source-texture-loader)
22. [Source: Fire Effect Definition](#source-fire-effect-definition)
23. [Host Wiring: Card](#host-wiring-card)
24. [Host Wiring: Die](#host-wiring-die)
25. [Tuning Reference](#tuning-reference)
26. [Per-Frame Render Pipeline](#per-frame-render-pipeline)
27. [Card vs Die Differences](#card-vs-die-differences)

---

## Overview

The fire aura is a **procedural edge flame** effect that wraps cards and dice. It combines:

- **Layered `Graphics`** with additive blending and `BlurFilter` (outer glow, mid aura, body, core)
- **Perlin-noise textured flame tongues** along a perimeter ring (rounded rect for cards, d20-ish polygon for dice)
- **Ember sprite particles** spawned along the ring and projected onto the tilted card face
- **`ColorMatrixFilter`** warmth on host artwork, pulsing with burst timing
- **`DisplacementFilter`** heat shimmer on **cards only** (not dice)

The effect id is `'fire'`. It is registered in the effect registry and instantiated by `EffectMount` on each card or die host.

---

## Dependencies

| Package | Version in repo | Usage |
|---------|-----------------|-------|
| `pixi.js` | v8 | `Graphics`, `Sprite`, `BlurFilter`, `DisplacementFilter`, `ColorMatrixFilter`, `Container`, `Texture`, `Assets` |
| `@pixi/react` | (project dep) | `useApplication`, `useTick`, `pixiContainer` |
| `react` | 19+ | `use`, `useRef`, `useCallback` — hosts suspend on `effectsTexturesReady` |

No custom GLSL shaders. All visuals are Pixi built-ins plus procedural `Graphics` paths.

---

## Required Textures

Copy these three image files into your project. In Wagon Bones they live at:

| Key | Path | Size | Role in fire effect |
|-----|------|------|---------------------|
| `ember` | `src/assets/effects/ember.png` | 16×16 PNG (colormap) | Additive sprite drawn at each live particle position |
| `arcaneNoiseA` | `src/assets/noise/Perlin/Perlin_14-512x512.png` | 512×512 RGBA | `textureSpace: 'global'` fill on flame tongue `Graphics` (noise grain) |
| `displacementHeat` | `src/assets/effects/displacement-heat.png.png` | 512×512 RGBA | Displacement map for card art heat wobble (**cards only**) |

> **Note:** The displacement asset filename has a double extension (`displacement-heat.png.png`) in this repo. Rename freely in your port — just keep the loader key `displacementHeat` consistent.

`burn.png` and `sparkle.png` are registered in the shared effect image map but **not used** by the fire effect.

### Texture preload contract

Hosts **must** await texture preload before mounting effects. Fire calls `getEffectTexture()` at runtime creation; missing preload yields `Texture.EMPTY` and broken fills.

```ts
import { use } from 'react';
import { effectsTexturesReady } from '@/loaders/effects/textures';

function CardOrDie() {
  use(effectsTexturesReady); // suspend until Assets.load completes
  // ...
}
```

---

## Architecture

```
Card / Die host
  ├── effectFrameRef  (mutated each tick: dt, pointer, surfaceCorners, hover, …)
  ├── effectArtRef    ({ applyFilters → host sprite/mesh })
  └── <EffectMount effect="fire" …>
        ├── layers.back  (zIndex 0) — backdrop glow
        ├── children     (zIndex 1) — card art / die sprite
        └── layers.front (zIndex 3) — flames, embers, particles

EffectMount.useTick → stepEffect(runtime, frameRef.current)
  └── fireEffect.create() returned runtime.step(frame)
```

**Registry path:** `fireEffect` → `EFFECT_DEFINITIONS` → `getEffectDefinition('fire')` → `createEffectRuntime()` → `def.create(layers, mount, art)`.

**Scene graph rule:** Effect `Graphics` layers are flat siblings of the art mesh. Card art uses `PerspectiveMesh` tilt; flames hug the tilted face via bilinear `projectPointToSurface()` using `frame.surfaceCorners` updated by the card host each tick.

---

## File Layout

Minimal tree to recreate the fire aura:

```
src/
  assets/effects/
    ember.png
    displacement-heat.png          # rename from .png.png if desired
  assets/noise/Perlin/
    Perlin_14-512x512.png          # or any 512×512 grayscale/rgb noise
  loaders/effects/
    images.ts
    textures.ts
  ui/effects/
    types.ts
    registry.ts
    runtime.ts
    context.ts
    effectHelpers.ts
    dieTuning.ts
    EffectMount.tsx
    definitions/
      fire.ts
    shared/
      artColor.ts       # fire functions only required; holy omitted below
      borderFrame.ts
      cardEffect.ts
      dieOutline.ts
      glow.ts
      particles.ts
      pseudoRandom.ts
      surfaceProjection.ts
```

---

## Integration Checklist

1. Copy all source files from sections below (or from repo paths cited).
2. Copy the three texture assets.
3. Add `'fire'` to your `EFFECT_IDS` array.
4. Register `fireEffect` in `EFFECT_DEFINITIONS`.
5. Wrap card/die art in `<EffectMount effect={auraId} …>`.
6. Call `use(effectsTexturesReady)` in card/die components before render.
7. Each tick, update `effectFrameRef.current` (especially `surfaceCorners` on tilted cards, `pointerNormX/Y`, `hovered`, `dragging`).
8. Provide `effectArtRef` whose `applyFilters` sets filters on the art sprite/mesh.

---

## Source: Types

`src/ui/effects/types.ts`

```ts
import type { Filter } from 'pixi.js';

export const EFFECT_IDS = ['none', 'holy', 'fire', 'arcane', 'ghost'] as const;

export type EffectId = (typeof EFFECT_IDS)[number];

export type EffectHostKind = 'card' | 'die';

export type EffectFrameContext = {
  dt: number;
  time: number;
  width: number;
  height: number;
  hostKind: EffectHostKind;
  hovered: boolean;
  dragging: boolean;
  activated: boolean;
  tiltX: number;
  tiltY: number;
  pointerNormX: number;
  pointerNormY: number;
  phase: number;
  hideHalo?: boolean;
  surfaceCorners: [
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
    { x: number; y: number },
  ];
};

export type EffectMountContext = {
  hostKind: EffectHostKind;
  width: number;
  height: number;
  padding: number;
  hideHalo?: boolean;
};

export type EffectLayers = {
  back: import('pixi.js').Container;
  front: import('pixi.js').Container;
};

export type EffectArtRef = {
  applyFilters: (filters: Filter[] | null) => void;
};

export type EffectArtTarget = EffectArtRef;

export type EffectRuntime = {
  id: EffectId;
  step: (frame: EffectFrameContext) => void;
  destroy: () => void;
};

export type EffectDefinition = {
  id: Exclude<EffectId, 'none'>;
  label: string;
  create: (layers: EffectLayers, ctx: EffectMountContext, art: EffectArtTarget) => EffectRuntime;
};
```

---

## Source: Registry & Runtime

`src/ui/effects/registry.ts`

```ts
import { fireEffect } from '@/ui/effects/definitions/fire';
// import other effects as needed
import type { EffectDefinition, EffectId } from '@/ui/effects/types';

export const EFFECT_DEFINITIONS: EffectDefinition[] = [
  fireEffect,
  // holyEffect, arcaneEffect, ghostEffect, …
];

const byId = new Map(EFFECT_DEFINITIONS.map((d) => [d.id, d]));

export function getEffectDefinition(id: EffectId): EffectDefinition | undefined {
  if (id === 'none') {
    return undefined;
  }
  return byId.get(id);
}
```

`src/ui/effects/runtime.ts`

```ts
import type { EffectArtTarget, EffectId, EffectLayers, EffectMountContext, EffectRuntime } from '@/ui/effects/types';
import { getEffectDefinition } from '@/ui/effects/registry';

export function createEffectRuntime(
  id: EffectId,
  layers: EffectLayers,
  ctx: EffectMountContext,
  art: EffectArtTarget,
): EffectRuntime | null {
  if (id === 'none') {
    return null;
  }
  const def = getEffectDefinition(id);
  if (!def) {
    return null;
  }
  return def.create(layers, ctx, art);
}

export function stepEffect(runtime: EffectRuntime, frame: import('@/ui/effects/types').EffectFrameContext): void {
  runtime.step(frame);
}

export function destroyEffect(runtime: EffectRuntime): void {
  runtime.destroy();
}
```

---

## Source: Effect Mount (React)

`src/ui/effects/EffectMount.tsx`

```tsx
import { useApplication, useTick } from '@pixi/react';
import { Container, type Filter } from 'pixi.js';
import { useCallback, useRef, type MutableRefObject, type ReactNode } from 'react';

import { CARD_EFFECT_PADDING, DIE_EFFECT_PADDING } from '@/ui/effects/dieTuning';
import { createEffectRuntime, destroyEffect, stepEffect } from '@/ui/effects/runtime';
import type {
  EffectArtRef,
  EffectArtTarget,
  EffectFrameContext,
  EffectHostKind,
  EffectId,
  EffectRuntime,
} from '@/ui/effects/types';

export type EffectMountProps = {
  effect: EffectId;
  hostKind: EffectHostKind;
  width: number;
  height: number;
  padding?: number;
  hideHalo?: boolean;
  frameRef: MutableRefObject<EffectFrameContext>;
  artRef: MutableRefObject<EffectArtRef | null>;
  children: ReactNode;
};

export function EffectMount({
  effect,
  hostKind,
  width,
  height,
  padding,
  hideHalo = false,
  frameRef,
  artRef,
  children,
}: EffectMountProps) {
  const resolvedPadding = padding ?? (hostKind === 'die' ? DIE_EFFECT_PADDING : CARD_EFFECT_PADDING);
  const { app } = useApplication();
  const backRef = useRef<Container | null>(null);
  const frontRef = useRef<Container | null>(null);
  const runtimeRef = useRef<EffectRuntime | null>(null);
  const prevEffectRef = useRef<EffectId>('none');

  const tryAttachRuntime = useCallback(() => {
    const back = backRef.current;
    const front = frontRef.current;
    if (!back || !front) {
      return;
    }
    if (effect === 'none') {
      if (runtimeRef.current) {
        destroyEffect(runtimeRef.current);
        runtimeRef.current = null;
      }
      artRef.current?.applyFilters(null);
      return;
    }
    if (runtimeRef.current?.id === effect) {
      return;
    }
    if (runtimeRef.current) {
      destroyEffect(runtimeRef.current);
      runtimeRef.current = null;
    }
    const art: EffectArtTarget = {
      applyFilters: (filters) => artRef.current?.applyFilters(filters ?? null),
    };
    runtimeRef.current = createEffectRuntime(
      effect,
      { back, front },
      { hostKind, width, height, padding: resolvedPadding, hideHalo },
      art,
    );
  }, [artRef, effect, height, hideHalo, hostKind, resolvedPadding, width]);

  const bindBack = useCallback(
    (node: Container | null) => {
      backRef.current = node;
      tryAttachRuntime();
    },
    [tryAttachRuntime],
  );

  const bindFront = useCallback(
    (node: Container | null) => {
      frontRef.current = node;
      tryAttachRuntime();
    },
    [tryAttachRuntime],
  );

  if (effect !== prevEffectRef.current) {
    prevEffectRef.current = effect;
    if (runtimeRef.current) {
      destroyEffect(runtimeRef.current);
      runtimeRef.current = null;
    }
    if (effect === 'none') {
      artRef.current?.applyFilters(null);
    } else {
      tryAttachRuntime();
    }
  }

  useTick(() => {
    const runtime = runtimeRef.current;
    if (!runtime) {
      return;
    }
    const frame = frameRef.current;
    frame.dt = app.ticker.deltaMS / 1000;
    frame.time = performance.now() / 1000;
    frame.width = width;
    frame.height = height;
    frame.hostKind = hostKind;
    frame.hideHalo = hideHalo;
    stepEffect(runtime, frame);
  });

  return (
    <pixiContainer sortableChildren eventMode="none">
      <pixiContainer ref={bindBack} zIndex={0} sortableChildren eventMode="none" />
      <pixiContainer zIndex={1} sortableChildren eventMode="none">
        {children}
      </pixiContainer>
      <pixiContainer ref={bindFront} zIndex={3} sortableChildren eventMode="none" />
    </pixiContainer>
  );
}
```

---

## Source: Frame Context

`src/ui/effects/context.ts`

```ts
import type { EffectFrameContext, EffectHostKind } from '@/ui/effects/types';

export const DEFAULT_EFFECT_PADDING = 18;

export { CARD_EFFECT_PADDING, DIE_EFFECT_PADDING } from '@/ui/effects/dieTuning';

export function createDefaultEffectFrame(
  hostKind: EffectHostKind,
  width: number,
  height: number,
  phase = 0,
): EffectFrameContext {
  return {
    dt: 0,
    time: 0,
    width,
    height,
    hostKind,
    hovered: false,
    dragging: false,
    activated: false,
    tiltX: 0,
    tiltY: 0,
    pointerNormX: 0.5,
    pointerNormY: 0.5,
    phase,
    surfaceCorners: [
      { x: -width / 2, y: -height / 2 },
      { x: width / 2, y: -height / 2 },
      { x: width / 2, y: height / 2 },
      { x: -width / 2, y: height / 2 },
    ],
  };
}
```

---

## Source: Effect Helpers

`src/ui/effects/effectHelpers.ts`

```ts
import { Graphics, Sprite, type Container, type Filter, type Texture } from 'pixi.js';

import type {
  EffectArtTarget,
  EffectDefinition,
  EffectFrameContext,
  EffectLayers,
  EffectMountContext,
  EffectRuntime,
} from '@/ui/effects/types';
import { effectRadius, isDieMount } from '@/ui/effects/dieTuning';
import { effectVisualBounds, borderBoundsFromSize, type BorderBounds } from '@/ui/effects/shared/borderFrame';

export { effectRadius };

export function boundsFromCtx(ctx: EffectMountContext) {
  return effectVisualBounds(ctx);
}

export function artBoundsFromMount(mount: EffectMountContext): BorderBounds {
  return borderBoundsFromSize(mount.width, mount.height);
}

export function backdropBounds(mount: EffectMountContext): BorderBounds {
  return isDieMount(mount) ? effectVisualBounds(mount) : artBoundsFromMount(mount);
}

export function makeRuntime(
  id: EffectDefinition['id'],
  step: (frame: EffectFrameContext) => void,
  destroy: () => void,
): EffectRuntime {
  return { id, step, destroy };
}

export function addGlowLayer(parent: Container, zIndex = 0): Graphics {
  const g = new Graphics();
  g.zIndex = zIndex;
  g.eventMode = 'none';
  g.blendMode = 'add';
  parent.addChild(g);
  return g;
}

export function addSpriteLayer(
  parent: Container,
  texture: Texture | null,
  zIndex = 1,
  blend: 'add' | 'normal' | 'screen' = 'add',
): Sprite | null {
  if (!texture) {
    return null;
  }
  const s = new Sprite({ texture, anchor: 0.5, eventMode: 'none' });
  s.zIndex = zIndex;
  s.blendMode = blend;
  parent.addChild(s);
  return s;
}

export function applyArtFilters(art: EffectArtTarget, filters: Filter[] | null): void {
  art.applyFilters(filters);
}

export function noopDestroy(...disposers: (() => void)[]): () => void {
  return () => {
    for (const d of disposers) {
      d();
    }
  };
}
```

---

## Source: Die Tuning

`src/ui/effects/dieTuning.ts`

```ts
import type { EffectMountContext } from '@/ui/effects/types';
import type { BorderBounds } from '@/ui/effects/shared/borderFrame';
import { hostIsDie } from '@/ui/effects/shared/borderFrame';

export const DIE_EFFECT_PADDING = 12;
export const CARD_EFFECT_PADDING = 18;

export function dieHalfSize(mount: EffectMountContext): number {
  return Math.min(mount.width, mount.height) / 2;
}

export function isDieMount(mount: EffectMountContext): boolean {
  return hostIsDie(mount.hostKind);
}

export function effectRadius(mount: EffectMountContext, bounds: BorderBounds): number {
  if (isDieMount(mount)) {
    return dieHalfSize(mount) * 1.14;
  }
  return Math.min(bounds.halfW, bounds.halfH) * 0.96;
}

export function tightDieBounds(mount: EffectMountContext): BorderBounds {
  const r = dieHalfSize(mount) * 0.96;
  return { halfW: r, halfH: r, cornerRadius: 0 };
}

export function dieBlurPadding(mount: EffectMountContext): number {
  return isDieMount(mount) ? 10 : mount.padding;
}

export function dieBlurStrength(mount: EffectMountContext, cardStrength: number): number {
  return isDieMount(mount) ? cardStrength * 0.55 : cardStrength;
}

export function hostParticleScale(mount: EffectMountContext): number {
  return isDieMount(mount) ? 0.72 : 1;
}
```

---

## Source: Border Frame

`src/ui/effects/shared/borderFrame.ts`

```ts
import type { EffectHostKind, EffectMountContext } from '@/ui/effects/types';

export type BorderBounds = {
  halfW: number;
  halfH: number;
  cornerRadius: number;
};

export function borderBoundsFromSize(width: number, height: number): BorderBounds {
  const halfW = width / 2;
  const halfH = height / 2;
  const cornerRadius = Math.min(50, Math.min(halfW, halfH) * 0.12);
  return { halfW, halfH, cornerRadius };
}

export function effectVisualBounds(mount: EffectMountContext): BorderBounds {
  const pad = mount.padding;
  return borderBoundsFromSize(mount.width + pad * 2, mount.height + pad * 2);
}

export function hostIsDie(hostKind: EffectHostKind): boolean {
  return hostKind === 'die';
}
```

---

## Source: Die Outline

`src/ui/effects/shared/dieOutline.ts`

```ts
export type DieOutlinePoint = { x: number; y: number };

export const DIE_EDGE_POINTS: DieOutlinePoint[] = [
  { x: 0.0, y: -1.0 },
  { x: 0.6, y: -0.8 },
  { x: 0.95, y: -0.2 },
  { x: 1, y: 0.12 },
  { x: 0.6, y: 0.8 },
  { x: 0.0, y: 1.0 },
  { x: -0.6, y: 0.8 },
  { x: -0.95, y: 0.25 },
  { x: -0.95, y: -0.12 },
  { x: -0.6, y: -0.78 },
];

export function createDieEdgeLoop(halfW: number, halfH: number, samples: number, insetScale = 1): DieOutlinePoint[] {
  const points: DieOutlinePoint[] = [];
  const vertices = DIE_EDGE_POINTS.map((p) => ({
    x: p.x * halfW * insetScale,
    y: p.y * halfH * insetScale,
  }));
  const lengths = vertices.map((p, i) => {
    const next = vertices[(i + 1) % vertices.length]!;
    return Math.hypot(next.x - p.x, next.y - p.y);
  });
  const perimeter = lengths.reduce((sum, len) => sum + len, 0);

  for (let i = 0; i < samples; i++) {
    let d = (i / samples) * perimeter;
    for (let segment = 0; segment < vertices.length; segment++) {
      const len = lengths[segment]!;
      if (d > len) {
        d -= len;
        continue;
      }
      const a = vertices[segment]!;
      const b = vertices[(segment + 1) % vertices.length]!;
      const t = len > 0 ? d / len : 0;
      points.push({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      });
      break;
    }
  }

  return points;
}
```

---

## Source: Surface Projection

Maps local card/die coordinates to screen space using bilinear interpolation over the four corners of the (possibly tilted) card face.

`src/ui/effects/shared/surfaceProjection.ts`

```ts
import type { EffectFrameContext } from '@/ui/effects/types';

export type SurfacePoint = { x: number; y: number };

export function projectPointToSurface(point: SurfacePoint, frame: EffectFrameContext): SurfacePoint {
  const u = point.x / frame.width + 0.5;
  const v = point.y / frame.height + 0.5;
  const invU = 1 - u;
  const invV = 1 - v;
  const [tl, tr, br, bl] = frame.surfaceCorners;
  return {
    x: tl.x * invU * invV + tr.x * u * invV + br.x * u * v + bl.x * invU * v,
    y: tl.y * invU * invV + tr.y * u * invV + br.y * u * v + bl.y * invU * v,
  };
}
```

**Card host responsibility:** Each tick, copy `PerspectiveMesh` corner `outPoints` into `frame.surfaceCorners` (offset by `-width/2`, `-height/2`). See [Host Wiring: Card](#host-wiring-card).

---

## Source: Glow / Blur Helpers

`src/ui/effects/shared/glow.ts`

```ts
import { BlurFilter, Graphics, Rectangle } from 'pixi.js';

import { dieBlurPadding, dieBlurStrength } from '@/ui/effects/dieTuning';
import type { EffectHostKind, EffectMountContext } from '@/ui/effects/types';

export function filterAreaForBounds(width: number, height: number, padding: number): Rectangle {
  const halfW = width / 2 + padding;
  const halfH = height / 2 + padding;
  return new Rectangle(-halfW, -halfH, halfW * 2, halfH * 2);
}

export function applyBlurredGlow(
  g: Graphics,
  hostWidth: number,
  hostHeight: number,
  padding: number,
  strength: number,
): BlurFilter {
  const blur = new BlurFilter({ strength, quality: 5 });
  g.filters = [blur];
  g.filterArea = filterAreaForBounds(hostWidth, hostHeight, padding);
  return blur;
}

export function applyBlurredGlowForMount(g: Graphics, mount: EffectMountContext, strength: number): BlurFilter {
  const pad = dieBlurPadding(mount);
  const str = dieBlurStrength(mount, strength);
  return applyBlurredGlow(g, mount.width, mount.height, pad, str);
}

export function setGlowFilterAreaForMount(g: Graphics, mount: EffectMountContext, extraPadding = 0): void {
  g.filterArea = filterAreaForBounds(mount.width, mount.height, dieBlurPadding(mount) + extraPadding);
}
```

> **Important:** Always set `filterArea` on blurred additive `Graphics`. Unbounded blur bleeds into sibling filtered layers.

---

## Source: Card Backdrop

`src/ui/effects/shared/cardEffect.ts`

```ts
import type { Graphics } from 'pixi.js';

import type { BorderBounds } from '@/ui/effects/shared/borderFrame';
import { hostIsDie } from '@/ui/effects/shared/borderFrame';
import type { EffectHostKind } from '@/ui/effects/types';

export function drawEffectBackdrop(
  g: Graphics,
  bounds: BorderBounds,
  hostKind: EffectHostKind,
  color: number,
  alpha: number,
  inset = 6,
): void {
  g.clear();
  if (hostIsDie(hostKind)) {
    const r = Math.min(bounds.halfW, bounds.halfH) - inset * 0.4;
    g.circle(0, 0, r);
    g.fill({ color, alpha });
    g.circle(0, 0, r * 0.72);
    g.fill({ color, alpha: alpha * 0.55 });
    return;
  }
  const { halfW, halfH, cornerRadius } = bounds;
  g.roundRect(-halfW + inset, -halfH + inset, halfW * 2 - inset * 2, halfH * 2 - inset * 2, cornerRadius);
  g.fill({ color, alpha });
  g.roundRect(
    -halfW + inset * 2,
    -halfH + inset * 2,
    halfW * 2 - inset * 4,
    halfH * 2 - inset * 4,
    Math.max(4, cornerRadius - 2),
  );
  g.fill({ color, alpha: alpha * 0.45 });
}
```

---

## Source: Particles

`src/ui/effects/shared/particles.ts`

```ts
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
```

---

## Source: Pseudo-Random Burst

`src/ui/effects/shared/pseudoRandom.ts`

```ts
export function burstTimer(time: number, seed: number, interval: number, window = 0.12): number {
  const phase = (time * (0.7 + seed * 0.11) + seed * 1.7) % interval;
  return phase < window ? 1 - phase / window : 0;
}
```

Returns `0…1` spike used to pulse art brightness and flame alpha. `seed` is `frame.phase` (per-card/die offset).

---

## Source: Art Color Matrix (Fire)

`src/ui/effects/shared/artColor.ts` (fire exports only)

```ts
import { ColorMatrixFilter } from 'pixi.js';

export function createFireArtMatrix(): ColorMatrixFilter {
  const filter = new ColorMatrixFilter();
  filter.brightness(1.04, false);
  filter.saturate(0.2, true);
  filter.colorTone(0.05, 0.22, 0xffaa44, 0x551100, false);
  return filter;
}

export function stepFireArtMatrix(filter: ColorMatrixFilter, burst: number): void {
  filter.brightness(1.04 + burst * 0.18, false);
  filter.saturate(0.2 + burst * 0.12, false);
}
```

---

## Source: Texture Loader

`src/loaders/effects/images.ts`

```ts
import emberImg from '@/assets/effects/ember.png';
import displacementHeatImg from '@/assets/effects/displacement-heat.png.png';
import arcaneNoiseAImg from '@/assets/noise/Perlin/Perlin_14-512x512.png';

export const EFFECT_IMAGES = {
  ember: emberImg,
  displacementHeat: displacementHeatImg,
  arcaneNoiseA: arcaneNoiseAImg,
} as const;

export type EffectImageKey = keyof typeof EFFECT_IMAGES;
```

`src/loaders/effects/textures.ts`

```ts
import { Assets, Texture } from 'pixi.js';

import { EFFECT_IMAGES, type EffectImageKey } from '@/loaders/effects/images';

const effectAlias = (key: EffectImageKey) => `effect-${key}`;

const EFFECT_KEYS = Object.keys(EFFECT_IMAGES) as EffectImageKey[];

let preloadPromise: Promise<void> | null = null;

export function registerEffectAssets(): void {
  for (const key of EFFECT_KEYS) {
    const alias = effectAlias(key);
    if (!Assets.resolver.hasKey(alias)) {
      Assets.add({ alias, src: EFFECT_IMAGES[key] });
    }
  }
}

export function preloadEffectTextures(): Promise<void> {
  registerEffectAssets();
  preloadPromise ??= Assets.load(EFFECT_KEYS.map(effectAlias)).then(() => undefined);
  return preloadPromise;
}

export const effectsTexturesReady = preloadEffectTextures();

export function getEffectTexture(key: EffectImageKey): Texture {
  const alias = effectAlias(key);
  if (!Assets.resolver.hasKey(alias)) {
    if (import.meta.env.DEV) {
      console.warn(`Effect texture "${key}" not loaded — await effectsTexturesReady before use`);
    }
    return Texture.EMPTY;
  }
  return Assets.get<Texture>(alias);
}
```

---

## Source: Fire Effect Definition

`src/ui/effects/definitions/fire.ts` — **complete file**

```ts
import { BlurFilter, DisplacementFilter, Sprite, type Graphics, type Texture } from 'pixi.js';

import { getEffectTexture } from '@/loaders/effects/textures';
import {
  addGlowLayer,
  addSpriteLayer,
  applyArtFilters,
  artBoundsFromMount,
  effectRadius,
  backdropBounds,
  boundsFromCtx,
  makeRuntime,
  noopDestroy,
} from '@/ui/effects/effectHelpers';
import { hostParticleScale, isDieMount, tightDieBounds } from '@/ui/effects/dieTuning';
import { createFireArtMatrix, stepFireArtMatrix } from '@/ui/effects/shared/artColor';
import { drawEffectBackdrop } from '@/ui/effects/shared/cardEffect';
import type { BorderBounds } from '@/ui/effects/shared/borderFrame';
import { createDieEdgeLoop } from '@/ui/effects/shared/dieOutline';
import { applyBlurredGlowForMount, setGlowFilterAreaForMount } from '@/ui/effects/shared/glow';
import { createParticlePool, spawnParticle, stepParticles } from '@/ui/effects/shared/particles';
import { burstTimer } from '@/ui/effects/shared/pseudoRandom';
import { projectPointToSurface } from '@/ui/effects/shared/surfaceProjection';
import type { EffectDefinition, EffectFrameContext } from '@/ui/effects/types';

type Point = { x: number; y: number };

const TAU = Math.PI * 2;
const FIRE_TUNE = {
  sampleCount: { die: 42, card: 96 },
  ringInsetScale: { die: 0.98, card: 1.005 },
  flame: {
    lanes: 4,
    baseHeight: { die: 5, card: 5 },
    laneHeightStep: 1.5,
    tipJitter: 3.0,
    widthScale: 1.5,
    tongueStride: 1,
    riseSpeedBase: 1.15,
    riseSpeedStep: 0.34,
    waveFreqBase: 0.6,
    waveFreqStep: 0.18,
    noiseThreshold: 0.36,
    cardCornerRadiusScale: 0.36,
  },
  cursor: {
    radiusScale: 0.13,
    heightBoost: 0.65,
    spawnBoost: 2.9,
  },
  stroke: {
    glowBlur: { strength: 12, quality: 4 },
    auraBlur: { strength: 5, quality: 3 },
  },
} as const;

function fract(n: number): number {
  return n - Math.floor(n);
}

function hash(n: number): number {
  return fract(Math.sin(n * 12.9898) * 43758.5453);
}

function createCardLoop(bounds: BorderBounds, samples: number, insetScale: number): Point[] {
  const points: Point[] = [];
  const halfW = bounds.halfW * insetScale;
  const halfH = bounds.halfH * insetScale;
  const r = Math.min(bounds.cornerRadius * FIRE_TUNE.flame.cardCornerRadiusScale, halfW * 0.22, halfH * 0.22);
  const straightW = Math.max(0, halfW * 2 - r * 2);
  const straightH = Math.max(0, halfH * 2 - r * 2);
  const perimeter = straightW * 2 + straightH * 2 + TAU * r;

  for (let i = 0; i < samples; i++) {
    let d = (i / samples) * perimeter;

    if (d < straightW) {
      points.push({ x: -halfW + r + d, y: -halfH });
      continue;
    }
    d -= straightW;

    if (d < Math.PI * r * 0.5) {
      const a = -Math.PI / 2 + d / r;
      points.push({ x: halfW - r + Math.cos(a) * r, y: -halfH + r + Math.sin(a) * r });
      continue;
    }
    d -= Math.PI * r * 0.5;

    if (d < straightH) {
      points.push({ x: halfW, y: -halfH + r + d });
      continue;
    }
    d -= straightH;

    if (d < Math.PI * r * 0.5) {
      const a = d / r;
      points.push({ x: halfW - r + Math.cos(a) * r, y: halfH - r + Math.sin(a) * r });
      continue;
    }
    d -= Math.PI * r * 0.5;

    if (d < straightW) {
      points.push({ x: halfW - r - d, y: halfH });
      continue;
    }
    d -= straightW;

    if (d < Math.PI * r * 0.5) {
      const a = Math.PI / 2 + d / r;
      points.push({ x: -halfW + r + Math.cos(a) * r, y: halfH - r + Math.sin(a) * r });
      continue;
    }
    d -= Math.PI * r * 0.5;

    if (d < straightH) {
      points.push({ x: -halfW, y: halfH - r - d });
      continue;
    }
    d -= straightH;

    const a = Math.PI + d / r;
    points.push({ x: -halfW + r + Math.cos(a) * r, y: -halfH + r + Math.sin(a) * r });
  }
  return points;
}

function createDieLoop(bounds: BorderBounds, samples: number, insetScale: number): Point[] {
  return createDieEdgeLoop(bounds.halfW, bounds.halfH, samples, insetScale);
}

function createOutwardNormals(points: Point[]): Point[] {
  const normals: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length]!;
    const next = points[(i + 1) % points.length]!;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.max(0.0001, Math.hypot(tx, ty));
    normals.push({ x: ty / len, y: -tx / len });
  }
  return normals;
}

function nearestRingPointIndex(points: Point[], target: Point): number {
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const dx = p.x - target.x;
    const dy = p.y - target.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestDist) {
      bestDist = d2;
      best = i;
    }
  }
  return best;
}

function ringDistance01(index: number, target: number, count: number): number {
  const raw = Math.abs(index - target);
  return Math.min(raw, count - raw) / count;
}

function drawFlameLane(
  gfx: Graphics,
  ringPoints: Point[],
  ringNormals: Point[],
  frame: EffectFrameContext,
  time: number,
  seed: number,
  lane: number,
  baseHeight: number,
  cursorIndex: number,
  cursorActive: boolean,
  color: number,
  alpha: number,
  inset = 0,
  texture: Texture | null = null,
): void {
  const count = ringPoints.length;
  const step = FIRE_TUNE.flame.tongueStride + lane;
  const lanePhase = seed * 17.0 + lane * 2.7;
  for (let i = lane; i < count; i += step) {
    const p0 = ringPoints[i]!;
    const p1 = ringPoints[(i + step) % count]!;
    const n = ringNormals[i]!;
    const cursorNear = cursorActive
      ? 1 - Math.min(1, ringDistance01(i, cursorIndex, count) / FIRE_TUNE.cursor.radiusScale)
      : 0;
    const noise = hash(Math.floor(time * (10.5 + lane * 1.3)) + i * 31.7 + lane * 101.3 + seed * 23);
    const fineNoise = hash(Math.floor(time * 26.0) + i * 9.13 + seed * 53.0);
    const wave =
      0.5 +
      0.5 *
        Math.sin(
          time * (FIRE_TUNE.flame.riseSpeedBase + lane * FIRE_TUNE.flame.riseSpeedStep) +
            i * (FIRE_TUNE.flame.waveFreqBase + lane * FIRE_TUNE.flame.waveFreqStep) +
            lanePhase,
        );
    const lit = wave * 0.72 + noise * 0.38 + cursorNear * 0.25 > FIRE_TUNE.flame.noiseThreshold;
    if (!lit) {
      continue;
    }

    const widthT = FIRE_TUNE.flame.widthScale + noise * 0.28;
    const bx0 = p0.x + (p1.x - p0.x) * (1 - widthT) * 0.5 - n.x * inset;
    const by0 = p0.y + (p1.y - p0.y) * (1 - widthT) * 0.5 - n.y * inset;
    const bx1 = p0.x + (p1.x - p0.x) * (0.5 + widthT * 0.5) - n.x * inset;
    const by1 = p0.y + (p1.y - p0.y) * (0.5 + widthT * 0.5) - n.y * inset;
    const midX = (p0.x + p1.x) * 0.5;
    const midY = (p0.y + p1.y) * 0.5;
    const tangentX = -n.y;
    const tangentY = n.x;
    const height =
      (baseHeight + lane * FIRE_TUNE.flame.laneHeightStep + noise * FIRE_TUNE.flame.tipJitter) *
      (1 + cursorNear * FIRE_TUNE.cursor.heightBoost);
    const sway = Math.sin(time * (5.2 + lane * 0.55) + i * 0.49 + lanePhase) * (2.2 + lane + fineNoise * 2);
    const waist = Math.max(1.5, height * (0.3 + fineNoise * 0.18));
    const tipX = midX + n.x * height + tangentX * sway;
    const tipY = midY + n.y * height + tangentY * sway;
    const c1x = bx0 + n.x * waist + tangentX * (sway * 0.22 + fineNoise * 2);
    const c1y = by0 + n.y * waist + tangentY * (sway * 0.22 + fineNoise * 2);
    const c2x = bx1 + n.x * waist - tangentX * (sway * 0.18 + noise * 2);
    const c2y = by1 + n.y * waist - tangentY * (sway * 0.18 + noise * 2);
    const base0 = projectPointToSurface({ x: bx0, y: by0 }, frame);
    const tip = projectPointToSurface({ x: tipX, y: tipY }, frame);
    const base1 = projectPointToSurface({ x: bx1, y: by1 }, frame);
    const control1 = projectPointToSurface({ x: c1x, y: c1y }, frame);
    const control2 = projectPointToSurface({ x: c2x, y: c2y }, frame);
    const baseControl = projectPointToSurface(
      {
        x: midX - n.x * inset * 0.4,
        y: midY - n.y * inset * 0.4,
      },
      frame,
    );

    gfx.moveTo(base0.x, base0.y);
    gfx.quadraticCurveTo(control1.x, control1.y, tip.x, tip.y);
    gfx.quadraticCurveTo(control2.x, control2.y, base1.x, base1.y);
    gfx.quadraticCurveTo(baseControl.x, baseControl.y, base0.x, base0.y);
    gfx.closePath();
  }
  if (texture) {
    gfx.fill({ color, alpha, texture, textureSpace: 'global' });
    return;
  }
  gfx.fill({ color, alpha });
}

function drawEdgeBand(
  gfx: Graphics,
  ringPoints: Point[],
  ringNormals: Point[],
  frame: EffectFrameContext,
  time: number,
  seed: number,
  color: number,
  alpha: number,
  width: number,
  cursorIndex: number,
  cursorActive: boolean,
): void {
  for (let i = 0; i <= ringPoints.length; i++) {
    const idx = i % ringPoints.length;
    const p = ringPoints[idx]!;
    const n = ringNormals[idx]!;
    const cursorNear = cursorActive
      ? 1 - Math.min(1, ringDistance01(idx, cursorIndex, ringPoints.length) / FIRE_TUNE.cursor.radiusScale)
      : 0;
    const shimmer = Math.sin(time * 8.0 + idx * 0.8 + seed * 4.0) * (0.55 + cursorNear * 1.2);
    const projected = projectPointToSurface(
      {
        x: p.x + n.x * shimmer,
        y: p.y + n.y * shimmer,
      },
      frame,
    );
    if (i === 0) {
      gfx.moveTo(projected.x, projected.y);
    } else {
      gfx.lineTo(projected.x, projected.y);
    }
  }
  gfx.stroke({ width, color, alpha, cap: 'round', join: 'round' });
}

export const fireEffect: EffectDefinition = {
  id: 'fire',
  label: 'Fire',
  create(layers, mount, art) {
    const bounds = boundsFromCtx(mount);
    const artBounds = artBoundsFromMount(mount);
    const backBounds = backdropBounds(mount);
    const isDie = isDieMount(mount);
    const hostKind = mount.hostKind;
    const edgeBounds = isDie ? tightDieBounds(mount) : artBounds;
    const radius = effectRadius(mount, bounds);
    const pScale = hostParticleScale(mount);
    const sampleCount = isDie ? FIRE_TUNE.sampleCount.die : FIRE_TUNE.sampleCount.card;
    const ringPoints = isDie
      ? createDieLoop(edgeBounds, sampleCount, FIRE_TUNE.ringInsetScale.die)
      : createCardLoop(edgeBounds, sampleCount, FIRE_TUNE.ringInsetScale.card);
    const ringNormals = createOutwardNormals(ringPoints);

    const backdrop = addGlowLayer(layers.back, 0);
    applyBlurredGlowForMount(backdrop, mount, 12);

    const flameGlow = addGlowLayer(layers.front, 0);
    flameGlow.filters = [new BlurFilter(FIRE_TUNE.stroke.glowBlur)];
    setGlowFilterAreaForMount(flameGlow, mount, 12);
    const flameAura = addGlowLayer(layers.front, 1);
    flameAura.filters = [new BlurFilter(FIRE_TUNE.stroke.auraBlur)];
    setGlowFilterAreaForMount(flameAura, mount, 8);
    const flameBody = addGlowLayer(layers.front, 2);
    const flameCore = addGlowLayer(layers.front, 3);

    const emberTex = getEffectTexture('ember');
    const flameNoiseTex = getEffectTexture('arcaneNoiseA');
    const embers: Sprite[] = [];
    const emberCount = isDie ? 14 : 24;
    for (let i = 0; i < emberCount; i++) {
      const s = addSpriteLayer(layers.front, emberTex, 4 + i, 'add');
      if (s) embers.push(s);
    }

    const particles = createParticlePool(isDie ? 18 : 32);
    const artMatrix = createFireArtMatrix();
    const dispTex = getEffectTexture('displacementHeat');
    let dispFilter: DisplacementFilter | null = null;
    let dispSprite: Sprite | null = null;
    let elapsed = 0;
    let particleBudget = 0;
    let particleIndex = 0;

    if (dispTex && !isDie) {
      dispSprite = new Sprite({ texture: dispTex, anchor: 0.5, eventMode: 'none' });
      dispSprite.alpha = 0;
      dispFilter = new DisplacementFilter({ sprite: dispSprite, scale: 6 });
      applyArtFilters(art, [artMatrix, dispFilter]);
    } else {
      applyArtFilters(art, [artMatrix]);
    }

    const step = (frame: EffectFrameContext) => {
      elapsed = (elapsed + frame.dt) % 240;
      const phaseSeed = hash(frame.phase * 17.31 + (isDie ? 3.7 : 0.0));
      const timeOffset = phaseSeed * 137.0;
      const t = (elapsed + timeOffset) % 240;
      const burst = burstTimer(t, 1, 0.85, 0.14);
      stepFireArtMatrix(artMatrix, burst);
      const pointer = {
        x: (frame.pointerNormX - 0.5) * frame.width,
        y: (frame.pointerNormY - 0.5) * frame.height,
      };
      const cursorActive = frame.hovered && !frame.dragging;
      const cursorIndex = nearestRingPointIndex(ringPoints, pointer);
      const baseHeight =
        (isDie ? FIRE_TUNE.flame.baseHeight.die : FIRE_TUNE.flame.baseHeight.card) * (0.92 + burst * 0.28);

      drawEffectBackdrop(
        backdrop,
        backBounds,
        hostKind,
        0xff4400,
        isDie ? 0.08 + burst * 0.06 : 0.1 + burst * 0.06,
        isDie ? 6 : 10,
      );

      flameGlow.clear();
      flameAura.clear();
      flameBody.clear();
      flameCore.clear();
      drawEdgeBand(
        flameGlow,
        ringPoints,
        ringNormals,
        frame,
        t,
        frame.phase,
        0xff2a00,
        0.16 + burst * 0.08,
        isDie ? 7 : 13,
        cursorIndex,
        cursorActive,
      );
      drawEdgeBand(
        flameAura,
        ringPoints,
        ringNormals,
        frame,
        t + 0.2,
        frame.phase + 0.4,
        0xff5a00,
        0.36 + burst * 0.12,
        isDie ? 4 : 7,
        cursorIndex,
        cursorActive,
      );
      drawEdgeBand(
        flameCore,
        ringPoints,
        ringNormals,
        frame,
        t + 0.35,
        frame.phase + 0.8,
        0xffe06a,
        0.42 + burst * 0.16,
        isDie ? 1.3 : 2.2,
        cursorIndex,
        cursorActive,
      );
      for (let lane = FIRE_TUNE.flame.lanes - 1; lane >= 0; lane--) {
        drawFlameLane(
          flameGlow,
          ringPoints,
          ringNormals,
          frame,
          t,
          frame.phase,
          lane,
          baseHeight * 1.35,
          cursorIndex,
          cursorActive,
          0xff3300,
          0.15 + burst * 0.08,
          1.5,
          flameNoiseTex,
        );
        drawFlameLane(
          flameAura,
          ringPoints,
          ringNormals,
          frame,
          t + 0.17,
          frame.phase + 0.33,
          lane,
          baseHeight * 1.05,
          cursorIndex,
          cursorActive,
          0xff5a00,
          0.32 + burst * 0.12,
          0,
          flameNoiseTex,
        );
        drawFlameLane(
          flameBody,
          ringPoints,
          ringNormals,
          frame,
          t + 0.31,
          frame.phase + 0.71,
          lane,
          baseHeight * 0.78,
          cursorIndex,
          cursorActive,
          0xff8a18,
          0.46 + burst * 0.16,
          -1,
          flameNoiseTex,
        );
      }
      drawFlameLane(
        flameCore,
        ringPoints,
        ringNormals,
        frame,
        t + 0.53,
        frame.phase + 1.1,
        0,
        baseHeight * 0.42,
        cursorIndex,
        cursorActive,
        0xffe06a,
        0.55 + burst * 0.18,
        -2,
        null,
      );

      if (dispSprite && dispFilter) {
        dispSprite.rotation = t * 0.4;
        const heatBoost = cursorActive ? 1.35 : 1;
        dispFilter.scale.x = (6 + Math.sin(t * 3) * 2 + burst * 3) * heatBoost;
        dispFilter.scale.y = dispFilter.scale.x;
      }

      stepParticles(particles, frame.dt);
      const spawnRate = (isDie ? 9 : 17) * pScale * (cursorActive ? FIRE_TUNE.cursor.spawnBoost : 1);
      particleBudget += frame.dt * spawnRate;
      while (particleBudget >= 1) {
        particleBudget -= 1;
        const particleSeed = hash(frame.phase * 41.0 + particleIndex * 13.37 + phaseSeed * 97.0);
        const particleSeedB = hash(frame.phase * 59.0 + particleIndex * 19.17 + phaseSeed * 31.0);
        const particleSeedC = hash(frame.phase * 71.0 + particleIndex * 23.91 + phaseSeed * 53.0);
        particleIndex += 1;
        const spawnIndex =
          cursorActive && particleSeed < 0.55
            ? (cursorIndex + Math.floor((particleSeedB - 0.5) * ringPoints.length * 0.18) + ringPoints.length) %
              ringPoints.length
            : Math.floor(particleSeed * ringPoints.length);
        const p = ringPoints[spawnIndex]!;
        const n = ringNormals[spawnIndex]!;
        const overCard = !isDie && particleSeedC < 0.42;
        const inward = overCard ? 1 : -1;
        const inwardSpeed = overCard ? 10 + particleSeed * 22 : 0;
        const outwardSpeed = overCard ? 0 : 12 + particleSeedB * 12;
        spawnParticle(particles, {
          x: p.x - n.x * (overCard ? 5 + particleSeedB * 10 : -2 - particleSeedC * 4),
          y: p.y - n.y * (overCard ? 5 + particleSeedB * 10 : -2 - particleSeedC * 4),
          vx: (n.x * (outwardSpeed - inward * inwardSpeed) + (particleSeedC - 0.5) * 13) * pScale,
          vy: (n.y * (outwardSpeed - inward * inwardSpeed) - 18 - particleSeed * 24) * pScale,
          maxLife: overCard ? 0.5 + particleSeedB * 0.42 : 0.38 + particleSeedB * 0.32,
          size: overCard ? 2.4 : 2,
          color: overCard && particleSeed < 0.35 ? 0xffd56a : 0xff6600,
          alpha: overCard ? 0.9 : 1,
        });
      }

      let slot = 0;
      const emberScale = isDie ? 0.45 : 0.5;
      const clipBounds = isDie ? radius * 1.25 : Math.max(artBounds.halfW, artBounds.halfH) * 1.05;
      for (const p of particles) {
        if (p.life <= 0) continue;
        if (Math.hypot(p.x, p.y) > clipBounds) continue;
        const s = embers[slot % embers.length];
        slot += 1;
        if (!s) continue;
        const lifeT = p.life / p.maxLife;
        const projected = projectPointToSurface(p, frame);
        s.position.set(projected.x, projected.y);
        s.alpha = lifeT;
        s.scale.set(emberScale * lifeT * (0.75 + p.size * 0.28));
        s.visible = true;
      }
      for (let i = slot; i < embers.length; i++) {
        embers[i]!.visible = false;
      }
    };

    return makeRuntime(
      'fire',
      step,
      noopDestroy(
        () => applyArtFilters(art, null),
        () => {
          backdrop.destroy();
          flameGlow.destroy();
          flameAura.destroy();
          flameBody.destroy();
          flameCore.destroy();
          embers.forEach((s) => s.destroy());
          dispSprite?.destroy();
        },
      ),
    );
  },
};
```

---

## Host Wiring: Card

From `src/ui/components/Card/Card.tsx` — essential patterns only.

### Preload

```tsx
import { use } from 'react';
import { effectsTexturesReady } from '@/loaders/effects/textures';

use(effectsTexturesReady);
```

### Frame + art refs

```tsx
const pointerNormRef = useRef({ x: 0.5, y: 0.5 });
const effectFrameRef = useRef(createDefaultEffectFrame('card', width, height, phase));

const applyArtFilters = useCallback((filters: Filter[] | null) => {
  pendingArtFiltersRef.current = filters;
  const target = flatSpriteRef.current ?? meshRef.current;
  if (target) target.filters = filters;
}, []);

const effectArtRef = useRef<EffectArtRef>({ applyFilters: () => {} });
effectArtRef.current.applyFilters = applyArtFilters;
```

### Per-tick frame update (in `useTick`, before effect step)

```tsx
const frame = effectFrameRef.current;
frame.dt = dt;
frame.time = performance.now() / 1000;
frame.width = width;
frame.height = height;
frame.hostKind = 'card';
frame.hovered = effectiveHovered;
frame.dragging = draggingRef.current;
frame.activated = isSelectedRef.current;
frame.tiltX = angleXRef.current;
frame.tiltY = angleYRef.current;
frame.pointerNormX = pointerNormRef.current.x;
frame.pointerNormY = pointerNormRef.current.y;
frame.phase = phase;

// Perspective mesh corners → surfaceCorners (required for tilt-correct flames)
const surfaceCorners = frame.surfaceCorners;
if (mesh) {
  const [tl, tr, br, bl] = corners.outPoints;
  surfaceCorners[0].x = -width / 2 + tl.x;
  surfaceCorners[0].y = -height / 2 + tl.y;
  surfaceCorners[1].x = -width / 2 + tr.x;
  surfaceCorners[1].y = -height / 2 + tr.y;
  surfaceCorners[2].x = -width / 2 + br.x;
  surfaceCorners[2].y = -height / 2 + br.y;
  surfaceCorners[3].x = -width / 2 + bl.x;
  surfaceCorners[3].y = -height / 2 + bl.y;
} else {
  // flat sprite — axis-aligned rect
  surfaceCorners[0].x = -width / 2;
  surfaceCorners[0].y = -height / 2;
  surfaceCorners[1].x = width / 2;
  surfaceCorners[1].y = -height / 2;
  surfaceCorners[2].x = width / 2;
  surfaceCorners[2].y = height / 2;
  surfaceCorners[3].x = -width / 2;
  surfaceCorners[3].y = height / 2;
}
```

### JSX mount

```tsx
<EffectMount
  effect={effect}           // pass 'fire' from props
  hostKind="card"
  width={width}
  height={height}
  hideHalo={displayMode === 'shop'}
  frameRef={effectFrameRef}
  artRef={effectArtRef}
>
  {/* PerspectiveMesh or flat Sprite — art filters applied via effectArtRef */}
</EffectMount>
```

Default card size: **150×210**. Default padding: **18** (`CARD_EFFECT_PADDING`).

---

## Host Wiring: Die

From `src/ui/components/Dice/Die.tsx`.

```tsx
use(effectsTexturesReady);

const effectFrameRef = useRef(createDefaultEffectFrame('die', size, size, phase));
const effectArtRef = useRef<EffectArtRef>({
  applyFilters(filters) {
    const sprite = spriteRef.current;
    if (sprite) sprite.filters = filters;
  },
});

// useTick:
const frame = effectFrameRef.current;
frame.dt = dt;
frame.time = performance.now() / 1000;
frame.width = size;
frame.height = size;
frame.hostKind = 'die';
frame.phase = phase;
// surfaceCorners stay axis-aligned; die has no perspective mesh

<EffectMount
  effect={effect}
  hostKind="die"
  width={size}
  height={size}
  frameRef={effectFrameRef}
  artRef={effectArtRef}
>
  <pixiSprite ref={spriteRef} texture={faceTexture} anchor={0.5} width={size} height={size} />
</EffectMount>
```

Default die size: **88**. Default padding: **12** (`DIE_EFFECT_PADDING`).

---

## Tuning Reference

All knobs live in `FIRE_TUNE` at the top of `fire.ts`:

| Group | Key | Die | Card | Purpose |
|-------|-----|-----|------|---------|
| `sampleCount` | ring samples | 42 | 96 | Points around perimeter |
| `ringInsetScale` | inset | 0.98 | 1.005 | Ring sits slightly inside/outside edge |
| `flame.lanes` | — | 4 | 4 | Staggered tongue layers |
| `flame.baseHeight` | px | 5 | 5 | Flame tongue height scale |
| `cursor.radiusScale` | — | 0.13 | 0.13 | Hover hotspot width along ring (fraction of ring) |
| `cursor.heightBoost` | — | 0.65 | 0.65 | Extra tongue height near cursor |
| `cursor.spawnBoost` | — | 2.9 | 2.9 | Particle spawn multiplier on hover |
| `stroke.glowBlur` | strength/quality | 12 / 4 | 12 / 4 | Outer flame layer blur |
| `stroke.auraBlur` | strength/quality | 5 / 3 | 5 / 3 | Mid aura layer blur |

### Color palette (hex)

| Layer | Color | Notes |
|-------|-------|-------|
| Backdrop | `0xff4400` | Soft inner glow |
| Edge glow | `0xff2a00` | Widest stroke |
| Edge aura | `0xff5a00` | Mid stroke |
| Edge core | `0xffe06a` | Thin hot rim |
| Tongue glow | `0xff3300` | Outermost fill |
| Tongue aura | `0xff5a00` | |
| Tongue body | `0xff8a18` | |
| Tongue core | `0xffe06a` | Solid fill (no noise texture) |
| Particles | `0xff6600` / `0xffd56a` | Outward vs inward card sparks |

---

## Per-Frame Render Pipeline

```
1. Advance elapsed time (wraps at 240s) + per-instance phase offset
2. burstTimer → pulse art ColorMatrix + alpha boosts
3. Resolve pointer → ring index; cursorActive = hovered && !dragging
4. drawEffectBackdrop (layers.back)
5. Clear 4 front Graphics layers
6. drawEdgeBand × 3 (glow, aura, core strokes)
7. drawFlameLane × 4 lanes × 3 layers (glow, aura, body) + 1 core tongue
8. Animate DisplacementFilter on card art (rotation + scale)
9. stepParticles + spawn along ring (biased toward cursor when hovered)
10. Project live particles → ember sprite positions
```

### Layer stack (front container, bottom → top)

| zIndex | Object | Blend | Filter |
|--------|--------|-------|--------|
| 0 | `flameGlow` | add | Blur 12 |
| 1 | `flameAura` | add | Blur 5 |
| 2 | `flameBody` | add | none |
| 3 | `flameCore` | add | none |
| 4+ | ember sprites | add | none |

Back container: single blurred backdrop `Graphics`.

---

## Card vs Die Differences

| Feature | Card | Die |
|---------|------|-----|
| Edge loop | Rounded rectangle (`createCardLoop`) | `DIE_EDGE_POINTS` polygon (`createDieEdgeLoop`) |
| Edge bounds | Full art size | `tightDieBounds` (96% half-size) |
| Displacement heat on art | Yes | No |
| Inward “spark” particles over face | 42% chance | No |
| Ember pool / particle pool | 24 / 32 | 14 / 18 |
| Spawn rate base | 17/s | 9/s |
| Particle scale | 1.0 | 0.72 |
| Backdrop inset | 10 | 6 |
| Edge stroke widths | 13 / 7 / 2.2 | 7 / 4 / 1.3 |
| `surfaceCorners` | Updated from `PerspectiveMesh` | Static axis-aligned |

---

## Game Data Wiring (optional)

In Wagon Bones, `'fire'` is also an item/die **aura id** in game logic (`TagSystem`, shop rolls, scoring). That is separate from the visual effect system documented here. To show the aura on a card or die in UI, pass `effect="fire"` (or the equipment/die aura field mapped to `EffectId`) into `Card` / `Die` props.

---

## Quick Smoke Test

```tsx
// Story or dev scene
<Card texture={someTexture} effect="fire" />
<Die diceType="d6" value={4} effect="fire" />
```

Ensure `effectsTexturesReady` is awaited on the render path. Hover the card to see cursor-biased flame height and ember spawn boost.

---

*Generated from Wagon Bones Pixi codebase. Canonical source paths under `/home/mstenq/web/wagon-bones-pixi/src/ui/effects/definitions/fire.ts` and dependencies listed above.*
