# Arcane Aura Effect — Complete Rebuild Guide

This document contains everything required to port the **arcane** card/die aura from Wagon Bones into another PixiJS v8 project using only this file as reference.

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
17. [Source: Aura Id Mapping](#source-aura-id-mapping)
18. [Source: Arcane Effect Definition](#source-arcane-effect-definition)
19. [Host Wiring: Card](#host-wiring-card)
20. [Host Wiring: Die](#host-wiring-die)
21. [Tuning Reference](#tuning-reference)
22. [Per-Frame Render Pipeline](#per-frame-render-pipeline)
23. [Card vs Die Differences](#card-vs-die-differences)
24. [Game Data Wiring (optional)](#game-data-wiring-optional)
25. [Quick Smoke Test](#quick-smoke-test)

---

## Overview

The arcane aura is a **stochastic icy lightning perimeter** that wraps cards and dice. It combines:

- **Three synchronized additive stroke layers** (`aura`, `strands`, `core`) tracing gated lit segments around a host-specific ring
- **Multi-lane animation** (3 lanes) with independent stochastic phase and gate dynamics — segments appear and break like flickering arcane energy
- **Normal/tangent wobble** on each ring sample, amplitude modulated by a dual-layer pulse, hover boost, and activation boost
- **Hover lightning strikes** — jagged paths from a perimeter anchor toward the pointer, with a soft impact bloom (cards only when hover/pointer are wired)
- **`BlurFilter`** on the wide aura and strand layers (and strike aura), with bounded `filterArea` to prevent bleed

The effect id is `'arcane'`. It is registered in the effect registry and instantiated by `EffectMount` on each card or die host.

**What arcane does not use:**

- No texture assets (`getEffectTexture` is never called)
- No custom GLSL shaders
- No `ColorMatrixFilter` or other art filters (`applyArtFilters` is unused)
- No back-layer backdrop graphics
- No particles or sprites
- No displacement maps

All visuals are procedural `Graphics` paths with Pixi built-in `BlurFilter`.

In game data the aura is still stored as `'icy'`; the UI maps that id to the visual `'arcane'` effect (see [Source: Aura Id Mapping](#source-aura-id-mapping)).

---

## Dependencies

| Package | Version in repo | Usage |
|---------|-----------------|-------|
| `pixi.js` | v8 | `Graphics`, `BlurFilter`, `Container`, `Rectangle` |
| `@pixi/react` | (project dep) | `useApplication`, `useTick`, `pixiContainer` |
| `react` | 19+ | `useRef`, `useCallback` — hosts may still `use(effectsTexturesReady)` for other auras |

Arcane alone does **not** require `Assets.load` or any effect texture preload.

---

## Required Textures

**None.** Arcane is fully procedural.

The shared loader registers a key named `arcaneNoiseA` (`Perlin_14-512x512.png`) used by the **fire** effect for flame noise — it is **not** referenced by `arcane.ts`. Do not copy Perlin noise assets for an arcane-only port.

---

## Architecture

```
Card / Die host
  ├── effectFrameRef  (mutated each tick: dt, pointer, surfaceCorners, hover, …)
  ├── effectArtRef    ({ applyFilters → unused by arcane, still required by EffectMount })
  └── <EffectMount effect="arcane" …>
        ├── layers.back  (zIndex 0) — empty for arcane
        ├── children     (zIndex 1) — card art / die sprite
        └── layers.front (zIndex 3) — aura, strands, core, strikeAura, strikeCore

EffectMount.useTick → stepEffect(runtime, frameRef.current)
  └── arcaneEffect.create() returned runtime.step(frame)
```

**Registry path:** `arcaneEffect` → `EFFECT_DEFINITIONS` → `getEffectDefinition('arcane')` → `createEffectRuntime()` → `def.create(layers, mount, art)`.

**Scene graph rule:** Effect `Graphics` layers are flat siblings of the art mesh. Card art uses `PerspectiveMesh` tilt; perimeter strokes hug the tilted face via bilinear `projectPointToSurface()` using `frame.surfaceCorners` updated by the card host each tick.

**Ring geometry:**

- **Cards:** superellipse loop (`exponent = 5.5`) via `createCardLoop`
- **Dice:** d20-ish polygon via `DIE_EDGE_POINTS` / `createDieEdgeLoop`

**Hover strikes:** When `frame.hovered && !frame.dragging`, arcane spawns up to 3 concurrent jagged paths from a perimeter point (biased toward pointer direction) to the pointer position. Requires `pointerNormX/Y`, `hovered`, and `dragging` on the frame ref.

---

## File Layout

Minimal tree to recreate the arcane aura:

```
src/
  ui/effects/
    types.ts
    registry.ts
    runtime.ts
    context.ts
    effectHelpers.ts
    dieTuning.ts
    EffectMount.tsx
    definitions/
      arcane.ts
    shared/
      borderFrame.ts
      dieOutline.ts
      glow.ts
      surfaceProjection.ts
  ui/components/CardBar/
    auraEffectId.ts       # optional — maps game 'icy' → 'arcane'
```

No assets directory entries required for arcane.

---

## Integration Checklist

1. Copy all source files from sections below (or from repo paths cited).
2. Add `'arcane'` to your `EFFECT_IDS` array.
3. Register `arcaneEffect` in `EFFECT_DEFINITIONS`.
4. Wrap card/die art in `<EffectMount effect={auraId} …>`.
5. Each tick, update `effectFrameRef.current`:
   - **Required for tilt-correct strokes on cards:** `surfaceCorners` from `PerspectiveMesh` corners
   - **Required for hover lightning on cards:** `hovered`, `dragging`, `pointerNormX`, `pointerNormY`
   - **Optional intensity boost:** `activated`
6. Provide `effectArtRef` (arcane ignores `applyFilters`, but `EffectMount` requires the ref).
7. (Optional) Map stored game aura id `'icy'` → `'arcane'` via `auraIdToEffectId`.
8. On dice, wire `hovered`, `dragging`, `pointerNormX/Y`, and `activated` if you want parity with card hover strikes and boost multipliers.

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
import { arcaneEffect } from '@/ui/effects/definitions/arcane';
// import other effects as needed
import type { EffectDefinition, EffectId } from '@/ui/effects/types';

export const EFFECT_DEFINITIONS: EffectDefinition[] = [
  arcaneEffect,
  // holyEffect, fireEffect, ghostEffect, …
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

/** Re-export — see dieTuning.ts */
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

### Frame fields consumed by arcane

| Field | Used for |
|-------|----------|
| `dt` | Strike spawn rate, stochastic damping, strike lifetime |
| `time`, `phase` | Animation clock (`t = time + phase * 0.13 + timeOffset`) |
| `width`, `height` | Ring bounds, pointer local coords, surface projection |
| `hovered` | Hover boost (1.12×), strike spawning |
| `dragging` | Suppresses strikes when true |
| `activated` | Active boost (1.2× amplitude) |
| `pointerNormX/Y` | Strike target; directional ring anchor |
| `surfaceCorners` | `projectPointToSurface` for tilt-correct drawing |

Fields **not** read by arcane: `tiltX`, `tiltY`, `hideHalo`, `hostKind` (host kind is fixed at create time via `mount.hostKind`).

---

## Source: Effect Helpers

`src/ui/effects/effectHelpers.ts` (functions used by arcane)

```ts
import { Graphics, type Container } from 'pixi.js';

import type { EffectDefinition, EffectFrameContext, EffectRuntime } from '@/ui/effects/types';

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

export function pulse01(time: number, period: number, phase = 0): number {
  return (Math.sin((time / period) * Math.PI * 2 + phase) + 1) * 0.5;
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

export function dieBlurPadding(mount: EffectMountContext): number {
  return isDieMount(mount) ? 10 : mount.padding;
}

export function dieBlurStrength(mount: EffectMountContext, cardStrength: number): number {
  return isDieMount(mount) ? cardStrength * 0.55 : cardStrength;
}
```

Arcane uses `dieBlurPadding` indirectly via `setGlowFilterAreaForMount` in `glow.ts`. Default padding: **18** (card), **12** (die).

---

## Source: Border Frame

`src/ui/effects/shared/borderFrame.ts` (minimal subset for arcane)

```ts
import type { EffectHostKind } from '@/ui/effects/types';

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

export function hostIsDie(hostKind: EffectHostKind): boolean {
  return hostKind === 'die';
}
```

Arcane calls `borderBoundsFromSize(mount.width, mount.height)` then scales by `ringInsetScale` (1.02).

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

Card hosts **must** update `surfaceCorners` each tick from the perspective mesh corner positions. Without this, arcane strokes draw on a flat axis-aligned quad while the art tilts away.

---

## Source: Glow / Blur Helpers

`src/ui/effects/shared/glow.ts` (subset used by arcane)

```ts
import { Graphics, Rectangle } from 'pixi.js';

import { dieBlurPadding } from '@/ui/effects/dieTuning';
import type { EffectMountContext } from '@/ui/effects/types';

export function filterAreaForBounds(width: number, height: number, padding: number): Rectangle {
  const halfW = width / 2 + padding;
  const halfH = height / 2 + padding;
  return new Rectangle(-halfW, -halfH, halfW * 2, halfH * 2);
}

/** Prevent BlurFilter from clipping to a hard rectangular edge. */
export function setGlowFilterAreaForMount(g: Graphics, mount: EffectMountContext, extraPadding = 0): void {
  g.filterArea = filterAreaForBounds(mount.width, mount.height, dieBlurPadding(mount) + extraPadding);
}
```

Arcane assigns custom `BlurFilter` instances then calls `setGlowFilterAreaForMount` with extra padding **10** (aura), **4** (strands), **8** (strike aura).

**Rule:** Always set `filterArea` on blurred effect graphics. Unbounded blur on additive layers can leave faint glow bleed in later filtered draws.

---

## Source: Aura Id Mapping

`src/ui/components/CardBar/auraEffectId.ts`

```ts
import { EFFECT_IDS, type EffectId } from '@/ui/effects/types';

/**
 * Map stored aura ids to Pixi effect ids.
 * Game data still uses `icy`; the visual layer renamed that aura to `arcane` (see `EFFECT_IDS`).
 */
export function auraIdToEffectId(auraId?: string | null): EffectId {
  if (!auraId) {
    return 'none';
  }
  if (auraId === 'icy') {
    return 'arcane';
  }
  if ((EFFECT_IDS as readonly string[]).includes(auraId)) {
    return auraId as EffectId;
  }
  return 'none';
}
```

Usage in card/die rows:

```tsx
<Card effect={auraIdToEffectId(item.aura?.id)} … />
<Die effect={auraIdToEffectId(dieAuraId)} … />
```

---

## Source: Arcane Effect Definition

`src/ui/effects/definitions/arcane.ts` — **canonical implementation**

```ts
import { BlurFilter } from 'pixi.js';

import { addGlowLayer, makeRuntime, noopDestroy, pulse01 } from '@/ui/effects/effectHelpers';
import { borderBoundsFromSize } from '@/ui/effects/shared/borderFrame';
import { createDieEdgeLoop } from '@/ui/effects/shared/dieOutline';
import { setGlowFilterAreaForMount } from '@/ui/effects/shared/glow';
import { projectPointToSurface } from '@/ui/effects/shared/surfaceProjection';
import type { EffectDefinition, EffectFrameContext } from '@/ui/effects/types';

type Point = { x: number; y: number };
type Strike = {
  life: number;
  maxLife: number;
  path: Point[];
  impact: Point;
};

const TAU = Math.PI * 2;
const ARCANE_CORE = 0xe8f8ff;
const ARCANE_OUTER = 0x8fd6ff;
const ARCANE_TUNE = {
  ringInsetScale: 1.02,
  sampleCount: { die: 96, card: 132 },
  laneCount: 3,
  baseAmplitude: 2.1,
  hoverBoost: 1.12,
  activeBoost: 1.2,
  pulse: {
    base: 0.72,
    layer1PeriodBase: 1.15,
    layer1PeriodSeedScale: 0.2,
    layer1Weight: 0.34,
    layer2PeriodBase: 2.9,
    layer2PeriodSeedScale: 0.35,
    layer2Phase: 1.4,
    layer2Weight: 0.1,
  },
  lane: {
    phaseStep: 0.9,
    phaseSeedScale: 4.0,
    speedBase: 6.4,
    speedStep: 1.5,
    freqBase: 0.42,
    freqStep: 0.08,
    thresholdBase: 0.46,
    thresholdStep: 0.08,
    microDriftBase: 0.52,
    microDriftStep: 0.11,
    gateCadenceBase: 9.5,
    gateCadenceStep: 1.5,
  },
  stochastic: {
    phaseKick: 7.5,
    phaseDamping: 2.1,
    gateKick: 3.2,
    gateDamping: 1.8,
    initialGateNudgeMax: 20,
  },
  shape: {
    driftIndexScale: 0.07,
    driftPhaseScale: 1.7,
    driftSeedScale: 4.0,
    driftPhaseNudgeScale: 0.22,
    driftAmplitude: 1.6,
    tangentWiggleScale: 0.53,
    tangentIndexScale: 0.33,
    tangentSeedScale: 3.0,
    tangentDriftScale: 0.6,
    normalOffsetBase: 1.2,
    normalOffsetJitterScale: 2.4,
    tangentOffset: 1.7,
  },
  gate: {
    waveFrequencyBase: 8.1,
    waveFrequencyStep: 0.7,
    waveIndexScale: 0.55,
    wavePhaseNudgeScale: 0.35,
    waveWeight: 0.65,
    noiseWeight: 0.35,
    breakNoiseThreshold: 0.08,
  },
  stroke: {
    auraBlur: { strength: 10, quality: 3 },
    strandsBlur: { strength: 3, quality: 2 },
    aura: { width: 11, alpha: 0.18 },
    strands: { width: 4, alpha: 0.42 },
    core: { width: 1.8, alpha: 0.95 },
  },
  hoverStrike: {
    spawnPerSecond: 1.35,
    maxConcurrent: 3,
    lifeMin: 0.07,
    lifeMax: 0.14,
    segments: 7,
    jitterBase: 2.2,
    jitterSeedScale: 2.8,
    auraBlur: { strength: 6, quality: 2 },
    auraWidth: 6,
    auraAlpha: 0.45,
    coreWidth: 1.8,
    coreAlpha: 0.95,
    impactRadius: 8,
    impactAlpha: 0.28,
  },
} as const;

function fract(n: number): number {
  return n - Math.floor(n);
}

function hash(n: number): number {
  return fract(Math.sin(n * 12.9898) * 43758.5453);
}

function createCardLoop(halfW: number, halfH: number, samples: number): Point[] {
  const points: Point[] = [];
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

function createNormals(points: Point[]): Point[] {
  const normals: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length]!;
    const next = points[(i + 1) % points.length]!;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.max(0.0001, Math.hypot(tx, ty));
    normals.push({ x: -ty / len, y: tx / len });
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

function directionalRingPointIndex(points: Point[], target: Point): number {
  const dist2 = target.x * target.x + target.y * target.y;
  if (dist2 < 28 * 28) {
    return -1;
  }
  const angle = Math.atan2(target.y, target.x);
  const normalized = (angle + Math.PI) / TAU;
  const idx = Math.round(normalized * points.length) % points.length;
  return (idx + points.length) % points.length;
}

function createStrikePath(start: Point, end: Point, seed: number): Point[] {
  const points: Point[] = [];
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.max(0.0001, Math.hypot(dx, dy));
  const nx = -dy / len;
  const ny = dx / len;
  const segments = ARCANE_TUNE.hoverStrike.segments;
  const jitter = ARCANE_TUNE.hoverStrike.jitterBase + seed * ARCANE_TUNE.hoverStrike.jitterSeedScale;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const taper = Math.sin(Math.PI * t);
    const lateral = (hash(seed * 191 + i * 71.3) - 0.5) * jitter * taper;
    points.push({
      x: start.x + dx * t + nx * lateral,
      y: start.y + dy * t + ny * lateral,
    });
  }
  return points;
}

export const arcaneEffect: EffectDefinition = {
  id: 'arcane',
  label: 'Arcane',
  create(layers, mount) {
    const bounds = borderBoundsFromSize(mount.width, mount.height);
    const baseHalfW = bounds.halfW * ARCANE_TUNE.ringInsetScale;
    const baseHalfH = bounds.halfH * ARCANE_TUNE.ringInsetScale;
    const sampleCount = mount.hostKind === 'die' ? ARCANE_TUNE.sampleCount.die : ARCANE_TUNE.sampleCount.card;
    const ringPoints =
      mount.hostKind === 'die'
        ? createDieEdgeLoop(baseHalfW, baseHalfH, sampleCount)
        : createCardLoop(baseHalfW, baseHalfH, sampleCount);
    const ringNormals = createNormals(ringPoints);

    const aura = addGlowLayer(layers.front, 0);
    aura.filters = [new BlurFilter(ARCANE_TUNE.stroke.auraBlur)];
    setGlowFilterAreaForMount(aura, mount, 10);
    const strands = addGlowLayer(layers.front, 1);
    strands.filters = [new BlurFilter(ARCANE_TUNE.stroke.strandsBlur)];
    setGlowFilterAreaForMount(strands, mount, 4);
    const core = addGlowLayer(layers.front, 2);
    const strikeAura = addGlowLayer(layers.front, 4);
    strikeAura.filters = [new BlurFilter(ARCANE_TUNE.hoverStrike.auraBlur)];
    setGlowFilterAreaForMount(strikeAura, mount, 8);
    const strikeCore = addGlowLayer(layers.front, 5);

    const seed = Math.random();
    const timeOffset = seed * 91.7;
    const lanePhaseNudge = Array.from({ length: ARCANE_TUNE.laneCount }, () => (Math.random() - 0.5) * TAU);
    const lanePhaseVelocity = Array.from({ length: ARCANE_TUNE.laneCount }, () => 0);
    const laneGateNudge = Array.from(
      { length: ARCANE_TUNE.laneCount },
      () => Math.random() * ARCANE_TUNE.stochastic.initialGateNudgeMax,
    );
    const laneGateVelocity = Array.from({ length: ARCANE_TUNE.laneCount }, () => 0);
    const strikes: Strike[] = [];

    const step = (frame: EffectFrameContext) => {
      const t = frame.time + frame.phase * 0.13 + timeOffset;
      const pulse =
        ARCANE_TUNE.pulse.base +
        pulse01(t, ARCANE_TUNE.pulse.layer1PeriodBase + seed * ARCANE_TUNE.pulse.layer1PeriodSeedScale) *
          ARCANE_TUNE.pulse.layer1Weight +
        pulse01(
          t,
          ARCANE_TUNE.pulse.layer2PeriodBase + seed * ARCANE_TUNE.pulse.layer2PeriodSeedScale,
          ARCANE_TUNE.pulse.layer2Phase,
        ) *
          ARCANE_TUNE.pulse.layer2Weight;
      const hoverBoost = frame.hovered ? ARCANE_TUNE.hoverBoost : 1.0;
      const activeBoost = frame.activated ? ARCANE_TUNE.activeBoost : 1.0;
      const amp = ARCANE_TUNE.baseAmplitude * pulse * hoverBoost * activeBoost;

      aura.clear();
      strands.clear();
      core.clear();
      strikeAura.clear();
      strikeCore.clear();

      const pointer = {
        x: (frame.pointerNormX - 0.5) * frame.width,
        y: (frame.pointerNormY - 0.5) * frame.height,
      };
      const canStrike = frame.hovered && !frame.dragging;
      if (
        canStrike &&
        strikes.length < ARCANE_TUNE.hoverStrike.maxConcurrent &&
        Math.random() < frame.dt * ARCANE_TUNE.hoverStrike.spawnPerSecond
      ) {
        const seedJitter = hash(t * 3.11 + strikes.length * 17.9 + seed * 10);
        const directionalIdx = directionalRingPointIndex(ringPoints, pointer);
        const anchorIndex = directionalIdx >= 0 ? directionalIdx : nearestRingPointIndex(ringPoints, pointer);
        const anchor = ringPoints[anchorIndex]!;
        const normal = ringNormals[anchorIndex]!;
        const start: Point = {
          x: anchor.x + normal.x * (3 + seedJitter * 4),
          y: anchor.y + normal.y * (3 + seedJitter * 4),
        };
        const life =
          ARCANE_TUNE.hoverStrike.lifeMin +
          seedJitter * (ARCANE_TUNE.hoverStrike.lifeMax - ARCANE_TUNE.hoverStrike.lifeMin);
        strikes.push({
          life,
          maxLife: life,
          path: createStrikePath(start, pointer, seedJitter + t * 0.1),
          impact: pointer,
        });
      }

      for (let lane = 0; lane < ARCANE_TUNE.laneCount; lane++) {
        const phaseVelocity =
          (lanePhaseVelocity[lane] ?? 0) + (Math.random() - 0.5) * frame.dt * ARCANE_TUNE.stochastic.phaseKick;
        const dampedPhaseVelocity = phaseVelocity * Math.max(0, 1 - frame.dt * ARCANE_TUNE.stochastic.phaseDamping);
        lanePhaseVelocity[lane] = dampedPhaseVelocity;
        lanePhaseNudge[lane] = (lanePhaseNudge[lane] ?? 0) + dampedPhaseVelocity * frame.dt;
        const phaseNudge = lanePhaseNudge[lane] ?? 0;

        const gateVelocity =
          (laneGateVelocity[lane] ?? 0) + (Math.random() - 0.5) * frame.dt * ARCANE_TUNE.stochastic.gateKick;
        const dampedGateVelocity = gateVelocity * Math.max(0, 1 - frame.dt * ARCANE_TUNE.stochastic.gateDamping);
        laneGateVelocity[lane] = dampedGateVelocity;
        laneGateNudge[lane] = (laneGateNudge[lane] ?? 0) + dampedGateVelocity * frame.dt;
        const gateNudge = laneGateNudge[lane] ?? 0;

        const lanePhase = lane * ARCANE_TUNE.lane.phaseStep + seed * ARCANE_TUNE.lane.phaseSeedScale;
        const laneSpeed = ARCANE_TUNE.lane.speedBase + lane * ARCANE_TUNE.lane.speedStep;
        const laneFreq = ARCANE_TUNE.lane.freqBase + lane * ARCANE_TUNE.lane.freqStep;
        const laneThreshold = ARCANE_TUNE.lane.thresholdBase + lane * ARCANE_TUNE.lane.thresholdStep;
        const microDriftSpeed = ARCANE_TUNE.lane.microDriftBase + lane * ARCANE_TUNE.lane.microDriftStep;
        const gateCadence = ARCANE_TUNE.lane.gateCadenceBase + lane * ARCANE_TUNE.lane.gateCadenceStep;

        let started = false;
        for (let i = 0; i <= ringPoints.length; i++) {
          const idx = i % ringPoints.length;
          const p = ringPoints[idx]!;
          const n = ringNormals[idx]!;
          const jitterSeed = hash(idx * 19.13 + lane * 71.7 + seed * 100);
          const drift =
            Math.sin(
              t * microDriftSpeed +
                idx * ARCANE_TUNE.shape.driftIndexScale +
                lanePhase * ARCANE_TUNE.shape.driftPhaseScale +
                jitterSeed * ARCANE_TUNE.shape.driftSeedScale +
                phaseNudge * ARCANE_TUNE.shape.driftPhaseNudgeScale,
            ) * ARCANE_TUNE.shape.driftAmplitude;
          const wobble = Math.sin(t * laneSpeed + idx * laneFreq + lanePhase + jitterSeed * TAU + drift + phaseNudge);
          const tangentWiggle = Math.cos(
            t * (laneSpeed * ARCANE_TUNE.shape.tangentWiggleScale) +
              idx * ARCANE_TUNE.shape.tangentIndexScale +
              jitterSeed * ARCANE_TUNE.shape.tangentSeedScale +
              drift * ARCANE_TUNE.shape.tangentDriftScale,
          );
          const offsetN =
            wobble *
            (ARCANE_TUNE.shape.normalOffsetBase + jitterSeed * ARCANE_TUNE.shape.normalOffsetJitterScale) *
            amp;
          const offsetT = tangentWiggle * ARCANE_TUNE.shape.tangentOffset;
          const x = p.x + n.x * offsetN + -n.y * offsetT;
          const y = p.y + n.y * offsetN + n.x * offsetT;
          const projected = projectPointToSurface({ x, y }, frame);

          const gateNoise = hash(idx * 13.1 + lane * 97.1 + Math.floor((t + gateNudge) * gateCadence));
          const gateWave =
            0.5 +
            0.5 *
              Math.sin(
                t * (ARCANE_TUNE.gate.waveFrequencyBase + lane * ARCANE_TUNE.gate.waveFrequencyStep) +
                  idx * ARCANE_TUNE.gate.waveIndexScale +
                  lanePhase +
                  drift +
                  phaseNudge * ARCANE_TUNE.gate.wavePhaseNudgeScale,
              );
          const gate = gateWave * ARCANE_TUNE.gate.waveWeight + gateNoise * ARCANE_TUNE.gate.noiseWeight;
          const lit = gate > laneThreshold;

          if (!lit || (i > 0 && i < ringPoints.length && gateNoise < ARCANE_TUNE.gate.breakNoiseThreshold)) {
            started = false;
            continue;
          }

          if (!started) {
            aura.moveTo(projected.x, projected.y);
            strands.moveTo(projected.x, projected.y);
            core.moveTo(projected.x, projected.y);
            started = true;
          } else {
            aura.lineTo(projected.x, projected.y);
            strands.lineTo(projected.x, projected.y);
            core.lineTo(projected.x, projected.y);
          }
        }
      }

      aura.stroke({
        width: ARCANE_TUNE.stroke.aura.width,
        color: ARCANE_OUTER,
        alpha: ARCANE_TUNE.stroke.aura.alpha * hoverBoost,
      });
      strands.stroke({
        width: ARCANE_TUNE.stroke.strands.width,
        color: ARCANE_OUTER,
        alpha: ARCANE_TUNE.stroke.strands.alpha * pulse,
      });
      core.stroke({
        width: ARCANE_TUNE.stroke.core.width,
        color: ARCANE_CORE,
        alpha: ARCANE_TUNE.stroke.core.alpha * pulse,
      });

      for (let i = strikes.length - 1; i >= 0; i--) {
        const strike = strikes[i]!;
        strike.life -= frame.dt;
        if (strike.life <= 0) {
          strikes.splice(i, 1);
          continue;
        }
        const lifeT = strike.life / strike.maxLife;
        const alphaT = Math.min(1, lifeT * 1.8);
        const path = strike.path;
        if (path.length > 1) {
          const start = projectPointToSurface(path[0]!, frame);
          strikeAura.moveTo(start.x, start.y);
          strikeCore.moveTo(start.x, start.y);
          for (let j = 1; j < path.length; j++) {
            const p = projectPointToSurface(path[j]!, frame);
            strikeAura.lineTo(p.x, p.y);
            strikeCore.lineTo(p.x, p.y);
          }
        }
        const impact = projectPointToSurface(strike.impact, frame);
        strikeAura.circle(impact.x, impact.y, ARCANE_TUNE.hoverStrike.impactRadius * alphaT);
        strikeAura.fill({ color: ARCANE_OUTER, alpha: ARCANE_TUNE.hoverStrike.impactAlpha * alphaT });
      }

      strikeAura.stroke({
        width: ARCANE_TUNE.hoverStrike.auraWidth,
        color: ARCANE_OUTER,
        alpha: ARCANE_TUNE.hoverStrike.auraAlpha,
      });
      strikeCore.stroke({
        width: ARCANE_TUNE.hoverStrike.coreWidth,
        color: ARCANE_CORE,
        alpha: ARCANE_TUNE.hoverStrike.coreAlpha,
      });
    };

    return makeRuntime(
      'arcane',
      step,
      noopDestroy(() => {
        aura.destroy();
        strands.destroy();
        core.destroy();
        strikeAura.destroy();
        strikeCore.destroy();
      }),
    );
  },
};
```

### Algorithm notes

**Per-lane gating:** Each lane draws independent polyline segments around the ring. A sample is lit when `gate > laneThreshold`, where `gate` mixes a traveling sine wave (65%) and hash noise (35%). Segments break early when `gateNoise < 0.08` mid-ring, producing flickering gaps.

**Stochastic nudging:** Each lane maintains damped random velocities for phase and gate offsets, making the animation non-repeating across instances (seeded at create time).

**Strike anchor selection:** If the pointer is farther than 28px from center, pick the ring index aligned with pointer angle; otherwise fall back to nearest ring point. Start point is offset outward along the normal by 3–7px.

**Card loop:** Superellipse with exponent **5.5** — softer than a rectangle, tighter than an ellipse.

---

## Host Wiring: Card

From `src/ui/components/Card/Card.tsx`.

```tsx
import { EffectMount } from '@/ui/effects/EffectMount';
import { createDefaultEffectFrame } from '@/ui/effects/context';
import type { EffectArtRef, EffectFrameContext, EffectId } from '@/ui/effects/types';

const effectFrameRef = useRef<EffectFrameContext>(createDefaultEffectFrame('card', width, height, phase));
const effectArtRef = useRef<EffectArtRef>({ applyFilters: applyArtFilters });
const pointerNormRef = useRef({ x: 0.5, y: 0.5 });

// On pointer move (when hovered, not dragging):
pointerNormRef.current = {
  x: (localX + width / 2) / width,
  y: (localY + height / 2) / height,
};

// useTick (card host — runs before EffectMount's step):
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

// Perspective mesh corners → surfaceCorners (required for tilt-correct strokes)
const surfaceCorners = frame.surfaceCorners;
if (mesh) {
  const [tl, tr, br, bl] = corners.outPoints;
  surfaceCorners[0].x = -width / 2 + tl!.x;
  surfaceCorners[0].y = -height / 2 + tl!.y;
  surfaceCorners[1].x = -width / 2 + tr!.x;
  surfaceCorners[1].y = -height / 2 + tr!.y;
  surfaceCorners[2].x = -width / 2 + br!.x;
  surfaceCorners[2].y = -height / 2 + br!.y;
  surfaceCorners[3].x = -width / 2 + bl!.x;
  surfaceCorners[3].y = -height / 2 + bl!.y;
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
  effect={effect}           // pass 'arcane' or auraIdToEffectId('icy')
  hostKind="card"
  width={width}
  height={height}
  frameRef={effectFrameRef}
  artRef={effectArtRef}
>
  {/* PerspectiveMesh or flat Sprite */}
</EffectMount>
```

Default card size: **150×210**. Default padding: **18** (`CARD_EFFECT_PADDING`).

Arcane on cards uses `frame.hovered` for aura alpha boost and strike spawning, `frame.activated` for amplitude boost, and `pointerNormX/Y` for strike targets. All are wired in `Card.tsx`.

Note: `Card.tsx` calls `use(effectsTexturesReady)` for other auras; arcane does not depend on it.

---

## Host Wiring: Die

From `src/ui/components/Dice/Die.tsx`.

```tsx
import { EffectMount } from '@/ui/effects/EffectMount';
import { createDefaultEffectFrame } from '@/ui/effects/context';
import type { EffectArtRef, EffectFrameContext, EffectId } from '@/ui/effects/types';

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

### Die hover/strike gap (current repo)

`Die.tsx` only updates `dt`, `time`, `width`, `height`, `hostKind`, and `phase` on `effectFrameRef`. It does **not** set `hovered`, `dragging`, `activated`, or `pointerNormX/Y`. Perimeter animation still runs, but:

- Hover boost and active boost stay at **1.0**
- Hover lightning strikes **never spawn**

To enable die parity:

```tsx
frame.hovered = parentHovered;
frame.dragging = parentDragging;
frame.activated = parentSelected;
frame.pointerNormX = pointerNormX;
frame.pointerNormY = pointerNormY;
```

---

## Tuning Reference

### Colors

| Constant | Value | Role |
|----------|-------|------|
| `ARCANE_CORE` | `0xe8f8ff` | Bright icy core stroke (perimeter + strikes) |
| `ARCANE_OUTER` | `0x8fd6ff` | Outer aura/strand/strike glow color |

### Global amplitude

| Key | Value | Purpose |
|-----|-------|---------|
| `baseAmplitude` | 2.1 | Scales normal-offset wobble |
| `hoverBoost` | 1.12 | Multiplier when `frame.hovered` |
| `activeBoost` | 1.2 | Multiplier when `frame.activated` |
| `ringInsetScale` | 1.02 | Ring sits slightly outside art bounds |

### Pulse (dual sine)

| Key | Value | Purpose |
|-----|-------|---------|
| `pulse.base` | 0.72 | Floor pulse value |
| `layer1PeriodBase` | 1.15 | Fast pulse period (± seed × 0.2) |
| `layer1Weight` | 0.34 | Fast pulse contribution |
| `layer2PeriodBase` | 2.9 | Slow pulse period (± seed × 0.35) |
| `layer2Phase` | 1.4 | Slow pulse phase offset |
| `layer2Weight` | 0.1 | Slow pulse contribution |

Effective pulse drives strand/core alpha and wobble amplitude.

### Ring sampling

| Host | `sampleCount` | Loop |
|------|---------------|------|
| Card | 132 | `createCardLoop` (superellipse exp 5.5) |
| Die | 96 | `createDieEdgeLoop` (`DIE_EDGE_POINTS`) |

### Lanes (`laneCount = 3`)

Each lane `L` adds `L * step` to speed, freq, threshold, microDrift, and gateCadence bases:

| Base key | Value | Step |
|----------|-------|------|
| `speedBase` | 6.4 | +1.5 |
| `freqBase` | 0.42 | +0.08 |
| `thresholdBase` | 0.46 | +0.08 (higher lane = sparser segments) |
| `microDriftBase` | 0.52 | +0.11 |
| `gateCadenceBase` | 9.5 | +1.5 |

### Stroke layers

| Layer | Width | Alpha | Blur |
|-------|-------|-------|------|
| `aura` | 11 | 0.18 × hoverBoost | strength 10, quality 3 |
| `strands` | 4 | 0.42 × pulse | strength 3, quality 2 |
| `core` | 1.8 | 0.95 × pulse | none |

### Hover strikes

| Key | Value |
|-----|-------|
| `spawnPerSecond` | 1.35 |
| `maxConcurrent` | 3 |
| `lifeMin` / `lifeMax` | 0.07 / 0.14 s |
| `segments` | 7 (jagged path points) |
| `impactRadius` | 8 px (fades with life) |
| Strike aura blur | strength 6, width 6, alpha 0.45 |
| Strike core | width 1.8, alpha 0.95 |

### Stochastic dynamics

| Key | Value | Purpose |
|-----|-------|---------|
| `phaseKick` | 7.5 | Random phase velocity impulse per frame |
| `phaseDamping` | 2.1 | Phase velocity decay |
| `gateKick` | 3.2 | Random gate nudge impulse |
| `gateDamping` | 1.8 | Gate velocity decay |
| `initialGateNudgeMax` | 20 | Initial random gate offset per lane |

---

## Per-Frame Render Pipeline

```
1. t = time + phase * 0.13 + timeOffset
2. pulse = base + layer1 sine + layer2 sine
3. amp = baseAmplitude * pulse * hoverBoost * activeBoost
4. Clear 5 front Graphics layers
5. pointer = denormalize pointerNormX/Y to local card/die space
6. Maybe spawn hover strike (hovered && !dragging, rate-limited)
7. For each lane (0..2):
     a. Update stochastic phase/gate nudges (damped random walk)
     b. Walk ring samples (i = 0..N, wrapping):
          - Compute drift, wobble, tangent wiggle → offset point
          - projectPointToSurface → screen-aligned coords
          - gate = wave * 0.65 + noise * 0.35
          - If lit and not broken: moveTo/lineTo on aura, strands, core
8. Stroke aura (outer, wide blur), strands (mid), core (bright thin)
9. For each live strike:
     a. Decrement life; remove if expired
     b. Draw jagged path on strikeAura + strikeCore (projected)
     c. Draw impact circle on strikeAura (filled bloom)
10. Stroke strikeAura + strikeCore
```

### Layer stack (front container, bottom → top)

| zIndex | Object | Blend | Filter |
|--------|--------|-------|--------|
| 0 | `aura` | add | Blur strength 10, filterArea +10 pad |
| 1 | `strands` | add | Blur strength 3, filterArea +4 pad |
| 2 | `core` | add | none |
| 4 | `strikeAura` | add | Blur strength 6, filterArea +8 pad |
| 5 | `strikeCore` | add | none |

Back container: **empty** for arcane.

---

## Card vs Die Differences

| Feature | Card | Die |
|---------|------|-----|
| Edge loop | Superellipse (`createCardLoop`, exp 5.5) | `DIE_EDGE_POINTS` polygon (`createDieEdgeLoop`) |
| Ring samples | 132 | 96 |
| Ring bounds | Full art size × 1.02 inset | Full art size × 1.02 inset |
| `surfaceCorners` | Updated from `PerspectiveMesh` | Static axis-aligned square |
| Hover boost | Wired in Card tick | Not wired (stays 1.0) |
| Active boost | Wired when card selected | Not wired (stays 1.0) |
| Hover strikes | Wired (pointer + hover) | Not wired (never spawn) |
| Blur filterArea padding | Uses `mount.padding` (18) | Uses fixed die pad (10) |

---

## Game Data Wiring (optional)

In Wagon Bones, the arcane visual corresponds to game aura id **`'icy'`** (legacy name). Visual `EffectId` and game aura are separate layers:

| Layer | Location | Notes |
|-------|----------|-------|
| UI mapping | `src/ui/components/CardBar/auraEffectId.ts` | `'icy'` → `'arcane'` |
| Item metadata | `src/data/item_auras.ts` | `{ id: 'icy', name: 'Icy', description: '+50 miles', … }` |
| Dice metadata | `src/data/dice_auras.ts` | `{ id: 'icy', name: 'Icy', … }` |
| Roll order | `EQUIPMENT_AURA_ORDER` / `DICE_AURA_ORDER` | `'icy'` in sequence after fire |
| Trail tags | `src/data/trail_tags.ts` | `tag_icy` |
| UI prop | `Card` / `Die` | `effect={auraIdToEffectId(aura.id)}` |

To show the aura in UI:

```tsx
import { auraIdToEffectId } from '@/ui/components/CardBar/auraEffectId';

<Card effect={auraIdToEffectId(item.aura?.id)} … />
<Die effect={auraIdToEffectId(diceAuraId)} … />
```

Or pass `effect="arcane"` directly in dev/tests.

### Effect picker (dev UI)

`src/ui/effects/effectOptions.ts`:

```ts
import { EFFECT_DEFINITIONS } from '@/ui/effects/registry';
import type { EffectId } from '@/ui/effects/types';

export const EFFECT_OPTIONS: { id: EffectId; label: string }[] = [
  { id: 'none', label: 'none' },
  ...EFFECT_DEFINITIONS.map((d) => ({ id: d.id, label: d.label })),
];
```

Dropdown shows label **"Arcane"** from `arcaneEffect.label`.

---

## Quick Smoke Test

Built-in dev stories (expose effect dropdown):

- `src/ui/stories/Card.story.tsx` — select **arcane** from dropdown
- `src/ui/stories/Die.story.tsx` — select **arcane** from dropdown

```tsx
// Minimal inline test — no texture preload required for arcane
<Card texture={someTexture} effect="arcane" />
<Die diceType="d6" value={4} effect="arcane" />

// From game data id
<Card effect={auraIdToEffectId('icy')} … />
```

**Card:** Hover to see brighter aura alpha, amplitude boost, and lightning strikes toward the pointer. Select the card to see the `activated` amplitude boost.

**Die:** Perimeter flicker runs immediately; hover strikes require extra frame wiring (see [Die hover/strike gap](#die-hoverstrike-gap-current-repo)).

---

*Generated from Wagon Bones Pixi codebase. Canonical source: `/home/mstenq/web/wagon-bones-pixi/src/ui/effects/definitions/arcane.ts` and dependencies listed above.*
