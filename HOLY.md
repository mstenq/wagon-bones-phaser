# Holy Aura Effect — Complete Rebuild Guide

This document contains everything required to port the **holy** card/die aura from Wagon Bones into another PixiJS v8 project using only this file as reference.

Pixi project located `/home/mstenq/web/wagon-bones-pixi/`

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
20. [Source: Art Color Matrix (Holy)](#source-art-color-matrix-holy)
21. [Source: Texture Loader](#source-texture-loader)
22. [Source: Holy Effect Definition](#source-holy-effect-definition)
23. [Host Wiring: Card](#host-wiring-card)
24. [Host Wiring: Die](#host-wiring-die)
25. [Tuning Reference](#tuning-reference)
26. [Per-Frame Render Pipeline](#per-frame-render-pipeline)
27. [Card vs Die Differences](#card-vs-die-differences)
28. [Game Data Wiring (optional)](#game-data-wiring-optional)
29. [Quick Smoke Test](#quick-smoke-test)

---

## Overview

The holy aura is a **divine rainbow edge-light and halo** effect that wraps cards and dice. It combines:

- **Layered `Graphics`** with additive blending and `BlurFilter` (backdrop glow, sheen, halo rings, edge lights)
- **Rainbow-cycling stroke segments** along a perimeter ring (superellipse for cards, d20-ish polygon for dice), projected onto the tilted card face
- **Animated elliptical halo** above the host with orbiting light, idle drift/wobble, and optional hide in shop mode
- **Sparkle sprite particles** rising from the face/perimeter, projected through `projectPointToSurface`
- **Screen-blended flare sprite** at the halo orbit point, pulsing via `burstTimer`
- **`ColorMatrixFilter`** warm divine tint on host artwork, pulsing with a 2s sine wave

The effect id is `'holy'`. It is registered in the effect registry and instantiated by `EffectMount` on each card or die host.

No custom GLSL shaders. No displacement map. All visuals are Pixi built-ins plus procedural `Graphics` paths.

---

## Dependencies

| Package | Version in repo | Usage |
|---------|-----------------|-------|
| `pixi.js` | v8 | `Graphics`, `Sprite`, `BlurFilter`, `ColorMatrixFilter`, `Container`, `Texture`, `Assets` |
| `@pixi/react` | (project dep) | `useApplication`, `useTick`, `pixiContainer` |
| `react` | 19+ | `use`, `useRef`, `useCallback` — hosts suspend on `effectsTexturesReady` |

---

## Required Textures

Holy uses **one** texture asset. Copy this file into your project:

| Key | Path | Size | Role in holy effect |
|-----|------|------|---------------------|
| `sparkle` | `src/assets/effects/sparkle.png` | 16×16 PNG (colormap, ~840 B) | Additive sprites at particle positions; screen-blended flare at halo orbit |

### Asset description

| Asset | Visual | Usage detail |
|-------|--------|--------------|
| `sparkle.png` | 16×16 white star/sparkle blob (indexed PNG) | 10–14 additive sprites recycled for rising particles; one screen-blended sprite follows the orbiting halo light with burst pulsing |

Other keys in the shared `EFFECT_IMAGES` map (`burn`, `ember`, `displacementHeat`, `arcaneNoiseA`) are **not used** by holy. For a minimal port, register only `sparkle`.

### Texture preload contract

Hosts **must** await texture preload before mounting effects. Holy calls `getEffectTexture('sparkle')` at runtime creation; missing preload yields `Texture.EMPTY` and invisible sparkles.

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
  └── <EffectMount effect="holy" …>
        ├── layers.back  (zIndex 0) — backdrop + sheen glow
        ├── children     (zIndex 1) — card art / die sprite
        └── layers.front (zIndex 3) — halo, edge lights, sparkles, flare

EffectMount.useTick → stepEffect(runtime, frameRef.current)
  └── holyEffect.create() returned runtime.step(frame)
```

**Registry path:** `holyEffect` → `EFFECT_DEFINITIONS` → `getEffectDefinition('holy')` → `createEffectRuntime()` → `def.create(layers, mount, art)`.

**Scene graph rule:** Effect `Graphics` layers are flat siblings of the art mesh. Card art uses `PerspectiveMesh` tilt; edge lights and particles hug the tilted face via bilinear `projectPointToSurface()` using `frame.surfaceCorners` updated by the card host each tick.

**Halo visibility:** Cards pass `hideHalo={displayMode === 'shop'}` so shop previews omit the overhead halo ring. Die hosts do not hide the halo by default.

---

## File Layout

Minimal tree to recreate the holy aura:

```
src/
  assets/effects/
    sparkle.png
  loaders/effects/
    images.ts          # sparkle only for minimal port
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
      holy.ts
    shared/
      artColor.ts      # holy functions only required
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
2. Copy `sparkle.png`.
3. Add `'holy'` to your `EFFECT_IDS` array.
4. Register `holyEffect` in `EFFECT_DEFINITIONS`.
5. Wrap card/die art in `<EffectMount effect={auraId} …>`.
6. Call `use(effectsTexturesReady)` in card/die components before render.
7. Each tick, update `effectFrameRef.current` (especially `surfaceCorners` on tilted cards, `hovered`, `activated`).
8. Provide `effectArtRef` whose `applyFilters` sets filters on the art sprite/mesh.
9. (Cards) Pass `hideHalo` when the overhead halo should be suppressed (e.g. shop mode).

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
import { holyEffect } from '@/ui/effects/definitions/holy';
// import other effects as needed
import type { EffectDefinition, EffectId } from '@/ui/effects/types';

export const EFFECT_DEFINITIONS: EffectDefinition[] = [
  holyEffect,
  // fireEffect, arcaneEffect, ghostEffect, …
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
  EffectRuntime,
} from '@/ui/effects/types';
import { isDieMount } from '@/ui/effects/dieTuning';
import { effectVisualBounds, borderBoundsFromSize, type BorderBounds } from '@/ui/effects/shared/borderFrame';
import type { EffectMountContext } from '@/ui/effects/types';

export function boundsFromCtx(ctx: EffectMountContext) {
  return effectVisualBounds(ctx);
}

/** Card art size only — backdrops must not extend past the card face. */
export function artBoundsFromMount(mount: EffectMountContext): BorderBounds {
  return borderBoundsFromSize(mount.width, mount.height);
}

export function backdropBounds(mount: EffectMountContext): BorderBounds {
  return isDieMount(mount) ? effectVisualBounds(mount) : artBoundsFromMount(mount);
}

/** Random point over the card face (not on the perimeter). */
export function randomInteriorPoint(bounds: BorderBounds, margin = 0.12): { x: number; y: number } {
  const mx = bounds.halfW * (1 - margin);
  const my = bounds.halfH * (1 - margin);
  return {
    x: (Math.random() - 0.5) * mx * 2,
    y: (Math.random() - 0.5) * my * 2,
  };
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

export function pulse01(time: number, period: number, phase = 0): number {
  return (Math.sin((time / period) * Math.PI * 2 + phase) + 1) * 0.5;
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

/** Die: tight but readable in an 8-dice row. Card: full padded bounds. */
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
import type { Graphics } from 'pixi.js';

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

/** Padded bounds so glow/blur is not clipped to the host art rectangle. */
export function effectVisualBounds(mount: EffectMountContext): BorderBounds {
  const pad = mount.padding;
  return borderBoundsFromSize(mount.width + pad * 2, mount.height + pad * 2);
}

export function hostIsDie(hostKind: EffectHostKind): boolean {
  return hostKind === 'die';
}

/** Point on ellipse perimeter (t in 0..1). Works well for dice hosts. */
export function perimeterPointEllipse(bounds: BorderBounds, t: number): { x: number; y: number } {
  const a = bounds.halfW * 0.92;
  const b = bounds.halfH * 0.92;
  const angle = (((t % 1) + 1) % 1) * Math.PI * 2;
  return { x: Math.cos(angle) * a, y: Math.sin(angle) * b };
}
```

---

## Source: Die Outline

`src/ui/effects/shared/dieOutline.ts`

```ts
export type DieOutlinePoint = { x: number; y: number };

// Normalized clockwise outline for the d20-ish die silhouette. Tweak these
// points to move die edge effects; x/y are multiplied by the die half-size.
export const DIE_EDGE_POINTS: DieOutlinePoint[] = [
  { x: 0.0, y: -1.0 }, // noon
  { x: 0.6, y: -0.8 }, // 2pm
  { x: 0.95, y: -0.2 }, // 3pm
  { x: 1, y: 0.12 }, // 4pm
  { x: 0.6, y: 0.8 }, // 5pm
  { x: 0.0, y: 1.0 }, // 6pm
  { x: -0.6, y: 0.8 }, // 7pm
  { x: -0.95, y: 0.25 }, // 8pm
  { x: -0.95, y: -0.12 }, // 9pm
  { x: -0.6, y: -0.78 }, // 11pm
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
import type { EffectMountContext } from '@/ui/effects/types';

export function filterAreaForBounds(width: number, height: number, padding: number): Rectangle {
  const halfW = width / 2 + padding;
  const halfH = height / 2 + padding;
  return new Rectangle(-halfW, -halfH, halfW * 2, halfH * 2);
}

/** Prevent BlurFilter from clipping to a hard rectangular edge. */
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

---

## Source: Card Backdrop

`src/ui/effects/shared/cardEffect.ts`

```ts
import type { Graphics } from 'pixi.js';

import type { BorderBounds } from '@/ui/effects/shared/borderFrame';
import { hostIsDie } from '@/ui/effects/shared/borderFrame';
import type { EffectHostKind } from '@/ui/effects/types';

/** Soft filled backdrop hugging card/die shape — no stroke outlines. */
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
/** Deterministic-ish burst timer from wall-clock time and seed. */
export function burstTimer(time: number, seed: number, interval: number, window = 0.12): number {
  const phase = (time * (0.7 + seed * 0.11) + seed * 1.7) % interval;
  return phase < window ? 1 - phase / window : 0;
}
```

---

## Source: Art Color Matrix (Holy)

`src/ui/effects/shared/artColor.ts` — holy functions only:

```ts
import { ColorMatrixFilter } from 'pixi.js';

/** Warm divine tint on artwork — Pixi ColorMatrixFilter. */
export function createHolyArtMatrix(): ColorMatrixFilter {
  const filter = new ColorMatrixFilter();
  filter.sepia(false);
  filter.brightness(1.06, false);
  filter.saturate(0.12, true);
  filter.colorTone(0.08, 0.18, 0xfff8e0, 0x886622, false);
  return filter;
}

export function stepHolyArtMatrix(filter: ColorMatrixFilter, pulse: number): void {
  filter.brightness(1.04 + pulse * 0.1, false);
}
```

---

## Source: Texture Loader

Minimal loader registering only `sparkle` (holy requirement):

`src/loaders/effects/images.ts`

```ts
import sparkleImg from '@/assets/effects/sparkle.png';

export const EFFECT_IMAGES = {
  sparkle: sparkleImg,
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

/** Await in React with `use(effectsTexturesReady)` — no useEffect needed. */
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

## Source: Holy Effect Definition

`src/ui/effects/definitions/holy.ts` — **canonical full source**:

```ts
import { BlurFilter, Sprite, type Graphics } from 'pixi.js';

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
  pulse01,
  randomInteriorPoint,
} from '@/ui/effects/effectHelpers';
import { hostParticleScale, isDieMount, tightDieBounds } from '@/ui/effects/dieTuning';
import { createHolyArtMatrix, stepHolyArtMatrix } from '@/ui/effects/shared/artColor';
import { drawEffectBackdrop } from '@/ui/effects/shared/cardEffect';
import { borderBoundsFromSize, perimeterPointEllipse, type BorderBounds } from '@/ui/effects/shared/borderFrame';
import { createDieEdgeLoop } from '@/ui/effects/shared/dieOutline';
import { createParticlePool, spawnParticle, stepParticles } from '@/ui/effects/shared/particles';
import { burstTimer } from '@/ui/effects/shared/pseudoRandom';
import { applyBlurredGlowForMount, setGlowFilterAreaForMount } from '@/ui/effects/shared/glow';
import { projectPointToSurface } from '@/ui/effects/shared/surfaceProjection';
import type { EffectDefinition, EffectFrameContext } from '@/ui/effects/types';

type Point = { x: number; y: number };

const TAU = Math.PI * 2;
const GOLD = 0x6ff9f6;
const GOLD_BRIGHT = 0x6ff9f6;
/** Hue cycles per second along halo / edge lights. */
const RAINBOW_SPEED = 0.22;
/** Rainbow saturation for halo / edge strokes: 0 = white, 1 = full RGB. */
const RGB_INTENSITY = 0.5;

function fract01(n: number): number {
  return n - Math.floor(n);
}

/** Full-saturation RGB from hue in [0, 1). */
function rainbowColor(hue: number): number {
  const h = fract01(hue) * 6;
  const i = Math.floor(h);
  const f = h - i;
  const q = 1 - f;
  let r = 0;
  let g = 0;
  let b = 0;
  switch (i % 6) {
    case 0:
      r = 1;
      g = f;
      break;
    case 1:
      r = q;
      g = 1;
      break;
    case 2:
      g = 1;
      b = f;
      break;
    case 3:
      g = q;
      b = 1;
      break;
    case 4:
      r = f;
      b = 1;
      break;
    default:
      r = 1;
      b = q;
      break;
  }
  const mix = (c: number) => c * RGB_INTENSITY + (1 - RGB_INTENSITY);
  return (Math.round(mix(r) * 255) << 16) | (Math.round(mix(g) * 255) << 8) | Math.round(mix(b) * 255);
}

const HOLY_TUNE = {
  sampleCount: { die: 72, card: 100 },
  ringInsetScale: { die: 1.02, card: 1.01 },
  edgeLight: {
    lanes: 12,
    speedBase: 0.32,
    speedStep: 0.2,
    waveFreqBase: 8.5,
    waveFreqStep: 1.7,
    thresholdBase: 0.5,
    thresholdStep: 0.08,
  },
  halo: {
    yOffset: { die: -5, card: 25 },
    rxScale: { die: 0.46, card: 0.546 },
    ryScale: { die: 0.11, card: 0.0715 },
    glowBlur: { die: 5, card: 7 },
    orbitSpeed: 0.34,
    idle: {
      driftX: { die: 1.2, card: 5 },
      driftY: { die: 1.2, card: 3 },
      wobbleScale: { die: 0.06, card: 0.02 },
      rotation: { die: 0.08, card: 0.02 },
      speed: 1.05,
    },
  },
} as const;

function hash(n: number): number {
  return fract01(Math.sin(n * 12.9898) * 43758.5453);
}

function createCardLoop(bounds: BorderBounds, samples: number, insetScale: number): Point[] {
  const points: Point[] = [];
  const halfW = bounds.halfW * insetScale;
  const halfH = bounds.halfH * insetScale;
  const exponent = 5.5;
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * TAU;
    const c = Math.cos(a);
    const s = Math.sin(a);
    points.push({
      x: halfW * Math.sign(c) * Math.pow(Math.abs(c), 2 / exponent),
      y: halfH * Math.sign(s) * Math.pow(Math.abs(s), 2 / exponent),
    });
  }
  return points;
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

function drawEdgeLightLane(
  gfx: Graphics,
  ringPoints: Point[],
  ringNormals: Point[],
  frame: EffectFrameContext,
  time: number,
  huePhase: number,
  lane: number,
  alpha: number,
  width: number,
): void {
  let prev: Point | null = null;
  for (let i = 0; i <= ringPoints.length; i++) {
    const idx = i % ringPoints.length;
    const p = ringPoints[idx]!;
    const n = ringNormals[idx]!;
    const wave =
      0.5 +
      0.5 *
        Math.sin(
          time * (HOLY_TUNE.edgeLight.speedBase + lane * HOLY_TUNE.edgeLight.speedStep) * TAU +
            (idx * (HOLY_TUNE.edgeLight.waveFreqBase + lane * HOLY_TUNE.edgeLight.waveFreqStep)) / ringPoints.length +
            lane * 1.7,
        );
    const flicker = hash(Math.floor(time * (8 + lane * 2)) + idx * 19.31 + lane * 71.7);
    const lit =
      wave * 0.7 + flicker * 0.3 > HOLY_TUNE.edgeLight.thresholdBase + lane * HOLY_TUNE.edgeLight.thresholdStep;
    if (!lit) {
      prev = null;
      continue;
    }

    const shimmer = Math.sin(time * 2.7 + idx * 0.42 + lane * 1.9) * (1.2 + lane * 0.5);
    const projected = projectPointToSurface(
      {
        x: p.x + n.x * (lane * 1.8 + shimmer),
        y: p.y + n.y * (lane * 1.8 + shimmer),
      },
      frame,
    );
    if (prev) {
      const hue = huePhase + idx / ringPoints.length + lane * 0.07;
      gfx.moveTo(prev.x, prev.y);
      gfx.lineTo(projected.x, projected.y);
      gfx.stroke({ width, color: rainbowColor(hue), alpha, cap: 'round', join: 'round' });
    }
    prev = projected;
  }
}

function haloEllipsePoint(cx: number, cy: number, rx: number, ry: number, angle: number, rotation: number): Point {
  const localX = Math.cos(angle) * rx;
  const localY = Math.sin(angle) * ry;
  const cr = Math.cos(rotation);
  const sr = Math.sin(rotation);
  return {
    x: cx + localX * cr - localY * sr,
    y: cy + localX * sr + localY * cr,
  };
}

function drawHaloArc(
  gfx: Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  startAngle: number,
  endAngle: number,
  width: number,
  huePhase: number,
  alpha: number,
  rotation = 0,
): void {
  const samples = 28;
  for (let i = 0; i < samples; i++) {
    const t0 = i / samples;
    const t1 = (i + 1) / samples;
    const a0 = startAngle + (endAngle - startAngle) * t0;
    const a1 = startAngle + (endAngle - startAngle) * t1;
    const p0 = haloEllipsePoint(cx, cy, rx, ry, a0, rotation);
    const p1 = haloEllipsePoint(cx, cy, rx, ry, a1, rotation);
    const hue = huePhase + ((a0 + a1) * 0.5) / TAU;
    gfx.moveTo(p0.x, p0.y);
    gfx.lineTo(p1.x, p1.y);
    gfx.stroke({ width, color: rainbowColor(hue), alpha, cap: 'round', join: 'round' });
  }
}

function drawHalo(
  gfx: Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  width: number,
  huePhase: number,
  alpha: number,
  rotation = 0,
): void {
  drawHaloArc(gfx, cx, cy, rx, ry, 0, TAU, width, huePhase, alpha, rotation);
}

function haloPoint(cx: number, cy: number, rx: number, ry: number, angle: number, rotation = 0): Point {
  const localX = Math.cos(angle) * rx;
  const localY = Math.sin(angle) * ry;
  const cr = Math.cos(rotation);
  const sr = Math.sin(rotation);
  return {
    x: cx + localX * cr - localY * sr,
    y: cy + localX * sr + localY * cr,
  };
}

export const holyEffect: EffectDefinition = {
  id: 'holy',
  label: 'Holy',
  create(layers, mount, art) {
    const bounds = boundsFromCtx(mount);
    const artBounds = artBoundsFromMount(mount);
    const backBounds = backdropBounds(mount);
    const hostKind = mount.hostKind;
    const isDie = isDieMount(mount);
    const radius = effectRadius(mount, bounds);
    const pScale = hostParticleScale(mount);
    const tight = tightDieBounds(mount);
    const ringBounds = isDie ? tight : borderBoundsFromSize(mount.width, mount.height);
    const sampleCount = isDie ? HOLY_TUNE.sampleCount.die : HOLY_TUNE.sampleCount.card;
    const ringPoints = isDie
      ? createDieEdgeLoop(ringBounds.halfW, ringBounds.halfH, sampleCount, HOLY_TUNE.ringInsetScale.die)
      : createCardLoop(ringBounds, sampleCount, HOLY_TUNE.ringInsetScale.card);
    const ringNormals = createOutwardNormals(ringPoints);
    const haloCx = 0;
    const haloCy = isDie ? -radius - HOLY_TUNE.halo.yOffset.die : -artBounds.halfH - HOLY_TUNE.halo.yOffset.card;
    const haloRx =
      (isDie ? radius : artBounds.halfW) * (isDie ? HOLY_TUNE.halo.rxScale.die : HOLY_TUNE.halo.rxScale.card);
    const haloRy =
      (isDie ? radius : artBounds.halfH) * (isDie ? HOLY_TUNE.halo.ryScale.die : HOLY_TUNE.halo.ryScale.card);

    const backdrop = addGlowLayer(layers.back, 0);
    applyBlurredGlowForMount(backdrop, mount, 16);

    const sheen = addGlowLayer(layers.back, 1);
    applyBlurredGlowForMount(sheen, mount, 10);

    const haloGlow = addGlowLayer(layers.front, 0);
    haloGlow.filters = [
      new BlurFilter({ strength: isDie ? HOLY_TUNE.halo.glowBlur.die : HOLY_TUNE.halo.glowBlur.card, quality: 4 }),
    ];
    setGlowFilterAreaForMount(haloGlow, mount, isDie ? 28 : 36);
    const haloCore = addGlowLayer(layers.front, 1);
    const haloLight = addGlowLayer(layers.front, 2);
    haloLight.filters = [new BlurFilter({ strength: isDie ? 2.5 : 3.5, quality: 4 })];
    setGlowFilterAreaForMount(haloLight, mount, isDie ? 28 : 36);
    const edgeGlow = addGlowLayer(layers.front, 3);
    edgeGlow.filters = [new BlurFilter({ strength: isDie ? 3 : 5, quality: 3 })];
    setGlowFilterAreaForMount(edgeGlow, mount, 12);
    const edgeCore = addGlowLayer(layers.front, 4);

    const sparkleTex = getEffectTexture('sparkle');
    const sparkles: Sprite[] = [];
    const sparkleCount = isDie ? 10 : 14;
    for (let i = 0; i < sparkleCount; i++) {
      const s = addSpriteLayer(layers.front, sparkleTex, 10 + i, 'add');
      if (s) sparkles.push(s);
    }

    const flare = addSpriteLayer(layers.front, sparkleTex, 30, 'screen');
    const particles = createParticlePool(isDie ? 14 : 18);

    const artMatrix = createHolyArtMatrix();
    applyArtFilters(art, [artMatrix]);

    const step = (frame: EffectFrameContext) => {
      const t = frame.time;
      const pulse = pulse01(t, 2);
      stepHolyArtMatrix(artMatrix, pulse);

      drawEffectBackdrop(
        backdrop,
        backBounds,
        hostKind,
        GOLD,
        isDie ? 0.1 + pulse * 0.06 : 0.11 + pulse * 0.06,
        isDie ? 6 : 12,
      );
      drawEffectBackdrop(
        sheen,
        backBounds,
        hostKind,
        GOLD_BRIGHT,
        isDie ? 0.06 + pulse * 0.04 : 0.07 + pulse * 0.04,
        isDie ? 4 : 14,
      );

      haloGlow.clear();
      haloCore.clear();
      haloLight.clear();
      edgeGlow.clear();
      edgeCore.clear();

      const hoverBoost = frame.hovered ? 1.25 : 1;
      const activeBoost = frame.activated ? 1.2 : 1;
      const rainbowPhase = t * RAINBOW_SPEED + frame.phase * 0.04;
      for (let lane = 0; lane < HOLY_TUNE.edgeLight.lanes; lane++) {
        drawEdgeLightLane(
          edgeGlow,
          ringPoints,
          ringNormals,
          frame,
          t + frame.phase * 0.07,
          rainbowPhase,
          lane,
          (0.1 + pulse * 0.04) * hoverBoost,
          isDie ? 4 + lane : 7 + lane * 1.5,
        );
        drawEdgeLightLane(
          edgeCore,
          ringPoints,
          ringNormals,
          frame,
          t + frame.phase * 0.07 + 0.33,
          rainbowPhase + 0.18,
          lane,
          (0.22 + pulse * 0.08) * hoverBoost,
          isDie ? 1.2 : 1.8,
        );
      }

      const showHalo = !frame.hideHalo;
      const haloIdle = HOLY_TUNE.halo.idle;
      const haloIdleT = t * haloIdle.speed + frame.phase;
      const haloDriftX = Math.sin(haloIdleT * 0.84) * (isDie ? haloIdle.driftX.die : haloIdle.driftX.card);
      const haloDriftY = Math.cos(haloIdleT) * (isDie ? haloIdle.driftY.die : haloIdle.driftY.card);
      const haloWobble =
        1 + Math.sin(haloIdleT * 1.17 + 0.6) * (isDie ? haloIdle.wobbleScale.die : haloIdle.wobbleScale.card);
      const haloCounterWobble =
        1 - Math.sin(haloIdleT * 1.17 + 0.6) * (isDie ? haloIdle.wobbleScale.die : haloIdle.wobbleScale.card) * 0.55;
      const haloRotation = Math.sin(haloIdleT * 0.72) * (isDie ? haloIdle.rotation.die : haloIdle.rotation.card);
      const haloX = haloCx + haloDriftX;
      const haloY = haloCy + haloDriftY;
      const haloAnimatedRx = haloRx * haloWobble;
      const haloAnimatedRy = haloRy * haloCounterWobble;
      const orbitAngle = t * HOLY_TUNE.halo.orbitSpeed * TAU + frame.phase;
      if (showHalo) {
        const haloAlpha = (0.42 + pulse * 0.12) * hoverBoost * activeBoost;
        const haloHue = rainbowPhase + orbitAngle / TAU;
        drawHalo(
          haloGlow,
          haloX,
          haloY,
          haloAnimatedRx,
          haloAnimatedRy,
          isDie ? 8 : 10,
          haloHue,
          0.12 * hoverBoost,
          haloRotation,
        );
        drawHalo(
          haloGlow,
          haloX,
          haloY,
          haloAnimatedRx * 0.96,
          haloAnimatedRy * 0.86,
          isDie ? 4 : 5,
          haloHue + 0.12,
          0.16 * hoverBoost,
          haloRotation,
        );
        drawHaloArc(
          haloCore,
          haloX,
          haloY,
          haloAnimatedRx,
          haloAnimatedRy,
          Math.PI,
          TAU,
          isDie ? 1.2 : 1.5,
          haloHue + 0.25,
          haloAlpha * 0.42,
          haloRotation,
        );
        drawHaloArc(
          haloCore,
          haloX,
          haloY,
          haloAnimatedRx,
          haloAnimatedRy,
          0,
          Math.PI,
          isDie ? 1.6 : 2.1,
          haloHue,
          haloAlpha,
          haloRotation,
        );

        const light = haloPoint(haloX, haloY, haloAnimatedRx, haloAnimatedRy, orbitAngle, haloRotation);
        const trail = haloPoint(haloX, haloY, haloAnimatedRx, haloAnimatedRy, orbitAngle - 0.36, haloRotation);
        const lightColor = rainbowColor(haloHue + 0.5);
        haloLight.moveTo(trail.x, trail.y);
        haloLight.lineTo(light.x, light.y);
        haloLight.stroke({ width: isDie ? 4 : 6, color: lightColor, alpha: 0.36 * hoverBoost, cap: 'round' });
        haloLight.circle(light.x, light.y, isDie ? 3.2 : 4.6);
        haloLight.fill({ color: lightColor, alpha: 0.72 * hoverBoost * activeBoost });
      }

      stepParticles(particles, frame.dt);
      if (Math.random() < frame.dt * 7 * pScale) {
        const p = isDie ? perimeterPointEllipse(tight, Math.random()) : randomInteriorPoint(artBounds, 0.1);
        spawnParticle(particles, {
          x: p.x,
          y: p.y,
          vx: (Math.random() - 0.5) * 10 * pScale,
          vy: (-16 - Math.random() * 20) * pScale,
          maxLife: 0.55 + Math.random() * 0.45,
          size: 2,
          color: GOLD_BRIGHT,
          alpha: 1,
        });
      }

      const baseScale = isDie ? 0.22 : 0.28;
      let slot = 0;
      const maxDist = isDie ? radius * 1.2 : Math.max(artBounds.halfW, artBounds.halfH) * 1.05;
      for (const p of particles) {
        if (p.life <= 0) continue;
        if (Math.hypot(p.x, p.y) > maxDist) continue;
        const s = sparkles[slot % sparkles.length];
        slot += 1;
        if (!s) continue;
        const lifeT = p.life / p.maxLife;
        const projected = projectPointToSurface(p, frame);
        s.position.set(projected.x, projected.y);
        s.alpha = lifeT;
        s.scale.set(baseScale + lifeT * baseScale);
        s.rotation = t * 1.5 + slot;
        s.visible = true;
      }
      for (let i = slot; i < sparkles.length; i++) {
        sparkles[i]!.visible = false;
      }

      if (flare) {
        const flash = burstTimer(t, 2, 3.2, 0.12);
        const flarePoint = haloPoint(haloX, haloY, haloAnimatedRx, haloAnimatedRy, orbitAngle, haloRotation);
        flare.alpha = (0.34 + flash * 0.36) * (frame.hovered ? 1.15 : 1);
        flare.scale.set((isDie ? 0.45 : 0.58) + flash * (isDie ? 0.16 : 0.22));
        flare.rotation = t * 1.2;
        flare.x = flarePoint.x;
        flare.y = flarePoint.y;
        flare.visible = showHalo;
      }
    };

    return makeRuntime(
      'holy',
      step,
      noopDestroy(
        () => applyArtFilters(art, null),
        () => {
          backdrop.destroy();
          sheen.destroy();
          haloGlow.destroy();
          haloCore.destroy();
          haloLight.destroy();
          edgeGlow.destroy();
          edgeCore.destroy();
          sparkles.forEach((s) => s.destroy());
          flare?.destroy();
        },
      ),
    );
  },
};
```

---

## Host Wiring: Card

From `src/ui/components/Card/Card.tsx`.

```tsx
import { use } from 'react';
import { effectsTexturesReady } from '@/loaders/effects/textures';
import { EffectMount } from '@/ui/effects/EffectMount';
import { createDefaultEffectFrame } from '@/ui/effects/context';
import type { EffectArtRef, EffectFrameContext, EffectId } from '@/ui/effects/types';

use(effectsTexturesReady);

const effectFrameRef = useRef<EffectFrameContext>(createDefaultEffectFrame('card', width, height, phase));

const applyArtFilters = useCallback((filters: Filter[] | null) => {
  pendingArtFiltersRef.current = filters;
  const target = flatSpriteRef.current ?? meshRef.current;
  if (target) {
    target.filters = filters;
  }
}, []);

const effectArtRef = useRef<EffectArtRef>({ applyFilters: () => {} });
effectArtRef.current.applyFilters = applyArtFilters;

// useTick — update frame before EffectMount steps the runtime:
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

// Perspective mesh corners → surfaceCorners (required for tilt-correct edge lights)
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
  effect={effect}           // pass 'holy' from props
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

Holy uses `frame.hovered` for edge/halo alpha boost and `frame.activated` for halo intensity. Cards set both every tick.

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

### Die hover/activation gap (current repo)

`Die.tsx` only updates `dt`, `time`, `width`, `height`, `hostKind`, and `phase` on `effectFrameRef`. It does **not** set `hovered`, `dragging`, or `activated`. Holy’s hover boost on edge lights, halo alpha, and flare therefore **do not activate on dice** unless you extend the die tick:

```tsx
// Optional — wire when die is interactive
frame.hovered = parentHovered;
frame.activated = parentSelected;
```

Cards set hover and activation every tick in `Card.tsx` (see [Host Wiring: Card](#host-wiring-card)).

---

## Tuning Reference

Global constants at the top of `holy.ts`:

| Constant | Value | Purpose |
|----------|-------|---------|
| `GOLD` / `GOLD_BRIGHT` | `0x6ff9f6` | Backdrop fill + particle tint (cyan-gold in current palette) |
| `RAINBOW_SPEED` | `0.22` | Hue cycles per second for edge lights and halo |
| `RGB_INTENSITY` | `0.5` | Rainbow mix: 0 = white strokes, 1 = full saturation |

All host-specific knobs live in `HOLY_TUNE`:

| Group | Key | Die | Card | Purpose |
|-------|-----|-----|------|---------|
| `sampleCount` | ring samples | 72 | 100 | Points around perimeter |
| `ringInsetScale` | inset | 1.02 | 1.01 | Ring sits slightly outside edge |
| `edgeLight.lanes` | — | 12 | 12 | Staggered rainbow edge-light layers |
| `edgeLight.speedBase` | — | 0.32 | 0.32 | Wave animation speed (per lane + step) |
| `edgeLight.waveFreqBase` | — | 8.5 | 8.5 | Spatial frequency along ring |
| `edgeLight.thresholdBase` | — | 0.5 | 0.5 | Lit-segment cutoff (higher = sparser lights) |
| `halo.yOffset` | px | -5 | 25 | Vertical offset above host center |
| `halo.rxScale` | — | 0.46 | 0.546 | Halo horizontal radius vs host |
| `halo.ryScale` | — | 0.11 | 0.0715 | Halo vertical radius (flat ellipse) |
| `halo.glowBlur` | strength | 5 | 7 | Outer halo blur |
| `halo.orbitSpeed` | rev/s | 0.34 | 0.34 | Orbiting light speed |
| `halo.idle.driftX` | px | 1.2 | 5 | Idle horizontal sway |
| `halo.idle.driftY` | px | 1.2 | 3 | Idle vertical sway |
| `halo.idle.wobbleScale` | — | 0.06 | 0.02 | Ellipse radius breathe |
| `halo.idle.rotation` | rad | 0.08 | 0.02 | Halo tilt wobble |

### Card loop shape

Cards use a **superellipse** perimeter (`exponent = 5.5`) via `createCardLoop`, not a rounded rectangle. This produces a softer card-shaped ring than axis-aligned `roundRect` strokes.

### Art filter tuning

| Parameter | Base | Pulse range |
|-----------|------|-------------|
| Brightness | 1.06 | 1.04 – 1.14 (2s sine) |
| Saturation | +0.12 | static |
| Color tone | highlight `0xfff8e0`, shadow `0x886622` | static |

---

## Per-Frame Render Pipeline

```
1. pulse01(t, 2) → stepHolyArtMatrix brightness
2. drawEffectBackdrop × 2 (backdrop + sheen, layers.back)
3. Clear 5 front Graphics layers
4. drawEdgeLightLane × 12 lanes × 2 layers (edgeGlow wide, edgeCore thin)
     → project each lit segment through projectPointToSurface
5. If !hideHalo:
     a. Compute halo idle drift / wobble / rotation
     b. drawHalo × 2 on haloGlow (outer blurred rings)
     c. drawHaloArc × 2 on haloCore (upper + lower semicircles)
     d. Draw orbiting light trail + dot on haloLight
6. stepParticles + spawn (7/s × pScale)
7. Project live particles → sparkle sprite positions (additive)
8. Position screen-blended flare at halo orbit via burstTimer flash
```

### Layer stack (front container, bottom → top)

| zIndex | Object | Blend | Filter |
|--------|--------|-------|--------|
| 0 | `haloGlow` | add | Blur 5 (die) / 7 (card) |
| 1 | `haloCore` | add | none |
| 2 | `haloLight` | add | Blur 2.5 / 3.5 |
| 3 | `edgeGlow` | add | Blur 3 / 5 |
| 4 | `edgeCore` | add | none |
| 10–23 | sparkle sprites | add | none |
| 30 | flare sprite | screen | none |

Back container:

| zIndex | Object | Blend | Filter |
|--------|--------|-------|--------|
| 0 | `backdrop` | add | Blur ~16 (scaled for die) |
| 1 | `sheen` | add | Blur ~10 (scaled for die) |

---

## Card vs Die Differences

| Feature | Card | Die |
|---------|------|-----|
| Edge loop | Superellipse (`createCardLoop`, exp 5.5) | `DIE_EDGE_POINTS` polygon (`createDieEdgeLoop`) |
| Edge bounds | Full art size | `tightDieBounds` (96% half-size) |
| Halo position | Above art top (`-halfH - 25`) | Above die (`-radius - 5`) |
| Halo hide | Yes (`hideHalo` in shop mode) | No default hide |
| Particle spawn origin | Random interior of card face | Ellipse perimeter |
| Sparkle pool / particle pool | 14 / 18 | 10 / 14 |
| Spawn rate | 7/s | 7/s × 0.72 scale |
| Edge stroke widths (glow) | 7 + lane×1.5 | 4 + lane |
| Edge stroke widths (core) | 1.8 | 1.2 |
| Backdrop inset | 12 / 14 | 6 / 4 |
| `surfaceCorners` | Updated from `PerspectiveMesh` | Static axis-aligned |
| Hover/activated boost | Wired in Card tick | Not wired in Die tick (optional) |

---

## Game Data Wiring (optional)

In Wagon Bones, `'holy'` is also an item/die **aura id** in game logic. Visual `EffectId` and game aura are separate layers:

| Layer | Location | Mapping |
|-------|----------|---------|
| Tag → aura | `src/game/TagSystem.ts` | `tag_holy: 'holy'` |
| Shop/dice rolls | `src/game/auraRng.ts` | Equipment: holy → fire → icy → ghost; dice: holy → fire → icy |
| Item metadata | `src/data/item_auras.ts` | `{ id: 'holy', label: 'Holy', … }` |
| Dice metadata | `src/data/dice_auras.ts` | `{ id: 'holy', … }` |
| UI prop | `Card` / `Die` | `effect={auraId}` where `auraId` satisfies `EffectId` |

To show the aura in UI, pass `effect="holy"` (or map equipment/die `aura.id` → `EffectId`) into `Card` / `Die` props.

### Effect picker (dev UI)

`src/ui/effects/effectOptions.ts` builds a dropdown from the registry:

```ts
import { EFFECT_DEFINITIONS } from '@/ui/effects/registry';
import type { EffectId } from '@/ui/effects/types';

export const EFFECT_OPTIONS: { id: EffectId; label: string }[] = [
  { id: 'none', label: 'none' },
  ...EFFECT_DEFINITIONS.map((d) => ({ id: d.id, label: d.label })),
];
```

---

## Quick Smoke Test

Built-in dev stories (both call `use(effectsTexturesReady)` and expose effect dropdown):

- `src/ui/stories/Card.story.tsx` — card with effect dropdown, shop/pack/owned modes
- `src/ui/stories/Die.story.tsx` — die with effect dropdown and enhancement types

```tsx
// Minimal inline test
<Card texture={someTexture} effect="holy" />
<Die diceType="d6" value={4} effect="holy" />
```

Ensure `effectsTexturesReady` is awaited on the render path. Hover a **card** to see edge-light and halo alpha boost. Select a card to see `activated` halo intensity. Shop-mode cards hide the overhead halo.

---

*Generated from Wagon Bones Pixi codebase. Canonical source paths under `/home/mstenq/web/wagon-bones-pixi/src/ui/effects/definitions/holy.ts` and dependencies listed above.*
