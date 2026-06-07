# Ghost Aura Effect — Complete Rebuild Guide

This document contains everything required to port the **ghost** card/die aura from Wagon Bones into another PixiJS v8 project using only this file as reference.

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
11. [Source: Die Tuning (EffectMount only)](#source-die-tuning-effectmount-only)
12. [Source: Effect Helpers (minimal)](#source-effect-helpers-minimal)
13. [Source: Pseudo-Random Burst](#source-pseudo-random-burst)
14. [Source: Ghost Aura Filter (GLSL)](#source-ghost-aura-filter-glsl)
15. [Source: Ghost Effect Definition](#source-ghost-effect-definition)
16. [Host Wiring: Card](#host-wiring-card)
17. [Host Wiring: Die](#host-wiring-die)
18. [Aura ID Mapping (UI)](#aura-id-mapping-ui)
19. [Tuning Reference](#tuning-reference)
20. [Per-Frame Render Pipeline](#per-frame-render-pipeline)
21. [Card vs Die Differences](#card-vs-die-differences)
22. [Game Data Wiring (optional)](#game-data-wiring-optional)
23. [Quick Smoke Test](#quick-smoke-test)
24. [CSP / Strict Mode](#csp--strict-mode)

---

## Overview

The ghost aura is a **spectral art treatment** applied directly to card/die artwork. Unlike holy, fire, or arcane, it has:

- **No edge particles, halos, or backdrop Graphics**
- **No texture assets**
- **One custom GLSL fragment filter** on the host sprite/mesh

The visual is an inverted, desaturated, green-cyan tinted negative of the artwork with a slow sine **breathe** pulse and occasional **brightness bursts**.

The effect id is `'ghost'`. It is registered in the effect registry and instantiated by `EffectMount` on each card or die host. The `create()` hook ignores `layers` and `mount` — all output is the art filter.

Historical note: the repo contains `src/assets/effects/ghost-face.png` and `ghost-face-inverted.png`, but **the current Pixi ghost aura does not load or reference them**. The Phaser-era ghost aura also used tint on the card with no particles (`createGhostParticles` returns empty). The Pixi port consolidated that into the shader.

---

## Dependencies

| Package | Version in repo | Usage |
|---------|-----------------|-------|
| `pixi.js` | v8 | `Filter`, `GlProgram`, `UniformGroup` |
| `@pixi/react` | (project dep) | `useApplication`, `useTick`, `pixiContainer` |
| `react` | 19+ | `useRef`, `useCallback` |

Ghost is the only shipped aura that uses **custom GLSL**. Holy, fire, and arcane use built-in filters and `Graphics`; ghost uses `Filter` + `GlProgram.from()`.

---

## Required Textures

**None.** Ghost does not call `getEffectTexture()` and does not draw sprites or `Graphics`.

For a **ghost-only** port you do not need `src/loaders/effects/images.ts` or `textures.ts`. Wagon Bones card/die hosts still call `use(effectsTexturesReady)` because other auras share the same host components — that preload is unrelated to ghost itself.

### Unused legacy assets (do not copy for ghost)

These files exist in the repo but are **not wired** to the Pixi ghost effect:

| Path | Notes |
|------|-------|
| `src/assets/effects/ghost-face.png` | Orphaned; not imported anywhere in Pixi effects |
| `src/assets/effects/ghost-face-inverted.png` | Orphaned; not imported anywhere in Pixi effects |

Inversion is done in the fragment shader via `mix(src.rgb, vec3(1.0) - src.rgb, uInvertAmount)`.

---

## Architecture

```
Card / Die host
  ├── effectFrameRef  (ghost only reads frame.dt each tick)
  ├── effectArtRef    ({ applyFilters → host sprite/mesh })
  └── <EffectMount effect="ghost" …>
        ├── layers.back  (zIndex 0) — unused by ghost
        ├── children     (zIndex 1) — card art / die sprite  ← filter applied here
        └── layers.front (zIndex 3) — unused by ghost

EffectMount.useTick → stepEffect(runtime, frameRef.current)
  └── ghostEffect.create() returned runtime.step(frame)
        └── aura.setUniforms({ invertAmount, tintAmount, saturation, brightness, pulse })
```

**Registry path:** `ghostEffect` → `EFFECT_DEFINITIONS` → `getEffectDefinition('ghost')` → `createEffectRuntime()` → `def.create(layers, mount, art)`.

**Filter attachment:** On create, `applyArtFilters(art, [aura.filter])` sets `sprite.filters` or `mesh.filters`. On destroy, `applyArtFilters(art, null)` clears them.

**Scene graph rule:** The filter runs on the art display object inside `EffectMount` children. No perspective projection or edge geometry is required for ghost.

---

## File Layout

Minimal tree to recreate the ghost aura:

```
src/
  ui/effects/
    types.ts
    registry.ts
    runtime.ts
    context.ts
    dieTuning.ts          # padding constants for EffectMount
    effectHelpers.ts      # applyArtFilters, makeRuntime, noopDestroy only
    EffectMount.tsx
    definitions/
      ghost.ts
    filters/
      ghostAuraFilter.ts
    shared/
      pseudoRandom.ts     # burstTimer only
```

No `assets/effects/` files required for ghost.

---

## Integration Checklist

1. Copy all source files from sections below (or from repo paths cited).
2. Add `'ghost'` to your `EFFECT_IDS` array.
3. Register `ghostEffect` in `EFFECT_DEFINITIONS`.
4. Wrap card/die art in `<EffectMount effect={auraId} …>`.
5. Provide `effectArtRef` whose `applyFilters` sets filters on the art sprite/mesh.
6. Provide `effectFrameRef`; ghost only needs `frame.dt` updated each tick (EffectMount sets this automatically).
7. (Cards) Use `pendingArtFiltersRef` pattern so filters apply when mesh/sprite mounts after runtime create.
8. **No texture preload required** for ghost-only hosts (optional if sharing components with other auras).

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
import { ghostEffect } from '@/ui/effects/definitions/ghost';
// import other effects as needed
import type { EffectDefinition, EffectId } from '@/ui/effects/types';

export const EFFECT_DEFINITIONS: EffectDefinition[] = [
  ghostEffect,
  // holyEffect, fireEffect, arcaneEffect, …
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

Ghost does not read `surfaceCorners`, `hovered`, `hideHalo`, or other frame fields — only `frame.dt` drives animation. Hosts may still populate them for other auras or future ghost enhancements.

---

## Source: Die Tuning (EffectMount only)

`src/ui/effects/dieTuning.ts` — ghost ignores mount context, but `EffectMount` imports padding constants:

```ts
export const DIE_EFFECT_PADDING = 12;
export const CARD_EFFECT_PADDING = 18;
```

(Full `dieTuning.ts` in the repo also exports radius/blur helpers used by holy/fire/arcane; not required for ghost.)

---

## Source: Effect Helpers (minimal)

Ghost uses three functions from `src/ui/effects/effectHelpers.ts`. For a ghost-only port, this trimmed file is sufficient:

```ts
import type { Filter } from 'pixi.js';

import type {
  EffectArtTarget,
  EffectDefinition,
  EffectFrameContext,
  EffectRuntime,
} from '@/ui/effects/types';

export function makeRuntime(
  id: EffectDefinition['id'],
  step: (frame: EffectFrameContext) => void,
  destroy: () => void,
): EffectRuntime {
  return { id, step, destroy };
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

## Source: Pseudo-Random Burst

`src/ui/effects/shared/pseudoRandom.ts`

```ts
/** Deterministic-ish burst timer from wall-clock time and seed. */
export function burstTimer(time: number, seed: number, interval: number, window = 0.12): number {
  const phase = (time * (0.7 + seed * 0.11) + seed * 1.7) % interval;
  return phase < window ? 1 - phase / window : 0;
}

export function hashSeed(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}
```

Ghost uses `burstTimer` only (`hashSeed` is unused by ghost but lives in the same module).

---

## Source: Ghost Aura Filter (GLSL)

`src/ui/effects/filters/ghostAuraFilter.ts`

```ts
import { Filter, GlProgram, UniformGroup } from 'pixi.js';

/** Spectral green tint — rgb(0, 255, 208) ≈ #00ffd0 */
const GHOST_TINT_COLOR = new Float32Array([0 / 255, 255 / 255, 208 / 255, 1]);

const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
    vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
    position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
    return vec4(position, 0.0, 1.0);
}

void main(void) {
    gl_Position = filterVertexPosition();
    vTextureCoord = aPosition * (uOutputFrame.zw * uInputSize.zw);
}
`;

const fragment = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uInvertAmount;
uniform float uTintAmount;
uniform float uSaturation;
uniform float uBrightness;
uniform float uPulse;
uniform vec4 uTintColor;

void main(void) {
    vec4 src = texture(uTexture, vTextureCoord);
    vec3 rgb = mix(src.rgb, vec3(1.0) - src.rgb, uInvertAmount);

    float luma = dot(rgb, vec3(0.299, 0.587, 0.114));
    vec3 gray = vec3(luma);
    vec3 saturated = mix(gray, rgb, uSaturation);
    vec3 tinted = mix(saturated, saturated * uTintColor.rgb * 1.15, uTintAmount);
    tinted += uTintColor.rgb * 0.06 * uTintAmount;
    float breathe = 1.0 + uPulse * 0.08;
    vec3 outRgb = tinted * uBrightness * breathe;

    float alpha = src.a;
    finalColor = vec4(outRgb * alpha, alpha);
}
`;

export type GhostAuraUniforms = {
  invertAmount: number;
  tintAmount: number;
  saturation: number;
  brightness: number;
  pulse: number;
};

export type GhostAuraFilter = {
  filter: Filter;
  setUniforms: (values: GhostAuraUniforms) => void;
};

export function createGhostAuraFilter(): GhostAuraFilter {
  const ghostUniforms = new UniformGroup({
    uInvertAmount: { value: 1.0, type: 'f32' },
    uTintAmount: { value: 0.72, type: 'f32' },
    uSaturation: { value: 0.35, type: 'f32' },
    uBrightness: { value: 1.02, type: 'f32' },
    uPulse: { value: 0.0, type: 'f32' },
    uTintColor: { value: GHOST_TINT_COLOR, type: 'vec4<f32>' },
  });

  const filter = new Filter({
    glProgram: GlProgram.from({ vertex, fragment }),
    padding: 2,
    resources: { ghostUniforms },
  });

  return {
    filter,
    setUniforms(values) {
      const u = ghostUniforms.uniforms;
      u.uInvertAmount = values.invertAmount;
      u.uTintAmount = values.tintAmount;
      u.uSaturation = values.saturation;
      u.uBrightness = values.brightness;
      u.uPulse = values.pulse;
      ghostUniforms.update();
    },
  };
}
```

### Fragment pipeline (in order)

| Step | Uniform / logic | Default | Effect |
|------|-----------------|---------|--------|
| 1 | `uInvertAmount` | `1.0` | Full color invert: `rgb → 1 - rgb` |
| 2 | `uSaturation` | `0.35` | Luma mix — strong desaturation |
| 3 | `uTintAmount` | `0.72` | Multiply by `uTintColor * 1.15` + additive `tint * 0.06` |
| 4 | `uPulse` | animated | Breathe scale: `1.0 + pulse * 0.08` on RGB |
| 5 | `uBrightness` | `1.02` + burst | Base brightness; spikes during burst windows |
| 6 | Alpha | from source | Premultiplied output: `outRgb * alpha` |

---

## Source: Ghost Effect Definition

`src/ui/effects/definitions/ghost.ts`

```ts
import { applyArtFilters, makeRuntime, noopDestroy } from '@/ui/effects/effectHelpers';
import { createGhostAuraFilter } from '@/ui/effects/filters/ghostAuraFilter';
import { burstTimer } from '@/ui/effects/shared/pseudoRandom';
import type { EffectDefinition, EffectFrameContext } from '@/ui/effects/types';

export const ghostEffect: EffectDefinition = {
  id: 'ghost',
  label: 'Ghost',
  create(_layers, _mount, art) {
    const aura = createGhostAuraFilter();
    applyArtFilters(art, [aura.filter]);

    let elapsed = 0;
    const timeOffset = Math.random() * 137.0;

    const step = (frame: EffectFrameContext) => {
      elapsed = (elapsed + frame.dt) % 240;
      const t = (elapsed + timeOffset) % 240;
      const burst = burstTimer(t, 1.2, 0.9, 0.1);
      const pulse = (Math.sin(t * 1.35) + 1) * 0.5;

      aura.setUniforms({
        invertAmount: 1.0,
        tintAmount: 0.72,
        saturation: 0.35,
        brightness: 1.02 + burst * 0.06,
        pulse,
      });
    };

    return makeRuntime(
      'ghost',
      step,
      noopDestroy(() => applyArtFilters(art, null)),
    );
  },
};
```

---

## Host Wiring: Card

Ghost attaches to the card art mesh (tilted) or flat shop sprite. Key pieces from `src/ui/components/Card/Card.tsx`:

### Imports and refs

```tsx
import { use } from 'react';
import { Filter } from 'pixi.js';
import { EffectMount } from '@/ui/effects/EffectMount';
import { createDefaultEffectFrame } from '@/ui/effects/context';
import type { EffectArtRef, EffectFrameContext, EffectId } from '@/ui/effects/types';
import { effectsTexturesReady } from '@/loaders/effects/textures'; // shared host; ghost needs no textures

// Inside Card component:
use(effectsTexturesReady); // omit if ghost-only host

const pendingArtFiltersRef = useRef<Filter[] | null>(null);
const effectFrameRef = useRef<EffectFrameContext>(createDefaultEffectFrame('card', width, height, phase));

const applyArtFilters = useCallback((filters: Filter[] | null) => {
  pendingArtFiltersRef.current = filters;
  const target = flatSpriteRef.current ?? meshRef.current;
  if (target) {
    target.filters = filters;
  }
}, []);

const bindFlatSprite = useCallback((node: Sprite | null) => {
  flatSpriteRef.current = node;
  if (node && pendingArtFiltersRef.current) {
    node.filters = pendingArtFiltersRef.current;
  }
}, []);

const effectArtRef = useRef<EffectArtRef>({ applyFilters: () => {} });
effectArtRef.current.applyFilters = applyArtFilters;

// bindMesh similarly applies pendingArtFiltersRef when PerspectiveMesh mounts
```

### EffectMount JSX

```tsx
<EffectMount
  effect={effect}
  hostKind="card"
  width={width}
  height={height}
  hideHalo={displayMode === 'shop'}
  frameRef={effectFrameRef}
  artRef={effectArtRef}
>
  <pixiContainer ref={idleRef} eventMode="none">
    {texture ? (
      useFlatArt ? (
        <pixiSprite ref={bindFlatSprite} texture={texture} … />
      ) : (
        <pixiPerspectiveMesh ref={bindMesh} texture={texture} … />
      )
    ) : null}
  </pixiContainer>
</EffectMount>
```

### Card props

```tsx
export type CardProps = {
  // …
  effect?: EffectId; // default 'none'
};
```

Card tick updates many `effectFrameRef` fields for other auras; ghost ignores them. `frame.dt` is also set by `EffectMount.useTick` (ghost uses that value).

---

## Host Wiring: Die

From `src/ui/components/Dice/Die.tsx`:

```tsx
const effectFrameRef = useRef<EffectFrameContext>(createDefaultEffectFrame('die', size, size, phase));
const effectArtRef = useRef<EffectArtRef>({
  applyFilters(filters) {
    const sprite = spriteRef.current;
    if (sprite) {
      sprite.filters = filters;
    }
  },
});

// useTick — ghost only needs dt (also set by EffectMount)
const frame = effectFrameRef.current;
frame.dt = dt;
frame.time = performance.now() / 1000;
frame.width = size;
frame.height = size;
frame.hostKind = 'die';
frame.phase = phase;

// JSX
<EffectMount
  effect={effect}
  hostKind="die"
  width={size}
  height={size}
  frameRef={effectFrameRef}
  artRef={effectArtRef}
>
  <pixiContainer ref={rollRef} eventMode="none">
    <pixiSprite ref={spriteRef} texture={faceTexture} anchor={0.5} width={size} height={size} />
  </pixiContainer>
</EffectMount>
```

Die sprite is always axis-aligned; no `pendingArtFiltersRef` needed because the sprite ref is stable at runtime attach time in practice.

---

## Aura ID Mapping (UI)

Game data stores aura ids on items; UI maps them to Pixi `EffectId`:

`src/ui/components/CardBar/auraEffectId.ts`

```ts
import { EFFECT_IDS, type EffectId } from '@/ui/effects/types';

/**
 * Map stored aura ids to Pixi effect ids.
 * Game data still uses `icy`; the visual layer renamed that aura to `arcane`.
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

Usage in card rows / shop:

```tsx
effect={auraIdToEffectId(item.def.aura?.id)}
```

Ghost maps 1:1: game aura id `'ghost'` → effect id `'ghost'`.

---

## Tuning Reference

### Runtime uniforms (set every frame in `ghost.ts`)

| Parameter | Value | Notes |
|-----------|-------|-------|
| `invertAmount` | `1.0` | Full negative/inverted look |
| `tintAmount` | `0.72` | Spectral green mix strength |
| `saturation` | `0.35` | Low saturation (ghostly) |
| `brightness` | `1.02 + burst * 0.06` | Base 1.02; burst adds up to +0.06 |
| `pulse` | `(sin(t * 1.35) + 1) * 0.5` | 0–1 breathe driver |

### Time / animation

| Constant | Value | Purpose |
|----------|-------|---------|
| `timeOffset` | `random * 137.0` per instance | Desynchronizes cards/dice |
| `elapsed` wrap | `% 240` | Keeps internal clock bounded |
| `burstTimer` seed | `1.2` | Per-instance burst phase seed |
| `burstTimer` interval | `0.9` | Seconds between burst windows |
| `burstTimer` window | `0.10` | Burst fade length (10% of interval) |
| Pulse frequency | `t * 1.35` | Sine breathe rate |

### Filter defaults (shader init — overridden each frame)

| Uniform | Initial |
|---------|---------|
| `uInvertAmount` | `1.0` |
| `uTintAmount` | `0.72` |
| `uSaturation` | `0.35` |
| `uBrightness` | `1.02` |
| `uPulse` | `0.0` |
| `uTintColor` | `(0, 1, 208/255, 1)` |
| Filter `padding` | `2` |

### Phaser-era color reference (not used in Pixi shader)

Legacy palette from `src_phaser/phaser/ui/AuraFX.ts`:

```ts
ghost: {
  primary: 0x44dd88,
  secondary: 0x88ffbb,
  glow: 0x33cc77,
  tints: [0x33cc77, 0x44dd88, 0x66eebb, 0x88ffbb, 0xaaffdd],
},
```

The Pixi shader tint is slightly more cyan (`#00ffd0`) than these greens.

---

## Per-Frame Render Pipeline

```
1. EffectMount.useTick: frame.dt = deltaMS / 1000
2. ghost runtime.step(frame):
     a. elapsed = (elapsed + dt) % 240
     b. t = (elapsed + timeOffset) % 240
     c. burst = burstTimer(t, 1.2, 0.9, 0.1)
     d. pulse = (sin(t * 1.35) + 1) * 0.5
     e. aura.setUniforms({ … })
3. Pixi filter pass on art sprite/mesh (single full-screen quad per art object)
```

No back/front layer drawing. No particle updates. No `Graphics.clear()`.

### Layer stack

| Container | Used by ghost? |
|-----------|----------------|
| `layers.back` (zIndex 0) | No |
| Art child (zIndex 1) | Yes — filter target |
| `layers.front` (zIndex 3) | No |

---

## Card vs Die Differences

| Feature | Card | Die |
|---------|------|-----|
| Art object | `PerspectiveMesh` or flat `Sprite` (shop) | `Sprite` (dice face) |
| Filter target | mesh or sprite via `pendingArtFiltersRef` | sprite via `effectArtRef` |
| `surfaceCorners` | Updated from mesh tilt (unused by ghost) | Static axis-aligned (unused by ghost) |
| `hideHalo` | Passed (unused by ghost) | Not passed |
| Visual result | Same shader — inverted desaturated cyan tint | Same |

Ghost behavior is **identical** on cards and dice; host differences only affect filter attachment plumbing.

---

## Game Data Wiring (optional)

In Wagon Bones, `'ghost'` is an **equipment/consumable aura** with special inventory rules, not a dice aura.

| Layer | Location | Notes |
|-------|----------|-------|
| Item metadata | `src/data/item_auras.ts` | `{ id: 'ghost', description: "Doesn't take up space…", equipmentChance: 0.003 }` |
| Roll order | `EQUIPMENT_AURA_ORDER` | `['holy', 'fire', 'icy', 'ghost']` — sequential first-match |
| Permit scaling | `src/game/auraRng.ts` | `UNSCALED_AURA_IDS = ['ghost']` — ghost chance ignores aura permit multiplier |
| Dice auras | `src/data/dice_auras.ts` | Ghost is **not** in `DICE_AURA_ORDER` |
| Inventory slots | `runSelectors.ts`, shop actions | Items with `aura.id === 'ghost'` do not count toward slot limits |
| UI prop | `Card` / shop cards | `effect={auraIdToEffectId(def.aura?.id)}` |

`src/data/item_auras.ts` ghost entry:

```ts
{
  id: 'ghost',
  name: 'Ghost',
  description: "Doesn't take up space in your inventory",
  costIncrease: 5,
  equipmentChance: 0.003,
},
```

### Effect picker (dev UI)

`src/ui/effects/effectOptions.ts`

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

Built-in dev stories:

- `src/ui/stories/Card.story.tsx` — effect dropdown includes `ghost`
- `src/ui/stories/Die.story.tsx` — effect dropdown includes `ghost`

```tsx
// Minimal inline test (no texture preload needed for ghost-only)
<Card texture={someTexture} effect="ghost" />
<Die diceType="d6" value={4} effect="ghost" />
```

Expected: artwork appears inverted, desaturated, with a green-cyan cast and subtle pulsing brightness. Multiple instances should pulse out of phase (`timeOffset`).

---

## CSP / Strict Mode

Ghost uses `GlProgram.from()` with inline GLSL strings. Under a strict Content-Security-Policy that blocks `unsafe-eval`, custom filter compilation may fail. Pixi documents importing `pixi.js/unsafe-eval` as a side-effect import to use pre-bundled programs instead of runtime compilation.

Wagon Bones does not currently import `unsafe-eval`; ghost works in the project's default Vite dev/build setup.

---

*Generated from Wagon Bones Pixi codebase. Canonical source paths: `src/ui/effects/definitions/ghost.ts`, `src/ui/effects/filters/ghostAuraFilter.ts`, and dependencies listed above.*
