// ─── Test-only run player facade (No Phaser imports) ───
// Used by unit tests only. Production code uses runStore actions and selectors.

import {
  Die,
  HandType,
  HandStats,
  BossDef,
  TrailTagDef,
  TrailTagInstance,
  TagCategory,
  DifficultyLevel,
} from '../types';
import type { EquipmentDef, EquipmentInstance } from '../ItemsSystem';
import type { ConsumableDef, ConsumableInstance } from '../ConsumablesSystem';
import type { PermitDef } from '../PermitsSystem';
import type { TrailEventModifiers, TrailRoundEffects } from '../TrailEventsSystem';
import type { TrailEventDef } from '../../data/trail_events';
import { type ProfessionDef } from '../../data/professions';
import { getPermitById } from '../PermitsSystem';
import type { BossRoundState } from '../BossEffectsSystem';
import type { Decimal } from '../scoreMath';
import { getTrailTagById } from '../../data/trail_tags';
import { resetRunRng } from '../RunRng';
import { getRunState, runActions } from '../store/runStore';
import { roundStore } from '../store/roundStore';
import { resolveConsumableDefById, resolveConsumableList, resolveEquipmentList } from '../store/resolve';
import {
  bossActions,
  consumableActions,
  diceActions,
  economyActions,
  equipmentActions,
  permitActions,
  progressionActions,
  setupActions,
  shopActions,
  tagActions,
} from '../store/actions';
import {
  selectAllDiceSpent,
  selectAvailableDice,
  selectBossForLeg,
  selectBossPermitRerollLimit,
  selectCanBossPermitReroll,
  selectConsumableSlotsFree,
  selectCurrentBoss,
  selectEffectiveDays,
  selectEffectiveRerolls,
  selectEquipmentSlotsFree,
  selectHandStats,
  selectIsBossRound,
  selectIsFirstShopVisit,
  selectJourneyComplete,
  selectPendingTags,
  selectPendingTrailEvent,
  selectProfession,
  selectRefreshCost,
  selectResolvedLoadedDieTarget,
  selectRoundReward,
  selectShopRerollCost,
  selectSkipPreviewTagForRound,
  selectSkippedTagForRound,
  selectSpentDice,
  selectStoryVictoryOffered,
  selectStoredAuraTags,
  selectTagsByCategory,
  selectTargetMiles,
  selectTotalRound,
  selectUsedConsumableSlots,
  selectUsedEquipmentSlots,
} from '../store/selectors/runSelectors';

export type { ProfessionDef } from '../../data/professions';
import { computePayoutBreakdown } from '../runProgression';

export { computeRoundReward, computeTargetMiles, computePayoutBreakdown } from '../runProgression';

import type { PayoutBreakdown } from '../store/types';

export type { PayoutBreakdown } from '../store/types';

/** Economy view backed by run store balance. */
class RunEconomyView {
  get balance(): number {
    return getRunState().balance;
  }

  earn(amount: number): void {
    economyActions.earn(amount);
  }

  spend(amount: number, minBalance: number = 0): boolean {
    const state = getRunState();
    if (state.balance - amount < minBalance) return false;
    economyActions.setBalance(state.balance - amount);
    return true;
  }

  setBalance(amount: number): void {
    economyActions.setBalance(amount);
  }
}

function patchRun(partial: Parameters<typeof runActions.patch>[0]): void {
  runActions.patch(partial);
}

/** Set backed by run store; mutating methods persist to the store. */
class StoreBackedStringSet {
  constructor(private field: 'spentDiceIds' | 'seenTrailEventIds') {}

  private ids(): string[] {
    return getRunState()[this.field];
  }

  private write(ids: string[]): void {
    patchRun({ [this.field]: ids });
  }

  add(id: string): this {
    if (!this.has(id)) this.write([...this.ids(), id]);
    return this;
  }

  clear(): void {
    this.write([]);
  }

  delete(id: string): boolean {
    if (!this.has(id)) return false;
    this.write(this.ids().filter((x) => x !== id));
    return true;
  }

  has(id: string): boolean {
    return this.ids().includes(id);
  }

  get size(): number {
    return this.ids().length;
  }

  forEach(cb: (value: string) => void): void {
    this.ids().forEach(cb);
  }

  [Symbol.iterator](): Iterator<string> {
    return this.ids()[Symbol.iterator]();
  }

  toArray(): string[] {
    return [...this.ids()];
  }
}

const spentDiceIdsSet = new StoreBackedStringSet('spentDiceIds');
const seenTrailEventIdsSet = new StoreBackedStringSet('seenTrailEventIds');

/**
 * Legacy player API. Reads/writes runStore via actions and selectors.
 * @deprecated Prefer run store actions and selectors directly in new code.
 */
export class PlayerState {
  readonly economy = new RunEconomyView();

  private _equipment: EquipmentInstance[] = [];
  private _consumables: ConsumableInstance[] = [];
  private _equipmentFp = '';
  private _consumablesFp = '';

  private storedEquipmentFingerprint(): string {
    return JSON.stringify(getRunState().equipment);
  }

  private storedConsumablesFingerprint(): string {
    return JSON.stringify(getRunState().consumables);
  }

  syncFromStore(): void {
    this._equipment = resolveEquipmentList();
    this._consumables = resolveConsumableList();
    this._equipmentFp = this.storedEquipmentFingerprint();
    this._consumablesFp = this.storedConsumablesFingerprint();
  }

  private attachArraySync<T>(cache: T[], persist: () => void): T[] {
    const flag = Symbol('persist');
    const marked = cache as T[] & { [key: symbol]: boolean };
    if (marked[flag]) return cache;
    marked[flag] = true;
    for (const method of ['push', 'pop', 'splice', 'shift', 'unshift', 'sort', 'reverse'] as const) {
      const original = Array.prototype[method].bind(cache) as (...args: never[]) => unknown;
      Object.defineProperty(cache, method, {
        value(...args: never[]) {
          const result = original(...args);
          persist();
          return result;
        },
        configurable: true,
        writable: true,
      });
    }
    return cache;
  }

  private s() {
    return getRunState();
  }

  get dice(): Die[] {
    return this.s().dice;
  }
  set dice(v: Die[]) {
    patchRun({ dice: v });
  }

  get loadedDieTarget(): number | null {
    return this.s().loadedDieTarget;
  }
  set loadedDieTarget(v: number | null) {
    diceActions.setLoadedDieTarget(v);
  }

  get loadedDieSyncLucky(): boolean {
    return this.s().loadedDieSyncLucky;
  }
  set loadedDieSyncLucky(v: boolean) {
    diceActions.setLoadedDieSyncLucky(v);
  }

  get spentDiceIds(): StoreBackedStringSet {
    return spentDiceIdsSet;
  }
  set spentDiceIds(v: Set<string>) {
    patchRun({ spentDiceIds: [...v] });
  }

  get equipment(): EquipmentInstance[] {
    const fp = this.storedEquipmentFingerprint();
    if (fp !== this._equipmentFp) {
      this.syncFromStore();
    }
    return this.attachArraySync(this._equipment, () => {
      equipmentActions.setEquipment(this._equipment);
      this._equipmentFp = this.storedEquipmentFingerprint();
    });
  }
  set equipment(v: EquipmentInstance[]) {
    this._equipment = v;
    equipmentActions.setEquipment(v);
    this._equipmentFp = this.storedEquipmentFingerprint();
  }

  /** Write in-memory equipment mutations (e.g. state fields) to the run store. */
  persistEquipment(): void {
    equipmentActions.setEquipment(this._equipment);
    this._equipmentFp = this.storedEquipmentFingerprint();
  }

  get maxEquipmentSlots(): number {
    return this.s().maxEquipmentSlots;
  }
  set maxEquipmentSlots(v: number) {
    patchRun({ maxEquipmentSlots: v });
  }

  get consumables(): ConsumableInstance[] {
    const fp = this.storedConsumablesFingerprint();
    if (fp !== this._consumablesFp) {
      this.syncFromStore();
    }
    return this.attachArraySync(this._consumables, () => {
      consumableActions.setConsumables(this._consumables);
      this._consumablesFp = this.storedConsumablesFingerprint();
    });
  }
  set consumables(v: ConsumableInstance[]) {
    this._consumables = v;
    consumableActions.setConsumables(v);
    this._consumablesFp = this.storedConsumablesFingerprint();
  }

  get maxConsumableSlots(): number {
    return this.s().maxConsumableSlots;
  }
  set maxConsumableSlots(v: number) {
    patchRun({ maxConsumableSlots: v });
  }

  get lastUsedConsumable(): ConsumableDef | null {
    return resolveConsumableDefById(this.s().lastUsedConsumableId);
  }
  set lastUsedConsumable(v: ConsumableDef | null) {
    patchRun({ lastUsedConsumableId: v?.id ?? null });
  }

  get shopSlots(): number {
    return this.s().shopSlots;
  }
  set shopSlots(v: number) {
    patchRun({ shopSlots: v });
  }

  get leg(): number {
    return this.s().leg;
  }
  set leg(v: number) {
    patchRun({ leg: v });
  }

  get round(): number {
    return this.s().round;
  }
  set round(v: number) {
    patchRun({ round: v });
  }

  get interestCap(): number {
    return this.s().interestCap;
  }
  set interestCap(v: number) {
    patchRun({ interestCap: v });
  }

  get handStats(): Map<HandType, HandStats> {
    return new Map(Object.entries(this.s().handStats) as [HandType, HandStats][]);
  }
  set handStats(v: Map<HandType, HandStats>) {
    patchRun({ handStats: Object.fromEntries(v) as Record<HandType, HandStats> });
  }

  get profession(): ProfessionDef | null {
    return selectProfession(this.s()) ?? null;
  }
  set profession(v: ProfessionDef | null) {
    patchRun({ professionId: v?.id ?? null });
  }

  get difficulty(): DifficultyLevel {
    return this.s().difficulty;
  }
  set difficulty(v: DifficultyLevel) {
    patchRun({ difficulty: v });
  }

  get handSize(): number {
    return this.s().handSize;
  }
  set handSize(v: number) {
    patchRun({ handSize: v });
  }

  get shopRerollCount(): number {
    return this.s().shopRerollCount;
  }
  set shopRerollCount(v: number) {
    patchRun({ shopRerollCount: v });
  }

  get purchasedPermits(): string[] {
    return this.s().purchasedPermits;
  }
  set purchasedPermits(v: string[]) {
    patchRun({ purchasedPermits: v });
  }

  get currentLegPermit(): PermitDef | null {
    const id = this.s().currentLegPermitId;
    return id ? getPermitById(id) : null;
  }
  set currentLegPermit(v: PermitDef | null) {
    patchRun({ currentLegPermitId: v?.id ?? null });
  }

  get permitPurchasedThisLeg(): boolean {
    return this.s().permitPurchasedThisLeg;
  }
  set permitPurchasedThisLeg(v: boolean) {
    patchRun({ permitPurchasedThisLeg: v });
  }

  get permitDayBonus(): number {
    return this.s().permitDayBonus;
  }
  set permitDayBonus(v: number) {
    patchRun({ permitDayBonus: v });
  }

  get permitRerollBonus(): number {
    return this.s().permitRerollBonus;
  }
  set permitRerollBonus(v: number) {
    patchRun({ permitRerollBonus: v });
  }

  get permitDayPenalty(): number {
    return this.s().permitDayPenalty;
  }
  set permitDayPenalty(v: number) {
    patchRun({ permitDayPenalty: v });
  }

  get permitRerollPenalty(): number {
    return this.s().permitRerollPenalty;
  }
  set permitRerollPenalty(v: number) {
    patchRun({ permitRerollPenalty: v });
  }

  get permitScoreReduction(): number {
    return this.s().permitScoreReduction;
  }
  set permitScoreReduction(v: number) {
    patchRun({ permitScoreReduction: v });
  }

  get trailEventModifiers(): TrailEventModifiers {
    return this.s().trailEventModifiers;
  }
  set trailEventModifiers(v: TrailEventModifiers) {
    patchRun({ trailEventModifiers: v });
  }

  get trailRoundEffects(): TrailRoundEffects {
    return this.s().trailRoundEffects;
  }
  set trailRoundEffects(v: TrailRoundEffects) {
    patchRun({ trailRoundEffects: v });
  }

  get pendingTrailEvent(): TrailEventDef | null {
    return selectPendingTrailEvent(this.s());
  }
  set pendingTrailEvent(v: TrailEventDef | null) {
    patchRun({ pendingTrailEventId: v?.id ?? null });
  }

  get seenTrailEventIds(): StoreBackedStringSet {
    return seenTrailEventIdsSet;
  }
  set seenTrailEventIds(v: Set<string>) {
    patchRun({ seenTrailEventIds: [...v] });
  }

  get skipNextShop(): boolean {
    return this.s().skipNextShop;
  }
  set skipNextShop(v: boolean) {
    patchRun({ skipNextShop: v });
  }

  get trailGuidesUsed(): number {
    return this.s().trailGuidesUsed;
  }
  set trailGuidesUsed(v: number) {
    patchRun({ trailGuidesUsed: v });
  }

  get startingDiceCount(): number {
    return this.s().startingDiceCount;
  }
  set startingDiceCount(v: number) {
    patchRun({ startingDiceCount: v });
  }

  get bossEffectDisabled(): boolean {
    return this.s().bossEffectDisabled;
  }
  set bossEffectDisabled(v: boolean) {
    patchRun({ bossEffectDisabled: v });
  }

  get bossRoundState(): BossRoundState {
    return this.s().bossRoundState;
  }
  set bossRoundState(v: BossRoundState) {
    patchRun({ bossRoundState: v });
  }

  get pendingNewDiceIds(): string[] {
    return this.s().pendingNewDiceIds;
  }
  set pendingNewDiceIds(v: string[]) {
    patchRun({ pendingNewDiceIds: v });
  }

  get pendingHandDiceIds(): string[] {
    return this.s().pendingHandDiceIds;
  }
  set pendingHandDiceIds(v: string[]) {
    patchRun({ pendingHandDiceIds: v });
  }

  get pendingAnimatedDestructions(): { sourceIdx: number; victimIdx: number }[] {
    return this.s().pendingAnimatedDestructions;
  }
  set pendingAnimatedDestructions(v: { sourceIdx: number; victimIdx: number }[]) {
    patchRun({ pendingAnimatedDestructions: v });
  }

  get pendingJunkDealerCount(): number {
    return this.s().pendingJunkDealerCount;
  }
  set pendingJunkDealerCount(v: number) {
    patchRun({ pendingJunkDealerCount: v });
  }

  get pendingTags(): TrailTagInstance[] {
    const tags = selectPendingTags(this.s());
    return this.attachArraySync(tags, () => {
      patchRun({
        pendingTags: tags.map((t) => ({
          tagId: t.def.id,
          copies: t.copies,
          ...(t.surveyorHand ? { surveyorHand: t.surveyorHand } : {}),
        })),
      });
    });
  }
  set pendingTags(v: TrailTagInstance[]) {
    patchRun({
      pendingTags: v.map((t) => ({
        tagId: t.def.id,
        copies: t.copies,
        ...(t.surveyorHand ? { surveyorHand: t.surveyorHand } : {}),
      })),
    });
  }

  get storedAuraTags(): TrailTagInstance[] {
    return selectStoredAuraTags(this.s());
  }
  set storedAuraTags(v: TrailTagInstance[]) {
    patchRun({ storedAuraTags: v.map((t) => ({ tagId: t.def.id, copies: t.copies })) });
  }

  get roundsSkipped(): number {
    return this.s().roundsSkipped;
  }
  set roundsSkipped(v: number) {
    patchRun({ roundsSkipped: v });
  }

  get daysScored(): number {
    return this.s().daysScored;
  }
  set daysScored(v: number) {
    patchRun({ daysScored: v });
  }

  get unusedRerollsTotal(): number {
    return this.s().unusedRerollsTotal;
  }
  set unusedRerollsTotal(v: number) {
    patchRun({ unusedRerollsTotal: v });
  }

  get twinWagonCount(): number {
    return this.s().twinWagonCount;
  }
  set twinWagonCount(v: number) {
    patchRun({ twinWagonCount: v });
  }

  get wideSaddleBonus(): number {
    return this.s().wideSaddleBonus;
  }
  set wideSaddleBonus(v: number) {
    patchRun({ wideSaddleBonus: v });
  }

  get tagFreeReroll(): boolean {
    return this.s().tagFreeReroll;
  }
  set tagFreeReroll(v: boolean) {
    patchRun({ tagFreeReroll: v });
  }

  get bonusShopPermit(): PermitDef | null {
    const id = this.s().bonusShopPermitId;
    return id ? getPermitById(id) : null;
  }
  set bonusShopPermit(v: PermitDef | null) {
    patchRun({ bonusShopPermitId: v?.id ?? null });
  }

  get skippedRoundsThisLeg(): number[] {
    return this.s().skippedRoundsThisLeg;
  }
  set skippedRoundsThisLeg(v: number[]) {
    patchRun({ skippedRoundsThisLeg: v });
  }

  get skippedRoundTags(): Partial<Record<number, TrailTagDef>> {
    const out: Partial<Record<number, TrailTagDef>> = {};
    for (const [k, id] of Object.entries(this.s().skippedRoundTags)) {
      const def = id ? getTrailTagById(id) : undefined;
      if (def) out[Number(k)] = def;
    }
    return out;
  }
  set skippedRoundTags(v: Partial<Record<number, TrailTagDef>>) {
    const skippedRoundTags: Record<number, string> = {};
    for (const [k, def] of Object.entries(v)) {
      if (def) skippedRoundTags[Number(k)] = def.id;
    }
    patchRun({ skippedRoundTags });
  }

  get roundSkipPreviewTags(): Partial<Record<number, TrailTagDef>> {
    const out: Partial<Record<number, TrailTagDef>> = {};
    for (const [k, id] of Object.entries(this.s().roundSkipPreviewTags)) {
      const def = id ? getTrailTagById(id) : undefined;
      if (def) out[Number(k)] = def;
    }
    return out;
  }
  set roundSkipPreviewTags(v: Partial<Record<number, TrailTagDef>>) {
    const roundSkipPreviewTags: Record<number, string> = {};
    for (const [k, def] of Object.entries(v)) {
      if (def) roundSkipPreviewTags[Number(k)] = def.id;
    }
    patchRun({ roundSkipPreviewTags });
  }

  get bossRerollsUsedThisLeg(): number {
    return this.s().bossRerollsUsedThisLeg;
  }
  set bossRerollsUsedThisLeg(v: number) {
    patchRun({ bossRerollsUsedThisLeg: v });
  }

  get dynamiteSelfDestructed(): boolean {
    return this.s().dynamiteSelfDestructed;
  }
  set dynamiteSelfDestructed(v: boolean) {
    patchRun({ dynamiteSelfDestructed: v });
  }

  get endlessMode(): boolean {
    return this.s().endlessMode;
  }
  set endlessMode(v: boolean) {
    patchRun({ endlessMode: v });
  }

  get storyVictoryPending(): boolean {
    return this.s().storyVictoryPending;
  }
  set storyVictoryPending(v: boolean) {
    patchRun({ storyVictoryPending: v });
  }

  setDifficulty(level: DifficultyLevel): void {
    setupActions.setDifficulty(level);
  }

  get effectiveDays(): number {
    return selectEffectiveDays(this.s());
  }

  get effectiveRerolls(): number {
    return selectEffectiveRerolls(this.s());
  }

  finalizeRunSetup(): void {
    setupActions.finalizeRunSetup();
  }

  isFirstShopVisit(): boolean {
    return selectIsFirstShopVisit(this.s());
  }

  applyProfession(professionId: string): void {
    setupActions.applyProfession(professionId);
  }

  getHandStats(type: HandType): HandStats {
    return selectHandStats(this.s(), type);
  }

  recordHandPlayed(type: HandType): void {
    progressionActions.recordHandPlayed(type);
  }

  upgradeHandLevel(type: HandType, amount: number = 1): void {
    progressionActions.upgradeHandLevel(type, amount);
  }

  get availableDice(): Die[] {
    return selectAvailableDice(this.s());
  }

  get spentDice(): Die[] {
    return selectSpentDice(this.s());
  }

  get allDiceSpent(): boolean {
    return selectAllDiceSpent(this.s());
  }

  markDiceSpent(ids: string[]): boolean {
    return diceActions.markDiceSpent(ids);
  }

  get refreshCost(): number {
    return selectRefreshCost(this.s());
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
    return economyActions.canAfford(amount);
  }

  trySpend(amount: number): boolean {
    return economyActions.trySpend(amount);
  }

  refreshSpentDice(): boolean {
    return diceActions.refreshSpentDice();
  }

  hasLuckyNumberEquipment(): boolean {
    return this.equipment.some((e) => e.def.id === 'lucky_number');
  }

  getLuckyNumberPip(): number | null {
    const lucky = this.equipment.find((e) => e.def.id === 'lucky_number');
    const pip = lucky?.state.pip;
    if (typeof pip !== 'number' || pip < 1 || pip > 12) return null;
    return pip;
  }

  getResolvedLoadedDieTarget(): number | null {
    return selectResolvedLoadedDieTarget(this.s());
  }

  setLoadedDieSyncLucky(sync: boolean): void {
    diceActions.setLoadedDieSyncLucky(sync);
  }

  applyLoadedDieFromLuckyNumber(pip: number): void {
    diceActions.applyLoadedDieFromLuckyNumber(pip);
  }

  setLoadedDieTarget(value: number | null): void {
    diceActions.setLoadedDieTarget(value);
  }

  addDie(die: Die): Die {
    return diceActions.addDie(die);
  }

  get trailGuidesFree(): boolean {
    return this.equipment.some((e) => e.def.effectType === 'EXPLORER_GUILD');
  }

  get shopRerollCost(): number {
    return selectShopRerollCost(this.s());
  }

  canRerollShop(): boolean {
    return shopActions.canRerollShop();
  }

  payShopReroll(): boolean {
    return progressionActions.payShopReroll();
  }

  resetShopRerolls(): void {
    progressionActions.resetShopRerolls();
  }

  get usedEquipmentSlots(): number {
    return selectUsedEquipmentSlots(this.s());
  }

  get equipmentSlotsFree(): number {
    return selectEquipmentSlotsFree(this.s());
  }

  canBuy(item: EquipmentDef): boolean {
    return equipmentActions.canBuy(item);
  }

  buyEquipment(def: EquipmentDef): boolean {
    return equipmentActions.buyEquipment(def);
  }

  destroyEquipment(index: number): boolean {
    return equipmentActions.destroyEquipment(index);
  }

  sellEquipment(index: number): boolean {
    return equipmentActions.sellEquipment(index);
  }

  reorderEquipment(fromIndex: number, toIndex: number): void {
    equipmentActions.reorderEquipment(fromIndex, toIndex);
  }

  get usedConsumableSlots(): number {
    return selectUsedConsumableSlots(this.s());
  }

  get consumableSlotsFree(): number {
    return selectConsumableSlotsFree(this.s());
  }

  canAddConsumable(def: ConsumableDef): boolean {
    return consumableActions.canAddConsumable(def);
  }

  addConsumable(def: ConsumableDef): boolean {
    return consumableActions.addConsumable(def);
  }

  sellConsumable(index: number): boolean {
    return consumableActions.sellConsumable(index);
  }

  useConsumable(index: number): ConsumableInstance | null {
    return consumableActions.useConsumable(index);
  }

  reorderConsumable(fromIndex: number, toIndex: number): void {
    consumableActions.reorderConsumable(fromIndex, toIndex);
  }

  assignBosses(): void {
    bossActions.assignBosses();
  }

  setBossForCurrentLeg(boss: BossDef): void {
    bossActions.setBossForCurrentLeg(boss);
  }

  rerollBossForLeg(leg: number = this.leg): boolean {
    return bossActions.rerollBossForLeg(leg);
  }

  get bossPermitRerollLimit(): number {
    return selectBossPermitRerollLimit(this.s());
  }

  canBossPermitReroll(): boolean {
    return selectCanBossPermitReroll(this.s());
  }

  tryBossPermitReroll(): boolean {
    return bossActions.tryBossPermitReroll();
  }

  get currentBoss(): BossDef | null {
    bossActions.ensureBossAssignments();
    return selectCurrentBoss(this.s());
  }

  getBossForLeg(leg: number): BossDef | null {
    bossActions.ensureBossAssignments();
    return selectBossForLeg(this.s(), leg);
  }

  getBossAssignmentIds(): string[] {
    bossActions.ensureBossAssignments();
    return [...this.s().bossAssignmentIds];
  }

  restoreBossAssignments(ids: string[]): void {
    bossActions.restoreBossAssignments(ids);
  }

  getNextDieIdForSave(): number {
    return this.s().nextDieId;
  }

  setNextDieIdForRestore(value: number): void {
    patchRun({ nextDieId: value });
  }

  get isBossRound(): boolean {
    return selectIsBossRound(this.s());
  }

  get totalRound(): number {
    return selectTotalRound(this.s());
  }

  get roundReward(): number {
    return selectRoundReward(this.s());
  }

  get targetMiles(): Decimal {
    return selectTargetMiles(this.s());
  }

  calculatePayout(daysRemaining: number, rerollsRemaining: number = 0): PayoutBreakdown {
    return computePayoutBreakdown(this.s(), daysRemaining, rerollsRemaining);
  }

  get journeyComplete(): boolean {
    return selectJourneyComplete(this.s());
  }

  get storyVictoryOffered(): boolean {
    return selectStoryVictoryOffered(this.s());
  }

  addTag(def: TrailTagDef): void {
    tagActions.addTag(def);
  }

  consumeTag(index: number): TrailTagInstance | null {
    return tagActions.consumeTag(index);
  }

  consumeTagsByCategory(category: TagCategory): TrailTagInstance[] {
    return tagActions.consumeTagsByCategory(category);
  }

  getTagsByCategory(category: TagCategory): TrailTagInstance[] {
    return selectTagsByCategory(this.s(), category);
  }

  recordRoundSkipped(tag: TrailTagDef): void {
    tagActions.recordRoundSkipped(tag);
  }

  getSkippedTagForRound(round: number): TrailTagDef | undefined {
    return selectSkippedTagForRound(this.s(), round);
  }

  getSkipPreviewTagForRound(round: number): TrailTagDef | undefined {
    return selectSkipPreviewTagForRound(this.s(), round);
  }

  advanceRound(skipped: boolean = false): boolean {
    return progressionActions.advanceRound(skipped);
  }

  hasPermit(id: string): boolean {
    return permitActions.hasPermit(id);
  }

  buyPermit(def: PermitDef): boolean {
    return permitActions.buyPermit(def);
  }

  reset(): void {
    setupActions.reset();
  }
}

let _facade: PlayerState | null = null;

export function getPlayerState(): PlayerState {
  if (!_facade) _facade = new PlayerState();
  return _facade;
}

export function resetPlayerState(): PlayerState {
  resetRunRng();
  runActions.reset();
  roundStore.setState(null, true);
  const player = getPlayerState();
  player.syncFromStore();
  return player;
}
