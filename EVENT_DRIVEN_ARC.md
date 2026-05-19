# Event-Driven Architecture Analysis

An honest assessment of whether Wagon Bones should adopt event-driven architecture, what it would take, and what alternatives might serve us better.

---

## 1. Current State: Where the Pain Is

### The Coupling Graph

```
GameState.calculateScore()
  ├── DiceSystem.scoreHand()         (400+ lines, per-die scoring + equipment triggers)
  │     ├── EquipmentEffects.*       (retriggers, lucky triggers, diamond destroyed)
  │     └── PlayerState.*            (economy, dice collection mutations)
  ├── EquipmentEffects.processHeldInHand()
  ├── EquipmentEffects.applyEquipmentEffects()  (50+ case switch)
  │     └── PlayerState.*            (economy, getPlayerState())
  ├── EquipmentEffects.processEquipmentAfterHandScored()
  └── PlayerState.*                  (recordHandPlayed, consumables)
```

```
PlayerState
  ├── imports from EquipmentEffects  (processEquipmentOnSell, processEquipmentOnShopReroll, etc.)
  ├── imports from DiceSystem        (createPouch)
  └── imports from PermitsSystem

DiceSystem
  ├── imports from EquipmentEffects  (getScoredRetriggerCount, processEquipmentOnLuckyTrigger)
  └── imports from PlayerState       (getPlayerState - mutates during scoring!)

EquipmentEffects
  └── imports from PlayerState       (getPlayerState)
```

### Specific Pain Points

| Problem | Where | Impact |
|---------|-------|--------|
| God method | `GameState.calculateScore()` ~150 lines | Every scoring change touches this method |
| Monolith function | `DiceSystem.scoreHand()` ~400 lines | Per-die scoring, enhancements, auras, stickers, and equipment triggers all interleaved |
| Giant switch | `EquipmentEffects.applyEquipmentEffects()` 50+ cases | Every new item adds a case; file is 900+ lines |
| Circular knowledge | DiceSystem knows about equipment retriggers; EquipmentEffects knows about player economy | Can't understand one system without understanding all of them |
| Mutation during iteration | `scoreHand()` mutates player.dice, player.economy during the scoring loop | Side effects hidden deep in scoring logic |
| Underutilized EventBus | Only emits `SCENE_READY` and phase changes | Game logic doesn't benefit from the event system at all |

### What's Actually Working Well

- **ScoreAnimEvent[]** — Already event-driven! Game logic emits animation events, Phaser plays them back. This pattern works beautifully.
- **Test suite** — Comprehensive coverage of scoring/equipment behavior. Any refactoring approach can lean on this heavily.
- **Game/Phaser separation** — `src/game/` has no Phaser imports. The architectural boundary is clean.

---

## 2. Event-Driven Architecture Proposal

### Core Idea

Replace procedural orchestration with an event pipeline. Each system subscribes to events it cares about. Scoring becomes a sequence of events flowing through handlers rather than one function calling everything.

### Event Taxonomy

```typescript
// ─── Scoring Pipeline Events ───
'score:hand-detected'        // Hand type identified, base miles/mult set
'score:die-scoring'          // Individual die about to contribute (per-die loop)
'score:die-scored'           // Die contributed its value (triggers equipment per-die effects)
'score:enhancement-applied'  // Die enhancement effect resolved
'score:aura-applied'         // Die aura effect resolved
'score:sticker-applied'      // Die sticker triggered
'score:held-die-processed'   // Held die contributing (steel, held equipment)
'score:equipment-applied'    // Independent equipment effect resolved
'score:xmult-applied'       // xMult pass effect applied
'score:finalized'            // Final score calculated

// ─── Lifecycle Events ───
'round:started'              // Round begins (config modifiers, round-start equipment)
'round:day-ended'            // Day ended, advance or win/lose
'round:won'                  // Target reached
'round:lost'                 // Out of days

// ─── Action Events ───
'dice:rolled'                // Dice values determined
'dice:rerolled'              // Subset rerolled
'dice:spent'                 // Scored dice moved to spent pool
'dice:added'                 // New die added to collection

// ─── Economy Events ───
'economy:earned'             // Money gained (from any source)
'economy:spent'              // Money spent

// ─── Equipment Lifecycle ───
'equipment:acquired'         // Item bought/created
'equipment:sold'             // Item sold
'equipment:destroyed'        // Item destroyed by effect
'equipment:triggered'        // Item activated (for anim events)
```

### How Equipment Would Work

Instead of a switch statement, each equipment effect type registers handlers:

```typescript
// Before (current): One giant switch in EquipmentEffects.ts
case 'HAND_MULT':
  if (handTypeMatches(context.handResult.type, p.handType)) {
    bonusMult += p.value;
    animEvents.push({ ... });
  }
  break;

// After: Registered handler
registerEffect('HAND_MULT', {
  phase: 'equipment-pass',
  handle(ctx: ScoringContext, equip: EquipmentInstance, index: number) {
    const p = equip.def.effectParams;
    if (handTypeMatches(ctx.handResult.type, p.handType)) {
      ctx.bonusMult += p.value;
      ctx.animEvents.push({ target: { kind: 'equip', equipIndex: index }, popupType: 'mult', value: p.value });
    }
  }
});
```

### Scoring Pipeline as Event Stream

```typescript
// The scoring "pipeline" would look like:
function calculateScore(selectedDice: Die[], rolledDice: Die[], equipment: EquipmentInstance[]) {
  const ctx = createScoringContext(selectedDice, rolledDice, equipment);
  
  // Each emit lets all registered handlers modify ctx
  bus.emit('score:hand-detected', ctx);
  
  for (const die of ctx.scoringDice) {
    for (let t = 0; t < die.triggers; t++) {
      bus.emit('score:die-scoring', ctx, die, t);
      bus.emit('score:die-scored', ctx, die, t);
    }
  }
  
  for (const die of ctx.heldDice) {
    bus.emit('score:held-die-processed', ctx, die);
  }
  
  bus.emit('score:equipment-pass', ctx);
  bus.emit('score:xmult-pass', ctx);
  bus.emit('score:finalized', ctx);
  
  return ctx.toResult();
}
```

---

## 3. Pros & Cons

### Pros

| Benefit | Details |
|---------|---------|
| **Decoupling** | DiceSystem no longer needs to know about equipment. Equipment handlers subscribe to dice events. |
| **Extensibility** | New items = new handler file. No touching the scoring function or a 50-case switch. |
| **Natural animation** | ScoreAnimEvents are already events — the pipeline would generate them as a natural byproduct of handler execution. |
| **Testability** | Test individual handlers in isolation. Mock the bus, emit one event, assert the response. |
| **Order is explicit** | Priority/ordering becomes a first-class concept instead of implicit code position in a function. |
| **Mod-friendly** | If you ever want modding support, event buses are the standard approach. |

### Cons

| Drawback | Details |
|----------|---------|
| **Debugging is harder** | Stack traces show "event emitted" → "handler called" instead of a linear call chain. Harder to trace why a score is wrong. |
| **Order-of-operations is critical** | Scoring IS sequential. Additive mult before xMult. Equipment left-to-right. Events must be carefully ordered, and this ordering is now implicit in subscription priority rather than explicit in code flow. |
| **Event storms** | With 50+ items × retriggered dice, a single score calculation could emit hundreds of events. Performance concern for a game loop. |
| **Overhead for sequential logic** | Event-driven shines for loose coupling. But scoring is inherently a pipeline — each step depends on the accumulated state of previous steps. Events add indirection to what is fundamentally sequential. |
| **Test migration cost** | 500+ tests validate the current procedural flow. They'd all still pass (behavior unchanged), but new tests would use a different pattern. Mixed testing styles during migration. |
| **Discoverability** | "Where does xMult get applied?" — grep for the handler vs. read the function. The function is actually easier for newcomers. |
| **Singular bus bottleneck** | If everything goes through one bus, the bus becomes a god object. You've traded a god function for a god bus. |

### The Core Tension

The scoring system is fundamentally **a pipeline with accumulator state** (miles, mult, xMult flow through stages). Event-driven architecture excels at **fan-out** (one event, many independent reactions). Scoring is more pipeline than fan-out — each handler mutates shared state that later handlers depend on.

---

## 4. Migration Strategy (If We Proceed)

### Principles
- Every phase keeps existing tests green
- Never rewrite — always refactor incrementally
- The test suite is the safety net

### Phase 1: Decompose the Monoliths (No Events Yet)

Break `scoreHand()` into focused passes:

```
scoreHand()
  → calculateBaseScore(dice)           // die values + bonus miles
  → applyEnhancements(dice, ctx)       // bone/wooden/diamond/lucky/stone
  → applyAuras(dice, ctx)              // fire/icy/holy
  → applyStickers(dice, ctx)           // purple_flower/golden_dollar/blue_moon
  → applyPerDieEquipment(dice, equip, ctx)  // PIP_MULT, PARITY_MULT, etc.
```

**Effort**: Medium. Mechanical extraction. Tests stay green.
**Benefit**: Each pass is testable in isolation. Clear separation of concerns.

### Phase 2: Registry Pattern for Equipment

Replace the switch with a handler map:

```typescript
const effectHandlers = new Map<string, EffectHandler>();

// Register all handlers
effectHandlers.set('HAND_MULT', handMultHandler);
effectHandlers.set('ADD_MULT', addMultHandler);
// ...

// In applyEquipmentEffects:
for (const equip of equipment) {
  const handler = effectHandlers.get(equip.def.effectType);
  if (handler) handler(ctx, equip, index);
}
```

**Effort**: Medium. Each case becomes a function. File-per-effect or grouped by category.
**Benefit**: Eliminates the monolithic switch. New items don't touch the orchestrator.

### Phase 3: Introduce Scoring Context Events

Add events for cross-system communication only:

```typescript
// Equipment that needs to react to dice being scored
bus.on('score:die-scored', (ctx, die) => { /* Lucky Penny, Bone Charm, etc. */ });

// Equipment that reacts to rerolls
bus.on('dice:rerolled', (ctx, count) => { /* Shop Reroll Mult Gain, etc. */ });
```

**Effort**: High. Requires careful ordering semantics.
**Benefit**: DiceSystem no longer imports from EquipmentEffects.

### Phase 4: Unify with Global EventBus

Merge the scoring pipeline events and the existing scene EventBus into one system with proper namespacing:

```typescript
bus.on('score:die-scored', handler, { priority: 10 });  // ordering via priority
```

**Effort**: Low (mostly wiring).
**Benefit**: Single event system for everything. Phaser layer can subscribe to scoring events directly for animations.

### Estimated Total Effort

| Phase | Scope | Risk |
|-------|-------|------|
| Phase 1 | 2-3 sessions | Low — mechanical extraction |
| Phase 2 | 2-3 sessions | Low — pattern replacement |
| Phase 3 | 4-6 sessions | Medium — ordering semantics |
| Phase 4 | 1-2 sessions | Low — wiring |

---

## 5. Alternative & Complementary Patterns

### A. Scoring Pipeline (Middleware Pattern)

**Concept**: Each scoring "phase" is a composable function that transforms a context object. Like Express middleware or Redux reducers.

```typescript
type ScoringMiddleware = (ctx: ScoringContext, next: () => void) => void;

const pipeline: ScoringMiddleware[] = [
  baseScoring,
  enhancementPass,
  auraPass,
  stickerPass,
  perDieEquipmentPass,
  heldInHandPass,
  independentEquipmentPass,
  xMultPass,
];

function runPipeline(ctx: ScoringContext) {
  let i = 0;
  const next = () => { if (i < pipeline.length) pipeline[i++](ctx, next); };
  next();
  return ctx.toResult();
}
```

**Pros**: Explicit ordering. Each middleware is testable. No event subscription complexity.
**Cons**: Still somewhat coupled (middleware knows about context shape). Less dynamic than events.
**Best for**: The scoring calculation specifically, where order matters.

### B. Hook/Plugin System

**Concept**: Equipment registers lifecycle hooks. The game calls hooks at specific points. Like React useEffect or WordPress actions.

```typescript
interface EquipmentHooks {
  onDieScored?: (ctx: ScoringContext, die: Die) => void;
  onHandPlayed?: (handType: HandType, dice: Die[]) => void;
  onReroll?: (diceIds: string[]) => void;
  onDayEnd?: () => void;
  onRoundStart?: () => void;
  onSell?: () => void;
}

// Each item defines its hooks
const HAND_MULT_HOOKS: EquipmentHooks = {
  onEquipmentPass(ctx, equip) {
    if (handTypeMatches(ctx.handResult.type, equip.def.effectParams.handType)) {
      ctx.bonusMult += equip.def.effectParams.value;
    }
  }
};
```

**Pros**: Discoverable ("what hooks does this item use?"). Typed. Explicit lifecycle moments.
**Cons**: Fixed hook points — adding a new hook type requires touching the orchestrator.
**Best for**: Equipment effects specifically.

### C. Registry + Better Module Boundaries (No Architectural Overhaul)

**Concept**: Keep the procedural flow but:
1. Replace switches with registries (Map<EffectType, Handler>)
2. Split `scoreHand()` into focused functions
3. Move per-die equipment triggers out of DiceSystem into EquipmentEffects
4. Stop mutating PlayerState during scoring — collect mutations, apply at end

```typescript
// Instead of mutating player.economy.earn(20) inside scoreHand:
interface ScoringMutations {
  moneyEarned: number;
  diceDestroyed: string[];
  diceEnhanced: { id: string; enhancement: DiceEnhancement }[];
  consumablesGranted: ConsumableDef[];
}

// Apply all mutations after scoring completes
function applyMutations(player: PlayerState, mutations: ScoringMutations) { ... }
```

**Pros**: Simplest change. Biggest immediate readability win. No new abstractions. Tests barely change.
**Cons**: Doesn't fundamentally change the coupling between systems. Still procedural.
**Best for**: Getting 80% of the benefit with 20% of the effort.

### D. Entity-Component-System (ECS)

**Concept**: Dice, equipment, and effects become entities with components. Systems iterate over entities with matching components.

```typescript
// Components
interface DieComponent { value: number; enhancement: DiceEnhancement; }
interface ScoringComponent { miles: number; mult: number; xMult: number; }
interface EquipmentComponent { effectType: string; params: Record<string, unknown>; }

// Systems run in order
const scoringPipeline = [
  baseScoringSystem,      // adds miles from die values
  enhancementSystem,      // applies enhancement bonuses
  perDieEquipmentSystem,  // equipment triggers per die
  globalEquipmentSystem,  // independent equipment effects
  xMultSystem,            // multiplicative pass
];
```

**Pros**: Maximum decoupling. Natural for game development. Highly composable.
**Cons**: Massive overhaul. Overkill for a game with <100 entities. Different mental model from current code. Tests would need substantial rewriting.
**Best for**: If the game were scaling to thousands of interacting entities. Not warranted here.

---

## 6. Recommendation

### The Pragmatic Path: Registry + Pipeline Decomposition

Full event-driven architecture is overkill for this game's needs. The scoring system is fundamentally sequential and order-dependent — events add indirection without solving the real problems.

**What to actually do (in order of impact/effort ratio):**

#### Step 1: Registry Pattern for Equipment Effects
Replace the 50+ case switch with a `Map<EffectType, Handler>`. Each handler is a focused function. Group related handlers in files by category (matches test file organization).

```
src/game/effects/
  addMult.ts          // ADD_MULT, ADD_MULT_RISKY
  handMult.ts         // HAND_MULT, HAND_MILES
  xMult.ts            // all xMult variants
  perDie.ts           // PIP_MULT, PARITY_MULT, GOLD_DICE_MONEY
  stateful.ts         // STATEFUL_ADD_MULT, DECAYING_MULT
  registry.ts         // the Map + registration
```

**Impact**: Eliminates the monolithic switch. New items = new handler function. No touching the orchestrator.

#### Step 2: Decompose scoreHand()
Split into focused passes. Keep procedural, just smaller functions with single responsibilities.

**Impact**: Each pass is independently readable and testable. Clear "where does bone enhancement get applied?" answers.

#### Step 3: Collect Mutations, Apply Later
Stop mutating PlayerState deep inside scoring loops. Return mutation objects. Apply at the end.

**Impact**: Scoring becomes pure-ish (given inputs, deterministic outputs aside from RNG). Easier to test, reason about, and eventually parallelize the animation playback.

#### Step 4 (Optional): Event-Driven for Cross-System Communication
Use the EventBus for things that naturally fan out: `dice:added` (multiple systems might care), `equipment:sold` (economy + shop + achievements). Keep scoring procedural.

**Impact**: Breaks the circular imports between PlayerState ↔ EquipmentEffects. Systems communicate through events for lifecycle stuff, but scoring stays a pipeline.

### Why Not Full Event-Driven?

1. **Scoring order matters** — Additive before multiplicative. Left-to-right equipment. Per-die triggers before independent effects. This is naturally expressed as sequential code, not event subscriptions with priority numbers.
2. **Debugging** — When a score is wrong, you want to step through a function, not chase event subscriptions across 20 files.
3. **The test suite validates procedural flow** — 500+ tests that call `calculateTestScore()` and check results. These work perfectly with a pipeline refactoring but become awkward if scoring is event-driven.
4. **The game isn't that big** — 50 equipment types, 9 hand types, ~20 dice. This is "organize the code better" territory, not "fundamental architecture change" territory.

### The Key Insight

The problem isn't "we need event-driven architecture." The problem is:
- **One function does too much** → decompose into passes
- **One switch has too many cases** → registry pattern
- **Side effects are hidden** → collect mutations, apply later
- **Systems know too much about each other** → better interfaces, optional events for lifecycle

These are solved by good modular design, not by changing the execution model.

---

## 7. Quick Reference: Current vs Proposed

| Aspect | Current | After Registry + Pipeline |
|--------|---------|--------------------------|
| Adding a new item | Add case to switch in EquipmentEffects.ts | Add handler function in appropriate effects/ file |
| Understanding scoring flow | Read 400-line scoreHand() + 150-line calculateScore() | Read pipeline of 5-8 focused functions |
| Testing a single effect | Setup full game state, run calculateTestScore() | Can also test handler in isolation with minimal context |
| Side effects | Scattered mutations throughout scoring | Collected in mutations object, applied at boundary |
| Cross-system deps | Direct imports creating circular knowledge | Interfaces + optional events for lifecycle |
| Animation events | Already event-driven (works great!) | Unchanged — still generated as side-effect of handlers |

---

## 8. Next Steps

If we decide to proceed:

1. **Start with the registry** — it's the highest impact, lowest risk change. Pick one category (e.g. all xMult effects) and extract them to handlers behind a registry. Verify tests pass.
2. **Decompose scoreHand()** — extract enhancement/aura/sticker passes into standalone functions. Verify tests pass.
3. **Move per-die equipment triggers** — extract from DiceSystem.scoreHand() into EquipmentEffects, removing the DiceSystem → EquipmentEffects import.
4. **Introduce mutation collection** — for economy/dice changes during scoring. Apply after scoring completes.
5. **Evaluate** — after steps 1-4, reassess whether event-driven adds anything beyond what we now have.

The test suite makes all of this safe. Run `bun test` after every extraction.
