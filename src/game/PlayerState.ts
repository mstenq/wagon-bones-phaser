// ─── PlayerState (No Phaser imports) ───
// Persistent state that carries across scenes (shop, rounds, etc).

import { Die, HandType, HandStats, BossDef, TrailTagDef, TrailTagInstance, TagCategory } from './types';
import { createPouch } from './DiceSystem';
import { Economy } from './Economy';
import { EquipmentDef, EquipmentInstance } from './ItemsSystem';
import { ConsumableDef, ConsumableInstance, createConsumableInstance, getSupplyDefById } from './ConsumablesSystem';
import { processEquipmentOnSell, processEquipmentOnShopReroll, getConfigModifiers, processEquipmentOnDiceAdded } from './EquipmentEffects';
import { forEachEquipmentResolved, resolveEffectParam } from './effects/helpers';
import { GAMEPLAY } from './Constants';
import { PermitDef, applyPermitEffect, getPermitShopRerollDiscount } from './PermitsSystem';
import { TrailEventModifiers, createEmptyModifiers } from './TrailEventsSystem';
import trailGuidesData from '../data/trail_guides.json';
import professionsData from '../data/professions.json';
import bossesData from '../data/bosses.json';
import { BossRoundState, EMPTY_BOSS_ROUND_STATE } from './BossEffectsSystem';
import { getTrailTagById } from '../data/trail_tags';

export interface ProfessionSpecialEquipment {
  name: string;
  effect: string;
}

export interface ProfessionDef {
  id: string;
  title: string;
  name: string;
  description: string;
  modifiers: Record<string, unknown>;
  specialEquipment?: ProfessionSpecialEquipment;
}

export interface PayoutBreakdown {
  roundReward: number; // base reward for completing the round ($3/$4/$5)
  dayBonus: number; // $1 per remaining day
  interest: number; // $1 per $5 held, capped at interestCap
  equipmentMoney: number; // END_ROUND_MONEY items like Payday (not in interest)
  rerollBonus: number; // outlaw: $1 per unused reroll
  total: number;
}

const DEFAULT_STARTING_MONEY = GAMEPLAY.STARTING_MONEY;
const DEFAULT_MAX_EQUIPMENT_SLOTS = GAMEPLAY.MAX_EQUIPMENT_SLOTS;
const DEFAULT_MAX_CONSUMABLE_SLOTS = GAMEPLAY.MAX_CONSUMABLE_SLOTS;
const DEFAULT_SHOP_SLOTS = GAMEPLAY.SHOP_SLOTS;
const DEFAULT_STARTING_DICE = GAMEPLAY.STARTING_DICE;
const SHOP_REROLL_COST = GAMEPLAY.SHOP_REROLL_COST;

export class PlayerState {
  economy: Economy;
  dice: Die[]; // all dice the player owns
  loadedDieTarget: number | null = null; // selected face for loaded enhancement dice
  spentDiceIds: Set<string> = new Set(); // dice used this cycle (persists across days & rounds)
  equipment: EquipmentInstance[];
  maxEquipmentSlots: number;
  consumables: ConsumableInstance[];
  maxConsumableSlots: number;
  lastUsedConsumable: ConsumableDef | null = null; // for "Second Helpings"
  shopSlots: number; // how many items appear in the shop (upgradeable via vouchers)
  leg: number; // current leg of the journey (1-8)
  round: number; // current round within the leg (1-3)
  interestCap: number; // max money counted for interest (default $25, vouchers can raise to $50)
  handStats: Map<HandType, HandStats>; // level & play count per hand type
  profession: ProfessionDef | null = null; // selected profession
  handSize: number = GAMEPLAY.ROLL_SIZE; // dice selected for rolling
  shopRerollCount: number = 0; // number of rerolls this shop visit (resets each visit)
  purchasedPermits: string[] = []; // IDs of purchased permits
  currentLegPermit: PermitDef | null = null; // the permit offered this leg (persists across shop visits)
  permitPurchasedThisLeg: boolean = false; // whether a permit was already bought this leg
  permitDayBonus: number = 0; // extra days per round from permits
  permitRerollBonus: number = 0; // extra rerolls per round from permits
  permitDayPenalty: number = 0; // day penalty from Shortcut Trail
  permitRerollPenalty: number = 0; // reroll penalty from Hidden Pass
  permitScoreReduction: number = 0; // leg-equivalent score reduction from shortcuts
  trailEventModifiers: TrailEventModifiers = createEmptyModifiers(); // penalties/bonuses from trail events, consumed next round
  skipNextShop: boolean = false; // set by trail events (Native Guide)
  trailGuidesUsed: number = 0; // count of trail guides consumed this journey (for Guide Lantern)
  startingDiceCount: number = DEFAULT_STARTING_DICE; // collection size at run start (for Ghost Town)
  bossEffectDisabled: boolean = false; // Sheriff's Badge: disables boss effect for current round when sold
  bossRoundState: BossRoundState = { ...EMPTY_BOSS_ROUND_STATE };
  pendingNewDiceIds: string[] = []; // dice IDs pending animation (Quarry Stone, Mystery Crate, etc.)
  pendingAnimatedDestructions: { sourceIdx: number; victimIdx: number }[] = []; // equipment destructions pending animation (Funeral Pyre, Haunted Totem, etc.)
  pendingJunkDealerCount: number = 0; // number of equipment cards just created by Junk Dealer (for animation)

  // ─── Trail Tags ───
  pendingTags: TrailTagInstance[] = []; // tags waiting to fire (shop, boss, next_round)
  storedAuraTags: TrailTagInstance[] = []; // aura tags banked because no base equipment was in shop
  roundsSkipped: number = 0; // total rounds skipped this run (for Shortcut tag)
  daysScored: number = 0; // total days where scoring occurred (for Well-Traveled)
  unusedRerollsTotal: number = 0; // cumulative unused rerolls at round-end (for Pack Rat)
  twinWagonCount: number = 0; // pending Twin Wagon multipliers
  wideSaddleBonus: number = 0; // temporary +handSize for next round only

  private bossAssignments: BossDef[] = []; // one boss per leg, assigned at game start
  private nextDieId: number = 0; // monotonic counter for unique die IDs

  constructor() {
    this.economy = new Economy(DEFAULT_STARTING_MONEY);
    this.dice = createPouch(DEFAULT_STARTING_DICE);
    this.nextDieId = this.dice.length; // start counter after initial dice
    this.equipment = [];
    this.maxEquipmentSlots = DEFAULT_MAX_EQUIPMENT_SLOTS;
    this.consumables = [];
    this.maxConsumableSlots = DEFAULT_MAX_CONSUMABLE_SLOTS;
    this.shopSlots = DEFAULT_SHOP_SLOTS;
    this.leg = 1;
    this.round = 1;
    this.interestCap = GAMEPLAY.INTEREST_CAP;
    this.handStats = PlayerState.createDefaultHandStats();
    this.assignBosses();
  }

  /** Effective days for the next round (base + permits + profession - trail penalties) */
  get effectiveDays(): number {
    const profMods = this.profession?.modifiers as Record<string, unknown> | undefined;
    const profDays = typeof profMods?.days === 'number' ? profMods.days : 0;
    return GAMEPLAY.MAX_DAYS + this.permitDayBonus - this.permitDayPenalty + profDays - this.trailEventModifiers.dayPenalty;
  }

  /** Effective rerolls for the next round (base + permits + profession - trail penalties) */
  get effectiveRerolls(): number {
    if (this.trailEventModifiers.loseAllRerolls) return 0;
    const profMods = this.profession?.modifiers as Record<string, unknown> | undefined;
    const profRerolls = typeof profMods?.rerolls === 'number' ? profMods.rerolls : 0;
    return GAMEPLAY.MAX_REROLLS + this.permitRerollBonus - this.permitRerollPenalty + profRerolls - this.trailEventModifiers.rerollPenalty;
  }

  /** Snapshot dice count after run setup (profession, etc.) for Ghost Town. */
  finalizeRunSetup(): void {
    this.startingDiceCount = this.dice.length;
  }

  /** Apply profession modifiers after selection */
  applyProfession(professionId: string): void {
    const prof = professionsData.find((p) => p.id === professionId);
    if (!prof) return;
    this.profession = prof as ProfessionDef;
    const m = prof.modifiers as Record<string, unknown>;

    // Starting money bonus
    if (typeof m.startingMoney === 'number') {
      this.economy.earn(m.startingMoney);
    }

    // Equipment slot modifiers
    if (typeof m.equipmentSlots === 'number') {
      this.maxEquipmentSlots += m.equipmentSlots;
    }

    // Hand size modifier
    if (typeof m.handSize === 'number') {
      this.handSize += m.handSize;
    }

    // Consumable slot modifiers
    if (typeof m.supplySlots === 'number') {
      this.maxConsumableSlots += m.supplySlots;
    }

    // Starting supply cards → consumables
    if (Array.isArray(m.startingSupplyCards)) {
      for (const cardId of m.startingSupplyCards as string[]) {
        const def = getSupplyDefById(cardId);
        if (def) this.addConsumable(def);
      }
    }
  }

  /** Create default hand stats: level 1, 0 plays, per-level bonuses from trail guide data */
  private static createDefaultHandStats(): Map<HandType, HandStats> {
    // Build lookup from trail guide JSON
    const tgLookup = new Map<string, { milesPerLevel: number; multPerLevel: number }>();
    for (const tg of trailGuidesData) {
      tgLookup.set(tg.handType, { milesPerLevel: tg.milesPerLevel, multPerLevel: tg.multPerLevel });
    }

    const stats = new Map<HandType, HandStats>();
    for (const type of Object.values(HandType)) {
      const tg = tgLookup.get(type);
      stats.set(type, {
        level: 1,
        timesPlayed: 0,
        milesPerLevel: tg?.milesPerLevel ?? 10,
        multPerLevel: tg?.multPerLevel ?? 1,
      });
    }
    return stats;
  }

  /** Get stats for a hand type (always returns a value) */
  getHandStats(type: HandType): HandStats {
    if (!this.handStats.has(type)) {
      this.handStats.set(type, { level: 1, timesPlayed: 0, milesPerLevel: 10, multPerLevel: 1 });
    }
    return this.handStats.get(type)!;
  }

  /** Record that a hand was played */
  recordHandPlayed(type: HandType): void {
    const stats = this.getHandStats(type);
    stats.timesPlayed++;
  }

  /** Upgrade a hand's level (e.g. from trail guide cards) */
  upgradeHandLevel(type: HandType, amount: number = 1): void {
    const stats = this.getHandStats(type);
    stats.level += amount;
  }

  /** Dice that haven't been spent yet (available for play) */
  get availableDice(): Die[] {
    return this.dice.filter((d) => !this.spentDiceIds.has(d.id));
  }

  /** Dice that have been used and are in the spent pile */
  get spentDice(): Die[] {
    return this.dice.filter((d) => this.spentDiceIds.has(d.id));
  }

  /** Whether every die in the pool has been spent */
  get allDiceSpent(): boolean {
    return this.dice.length > 0 && this.spentDiceIds.size >= this.dice.length;
  }

  /** Mark dice as spent. Returns true if all dice are now spent (triggers auto-refresh). */
  markDiceSpent(ids: string[]): boolean {
    ids.forEach((id) => this.spentDiceIds.add(id));
    if (this.allDiceSpent) {
      this.spentDiceIds.clear();
      return true; // auto-refreshed
    }
    return false;
  }

  /** Cost to refresh spent dice = number of available (non-spent) dice */
  get refreshCost(): number {
    return this.availableDice.length;
  }

  hasBankNote(): boolean {
    return this.equipment.some((e) => e.def.effectType === 'BANK_NOTE');
  }

  get debtLimit(): number {
    if (!this.hasBankNote()) return 0;
    const note = this.equipment.find((e) => e.def.effectType === 'BANK_NOTE');
    return (note?.def.effectParams.maxDebt as number) ?? 20;
  }

  get minBalance(): number {
    return -this.debtLimit;
  }

  canAfford(amount: number): boolean {
    return this.economy.balance - amount >= this.minBalance;
  }

  trySpend(amount: number): boolean {
    if (!this.canAfford(amount)) return false;
    return this.economy.spend(amount, this.minBalance);
  }

  /** Pay to refresh all spent dice back into the available pool. Returns false if can't afford. */
  refreshSpentDice(): boolean {
    const cost = this.refreshCost;
    if (this.spentDiceIds.size === 0) return false; // nothing to refresh
    if (cost > 0 && !this.trySpend(cost)) return false;
    this.spentDiceIds.clear();
    return true;
  }

  setLoadedDieTarget(value: number | null): void {
    if (value === null) {
      this.loadedDieTarget = null;
      return;
    }
    this.loadedDieTarget = Math.max(1, Math.min(12, Math.floor(value)));
  }

  addDie(die: Die): void {
    this.dice.push({ ...die, id: `die_player_${this.nextDieId++}` });
    // New Blood: gains xMult for every new dice added
    processEquipmentOnDiceAdded(this.equipment);
  }

  /** Explorer's Guild: trail guides and trail guide packs are free in the shop */
  get trailGuidesFree(): boolean {
    return this.equipment.some((e) => e.def.effectType === 'EXPLORER_GUILD');
  }

  get shopRerollCost(): number {
    // Coupon Book: free rerolls before paid ones
    const freeRerolls = getConfigModifiers(this.equipment).freeShopRerolls;
    if (this.shopRerollCount < freeRerolls) return 0;
    const discount = getPermitShopRerollDiscount(this.purchasedPermits);
    const paidRerollIndex = this.shopRerollCount - freeRerolls;
    return Math.max(0, SHOP_REROLL_COST + paidRerollIndex - discount);
  }

  canRerollShop(): boolean {
    return this.canAfford(this.shopRerollCost);
  }

  payShopReroll(): boolean {
    if (!this.canRerollShop()) return false;
    this.trySpend(this.shopRerollCost);
    this.shopRerollCount++;
    processEquipmentOnShopReroll(this.equipment);
    return true;
  }

  resetShopRerolls(): void {
    this.shopRerollCount = 0;
  }

  /** Number of equipment slots currently occupied (ghost-aura items don't count) */
  get usedEquipmentSlots(): number {
    return this.equipment.filter((e) => e.def.aura?.id !== 'ghost').length;
  }

  get equipmentSlotsFree(): number {
    return this.maxEquipmentSlots - this.usedEquipmentSlots;
  }

  canBuy(item: EquipmentDef): boolean {
    if (!this.canAfford(item.cost)) return false;
    // Ghost-aura items don't consume a slot
    if (item.aura?.id !== 'ghost' && this.usedEquipmentSlots >= this.maxEquipmentSlots) return false;
    return true;
  }

  buyEquipment(def: EquipmentDef): boolean {
    if (!this.canBuy(def)) return false;
    this.trySpend(def.cost);
    this.equipment.push({
      def,
      sellValue: Math.max(1, Math.floor(def.cost / 2)),
      state: def.initialState ? { ...def.initialState } : {},
    });
    return true;
  }

  sellEquipment(index: number): boolean {
    if (index < 0 || index >= this.equipment.length) return false;
    const item = this.equipment[index];
    this.economy.earn(item.sellValue);

    // Sheriff's Badge: selling disables the current boss effect for this round
    if (item.def.effectType === 'SELL_DISABLE_BOSS' && this.isBossRound) {
      this.bossEffectDisabled = true;
    }

    // Bounty Contract: selling grants a Twin Wagon tag
    if (item.def.effectType === 'SELL_GRANT_TAG') {
      const tagId = (item.def.effectParams.tagId as string) ?? 'tag_twin_wagon';
      const tagDef = getTrailTagById(tagId);
      if (tagDef) {
        this.addTag(tagDef);
      }
    }

    // Bank Note: banker wipes debt when selling this item
    if (item.def.effectType === 'BANK_NOTE' && this.profession?.id === 'banker' && this.economy.balance < 0) {
      this.economy.setBalance(0);
    }

    // Phantom Wagon: if sold after enough rounds, duplicate a random item
    if (item.def.effectType === 'PHANTOM_WAGON') {
      const roundsNeeded = (item.def.effectParams.roundsNeeded as number) ?? 2;
      if ((item.state.roundsHeld ?? 0) >= roundsNeeded) {
        // Find other equipment to duplicate (exclude self)
        const others = this.equipment.filter((_, idx) => idx !== index);
        if (others.length > 0) {
          const source = others[Math.floor(Math.random() * others.length)];
          // Duplicate the item, removing ghost aura if present
          const duplicated: EquipmentInstance = {
            def: source.def.aura?.id === 'ghost'
              ? { ...source.def, aura: undefined }
              : { ...source.def },
            sellValue: source.sellValue,
            state: { ...source.state },
          };
          // Add the duplicate after splicing the phantom wagon
          this.equipment.splice(index, 1);
          if (this.usedEquipmentSlots < this.maxEquipmentSlots || duplicated.def.aura?.id === 'ghost') {
            this.equipment.push(duplicated);
          }
          processEquipmentOnSell(this.equipment);
          return true;
        }
      }
    }

    this.equipment.splice(index, 1);
    // Update stateful equipment on sell (Snake Oil Ledger)
    processEquipmentOnSell(this.equipment);
    return true;
  }

  reorderEquipment(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || fromIndex >= this.equipment.length) return;
    if (toIndex < 0 || toIndex >= this.equipment.length) return;
    const [item] = this.equipment.splice(fromIndex, 1);
    this.equipment.splice(toIndex, 0, item);
  }

  // ─── Consumable Management ───

  /** Number of consumable slots currently occupied (ghost-aura items don't count) */
  get usedConsumableSlots(): number {
    return this.consumables.filter((c) => c.def.aura?.id !== 'ghost').length;
  }

  get consumableSlotsFree(): number {
    return this.maxConsumableSlots - this.usedConsumableSlots;
  }

  canAddConsumable(def: ConsumableDef): boolean {
    if (def.aura?.id === 'ghost') return true;
    return this.usedConsumableSlots < this.maxConsumableSlots;
  }

  addConsumable(def: ConsumableDef): boolean {
    if (!this.canAddConsumable(def)) return false;
    this.consumables.push(createConsumableInstance(def));
    return true;
  }

  sellConsumable(index: number): boolean {
    if (index < 0 || index >= this.consumables.length) return false;
    const item = this.consumables[index];
    this.economy.earn(item.sellValue);
    this.consumables.splice(index, 1);
    // Update stateful equipment on sell (Snake Oil Ledger)
    processEquipmentOnSell(this.equipment);
    return true;
  }

  /** Remove and return a consumable (for using it). Does NOT earn money. */
  useConsumable(index: number): ConsumableInstance | null {
    if (index < 0 || index >= this.consumables.length) return null;
    const [item] = this.consumables.splice(index, 1);
    // Don't overwrite lastUsedConsumable when using second_helpings,
    // since it reads the previous value to duplicate it
    if (item.def.id !== 'second_helpings') {
      this.lastUsedConsumable = item.def;
    }
    return item;
  }

  reorderConsumable(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || fromIndex >= this.consumables.length) return;
    if (toIndex < 0 || toIndex >= this.consumables.length) return;
    const [item] = this.consumables.splice(fromIndex, 1);
    this.consumables.splice(toIndex, 0, item);
  }

  /** Randomly assign one eligible boss per leg (respects minimumLeg, no repeats in legs 1–8) */
  private assignBosses(): void {
    this.bossAssignments = [];
    const allBosses = bossesData as BossDef[];
    const usedInFirstEight = new Set<string>();

    for (let leg = 1; leg <= GAMEPLAY.LEGS; leg++) {
      let eligible = allBosses.filter((b) => (b.minimumLeg ?? 1) <= leg);

      // Legs 1–8: each boss appears at most once; leg 9+ may repeat
      if (leg <= 8) {
        const unused = eligible.filter((b) => !usedInFirstEight.has(b.id));
        if (unused.length > 0) eligible = unused;
        else {
          // Pool exhausted (more than 8 legs with few bosses) — allow repeats
          usedInFirstEight.clear();
        }
      }

      if (eligible.length === 0) {
        this.bossAssignments.push(allBosses[0]);
        continue;
      }
      const pick = eligible[Math.floor(Math.random() * eligible.length)];
      if (leg <= 8) usedInFirstEight.add(pick.id);
      this.bossAssignments.push(pick);
    }
  }

  /** Test helper: force boss for current leg */
  setBossForCurrentLeg(boss: BossDef): void {
    this.bossAssignments[this.leg - 1] = boss;
  }

  /** Get the boss for the current leg (only active on round 3) */
  get currentBoss(): BossDef | null {
    if (this.round !== GAMEPLAY.ROUNDS_PER_LEG) return null;
    return this.bossAssignments[this.leg - 1] ?? null;
  }

  /** Get the boss assigned to a specific leg */
  getBossForLeg(leg: number): BossDef | null {
    return this.bossAssignments[leg - 1] ?? null;
  }

  /** Whether the current round is a boss round */
  get isBossRound(): boolean {
    return this.round === GAMEPLAY.ROUNDS_PER_LEG;
  }

  /** The overall round number (1–24) */
  get totalRound(): number {
    return (this.leg - 1) * GAMEPLAY.ROUNDS_PER_LEG + this.round;
  }

  /** Target miles for the current round (base × round multiplier, reduced by permit shortcuts) */
  get targetMiles(): number {
    // Use a lower leg index if player has score reduction permits
    const effectiveLegIndex = Math.max(0, this.leg - 1 - this.permitScoreReduction);
    const base = GAMEPLAY.TARGET_MILES_BY_LEG[effectiveLegIndex] ?? GAMEPLAY.TARGET_MILES;
    const multiplier = GAMEPLAY.ROUND_MULTIPLIERS[this.round - 1] ?? 1;
    return Math.ceil(base * multiplier);
  }

  /** Calculate the payout breakdown for winning the current round */
  calculatePayout(daysRemaining: number, rerollsRemaining: number = 0): PayoutBreakdown {
    const roundReward = GAMEPLAY.ROUND_REWARDS[this.round - 1] ?? 3;
    const dayBonus = daysRemaining;

    // Outlaw: no interest, gets reroll bonus instead
    const noInterest = !!(this.profession?.modifiers as Record<string, unknown>)?.noInterest;
    const perRemaining = ((this.profession?.modifiers as Record<string, unknown>)?.endOfRoundBonusPerRemaining as number) ?? 0;

    // Interest: based on current balance (gold dice money already earned before payout)
    let interest = 0;
    if (!noInterest) {
      const cappedMoney = Math.min(this.economy.balance, this.interestCap);
      interest = Math.floor(cappedMoney / GAMEPLAY.INTEREST_PER);
      // Savings Account: extra interest per $5 held (with copy-resolution)
      forEachEquipmentResolved(this.equipment, (equip) => {
        if (equip.def.effectType !== 'SAVINGS_ACCOUNT_INTEREST') return;
        const p = equip.def.effectParams as Record<string, unknown>;
        const chunk = (p.perChunk as number) ?? 5;
        const perChunk = (p.value as number) ?? 1;
        const accountantBonus =
          this.profession?.id === 'accountant' ? ((p.accountantBonus as number) ?? 1) : 0;
        interest += Math.floor(cappedMoney / chunk) * (perChunk + accountantBonus);
      }, 'skip');
    }

    // Outlaw reroll bonus
    const rerollBonus = perRemaining > 0 ? rerollsRemaining * perRemaining : 0;

    // Equipment end-of-round money (e.g. Payday) — NOT included in interest
    let equipmentMoney = 0;
    for (const equip of this.equipment) {
      if (equip.def.effectType === 'END_ROUND_MONEY') {
        const p = equip.def.effectParams as Record<string, unknown>;
        equipmentMoney += resolveEffectParam<number>(p, 'value', this.profession?.id) ?? 0;
      }
      if (equip.def.effectType === 'END_ROUND_MONEY_PER_REROLL') {
        equipmentMoney += ((equip.def.effectParams.value as number) ?? 0) * rerollsRemaining;
      }
      if (equip.def.effectType === 'END_ROUND_MONEY_SCALING') {
        const base = (equip.def.effectParams.base as number) ?? 1;
        const perBoss = (equip.def.effectParams.perBoss as number) ?? 2;
        const bossesDefeated = (equip.state.bossesDefeated as number) ?? 0;
        equipmentMoney += base + perBoss * bossesDefeated;
      }
      if (equip.def.effectType === 'TRAIL_ALMANAC_MONEY') {
        let discoveredCount = 0;
        for (const [, stats] of this.handStats) {
          if (stats.level > 1) discoveredCount++;
        }
        equipmentMoney += ((equip.def.effectParams.value as number) ?? 1) * discoveredCount;
      }
    }

    return {
      roundReward,
      dayBonus,
      interest,
      equipmentMoney,
      rerollBonus,
      total: roundReward + dayBonus + interest + equipmentMoney + rerollBonus,
    };
  }

  /** Whether the entire journey is complete */
  get journeyComplete(): boolean {
    return this.leg > GAMEPLAY.LEGS;
  }

  /** Add a tag to the pending queue. Twin Wagon increases copies. */
  addTag(def: TrailTagDef): void {
    if (def.id === 'tag_twin_wagon') {
      const copies = 1 + this.twinWagonCount;
      this.twinWagonCount += copies;
      return;
    }

    const copies = 1 + this.twinWagonCount;
    this.twinWagonCount = 0;
    this.pendingTags.push({ def, copies });
  }

  /** Remove a specific pending tag by index. Returns the removed tag or null. */
  consumeTag(index: number): TrailTagInstance | null {
    if (index < 0 || index >= this.pendingTags.length) return null;
    return this.pendingTags.splice(index, 1)[0];
  }

  /** Remove all pending tags matching a category. Returns removed tags. */
  consumeTagsByCategory(category: TagCategory): TrailTagInstance[] {
    const consumed: TrailTagInstance[] = [];
    this.pendingTags = this.pendingTags.filter((t) => {
      if (t.def.category === category) {
        consumed.push(t);
        return false;
      }
      return true;
    });
    return consumed;
  }

  /** Get pending tags for a specific category (read-only). */
  getTagsByCategory(category: TagCategory): TrailTagInstance[] {
    return this.pendingTags.filter((t) => t.def.category === category);
  }

  /** Advance to next round after a win. Returns true if the journey is complete. */
  advanceRound(skipped: boolean = false): boolean {
    if (skipped) {
      this.roundsSkipped++;
    }
    this.round++;
    if (this.round > GAMEPLAY.ROUNDS_PER_LEG) {
      this.round = 1;
      this.leg++;
      // New leg — clear the current permit so a new one generates
      this.currentLegPermit = null;
      this.permitPurchasedThisLeg = false;

    }
    // Spent dice persist across rounds — only refreshed by paying or auto-refresh
    return this.journeyComplete;
  }

  // ─── Permits ───

  /** Whether the player has purchased a specific permit */
  hasPermit(id: string): boolean {
    return this.purchasedPermits.includes(id);
  }

  /** Purchase a permit. Deducts cost, records purchase, applies effect. */
  buyPermit(def: PermitDef): boolean {
    if (this.purchasedPermits.includes(def.id)) return false;
    if (!this.canAfford(def.cost)) return false;
    this.trySpend(def.cost);
    this.purchasedPermits.push(def.id);
    applyPermitEffect(def, this);
    this.currentLegPermit = null; // purchased — no more permit this leg
    this.permitPurchasedThisLeg = true;
    return true;
  }

  /** Reset for a new run */
  reset(): void {
    this.economy = new Economy(DEFAULT_STARTING_MONEY);
    this.dice = createPouch(10);
    this.spentDiceIds = new Set();
    this.equipment = [];
    this.maxEquipmentSlots = DEFAULT_MAX_EQUIPMENT_SLOTS;
    this.shopSlots = DEFAULT_SHOP_SLOTS;
    this.leg = 1;
    this.round = 1;
    this.interestCap = GAMEPLAY.INTEREST_CAP;
    this.handStats = PlayerState.createDefaultHandStats();
    this.profession = null;
    this.handSize = GAMEPLAY.ROLL_SIZE;
    this.purchasedPermits = [];
    this.currentLegPermit = null;
    this.permitPurchasedThisLeg = false;
    this.permitDayBonus = 0;
    this.permitRerollBonus = 0;
    this.permitDayPenalty = 0;
    this.permitRerollPenalty = 0;
    this.permitScoreReduction = 0;
    this.pendingTags = [];
    this.storedAuraTags = [];
    this.roundsSkipped = 0;
    this.daysScored = 0;
    this.unusedRerollsTotal = 0;
    this.twinWagonCount = 0;
    this.wideSaddleBonus = 0;
    this.assignBosses();
  }
}

// Singleton shared across scenes via Phaser registry
let _instance: PlayerState | null = null;

export function getPlayerState(): PlayerState {
  if (!_instance) _instance = new PlayerState();
  return _instance;
}

export function resetPlayerState(): PlayerState {
  _instance = new PlayerState();
  return _instance;
}
