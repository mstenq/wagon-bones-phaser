# Graph Report - .  (2026-06-07)

## Corpus Check
- 318 files · ~241,491 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2615 nodes · 10517 edges · 100 communities (74 shown, 26 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_App Shell & Scenes|App Shell & Scenes]]
- [[_COMMUNITY_Store Actions & Selectors|Store Actions & Selectors]]
- [[_COMMUNITY_Types & Formatting|Types & Formatting]]
- [[_COMMUNITY_Game Scene Core|Game Scene Core]]
- [[_COMMUNITY_Misc Utilities|Misc Utilities]]
- [[_COMMUNITY_Equipment & Tags|Equipment & Tags]]
- [[_COMMUNITY_Serialization & Tooltips|Serialization & Tooltips]]
- [[_COMMUNITY_Item Card UI|Item Card UI]]
- [[_COMMUNITY_Shop Generation|Shop Generation]]
- [[_COMMUNITY_Dev Modals & Catalog|Dev Modals & Catalog]]
- [[_COMMUNITY_Effect Registry|Effect Registry]]
- [[_COMMUNITY_Audio Preferences|Audio Preferences]]
- [[_COMMUNITY_Round FSM Actions|Round FSM Actions]]
- [[_COMMUNITY_SaveLoad & RNG|Save/Load & RNG]]
- [[_COMMUNITY_Dice Row Layout|Dice Row Layout]]
- [[_COMMUNITY_Boss Effects|Boss Effects]]
- [[_COMMUNITY_Auto-Save Storage|Auto-Save Storage]]
- [[_COMMUNITY_Booster Pack Data|Booster Pack Data]]
- [[_COMMUNITY_Scoring Pipeline|Scoring Pipeline]]
- [[_COMMUNITY_Booster Pack Scene|Booster Pack Scene]]
- [[_COMMUNITY_Equipment Animations|Equipment Animations]]
- [[_COMMUNITY_Frontier & Item Defs|Frontier & Item Defs]]
- [[_COMMUNITY_Cluster 22|Cluster 22]]
- [[_COMMUNITY_Item Card Layout|Item Card Layout]]
- [[_COMMUNITY_Score Math & Targets|Score Math & Targets]]
- [[_COMMUNITY_Permits & Shop|Permits & Shop]]
- [[_COMMUNITY_Pack Card Use Flow|Pack Card Use Flow]]
- [[_COMMUNITY_Hint Display System|Hint Display System]]
- [[_COMMUNITY_Consumables System|Consumables System]]
- [[_COMMUNITY_Dice Enhancements|Dice Enhancements]]
- [[_COMMUNITY_Scene Layout Metrics|Scene Layout Metrics]]
- [[_COMMUNITY_Dice Sprite Visuals|Dice Sprite Visuals]]
- [[_COMMUNITY_Dice & Item Auras|Dice & Item Auras]]
- [[_COMMUNITY_Playback Queue|Playback Queue]]
- [[_COMMUNITY_Equipment Definitions|Equipment Definitions]]
- [[_COMMUNITY_Boss Equipment UI|Boss Equipment UI]]
- [[_COMMUNITY_Score Animations|Score Animations]]
- [[_COMMUNITY_Trail Events Data|Trail Events Data]]
- [[_COMMUNITY_Effect Helpers|Effect Helpers]]
- [[_COMMUNITY_Difficulty & Stats|Difficulty & Stats]]
- [[_COMMUNITY_Trail Event Scene|Trail Event Scene]]
- [[_COMMUNITY_Bosses & Hands|Bosses & Hands]]
- [[_COMMUNITY_Trail Event Logic|Trail Event Logic]]
- [[_COMMUNITY_Run RNG & Packs|Run RNG & Packs]]
- [[_COMMUNITY_Equipment Pool Gen|Equipment Pool Gen]]
- [[_COMMUNITY_Difficulty Select UI|Difficulty Select UI]]
- [[_COMMUNITY_Game Facade Modules|Game Facade Modules]]
- [[_COMMUNITY_Cluster 47|Cluster 47]]
- [[_COMMUNITY_Equipment Lifecycle|Equipment Lifecycle]]
- [[_COMMUNITY_Aura Particles|Aura Particles]]
- [[_COMMUNITY_Cluster 50|Cluster 50]]
- [[_COMMUNITY_Game & Round State|Game & Round State]]
- [[_COMMUNITY_Store Subscriptions|Store Subscriptions]]
- [[_COMMUNITY_Tag Stack UI|Tag Stack UI]]
- [[_COMMUNITY_Shop Buy Actions|Shop Buy Actions]]
- [[_COMMUNITY_Item Card Hints|Item Card Hints]]
- [[_COMMUNITY_Dice Selection UI|Dice Selection UI]]
- [[_COMMUNITY_Trail Event Assets|Trail Event Assets]]
- [[_COMMUNITY_Card Tooltip Tracking|Card Tooltip Tracking]]
- [[_COMMUNITY_Consumable Bar|Consumable Bar]]
- [[_COMMUNITY_Loaded Dice Effects|Loaded Dice Effects]]
- [[_COMMUNITY_Leg Round Panels|Leg Round Panels]]
- [[_COMMUNITY_Dice Selection Picks|Dice Selection Picks]]
- [[_COMMUNITY_Cluster 63|Cluster 63]]
- [[_COMMUNITY_Run State Reads|Run State Reads]]
- [[_COMMUNITY_Dice Selection Effects|Dice Selection Effects]]
- [[_COMMUNITY_Cluster 66|Cluster 66]]
- [[_COMMUNITY_Cluster 67|Cluster 67]]
- [[_COMMUNITY_Die Scoring Patches|Die Scoring Patches]]
- [[_COMMUNITY_Cluster 69|Cluster 69]]
- [[_COMMUNITY_Action Tabs & HUD|Action Tabs & HUD]]
- [[_COMMUNITY_Cluster 71|Cluster 71]]
- [[_COMMUNITY_Cluster 72|Cluster 72]]
- [[_COMMUNITY_Equipment Modifiers|Equipment Modifiers]]
- [[_COMMUNITY_Cluster 74|Cluster 74]]
- [[_COMMUNITY_Hand Stats & Upgrades|Hand Stats & Upgrades]]
- [[_COMMUNITY_Core Die Types|Core Die Types]]
- [[_COMMUNITY_Payout Scene|Payout Scene]]
- [[_COMMUNITY_Cluster 78|Cluster 78]]
- [[_COMMUNITY_Cluster 79|Cluster 79]]
- [[_COMMUNITY_Trail Round Effects|Trail Round Effects]]
- [[_COMMUNITY_Enhancement Payouts|Enhancement Payouts]]
- [[_COMMUNITY_Action Tabs Layout|Action Tabs Layout]]
- [[_COMMUNITY_Cluster 84|Cluster 84]]
- [[_COMMUNITY_Cluster 85|Cluster 85]]
- [[_COMMUNITY_Professions Data|Professions Data]]
- [[_COMMUNITY_Lifecycle Orchestrators|Lifecycle Orchestrators]]
- [[_COMMUNITY_Cluster 88|Cluster 88]]
- [[_COMMUNITY_Cluster 89|Cluster 89]]
- [[_COMMUNITY_Cluster 90|Cluster 90]]
- [[_COMMUNITY_Cluster 91|Cluster 91]]
- [[_COMMUNITY_Cluster 92|Cluster 92]]
- [[_COMMUNITY_Cluster 93|Cluster 93]]
- [[_COMMUNITY_Cluster 94|Cluster 94]]
- [[_COMMUNITY_Cluster 95|Cluster 95]]
- [[_COMMUNITY_Cluster 96|Cluster 96]]
- [[_COMMUNITY_Cluster 98|Cluster 98]]
- [[_COMMUNITY_Cluster 99|Cluster 99]]

## God Nodes (most connected - your core abstractions)
1. `getRunState()` - 229 edges
2. `PlayerState` - 144 edges
3. `resolveEquipmentList()` - 98 edges
4. `ItemCard` - 92 edges
5. `Die` - 91 edges
6. `DiceSprite` - 83 edges
7. `HandType` - 74 edges
8. `EquipmentInstance` - 73 edges
9. `GameScene` - 73 edges
10. `BoosterPackScene` - 57 edges

## Surprising Connections (you probably didn't know these)
- `RowMeasurement` --references--> `HintSegment`  [EXTRACTED]
  src/phaser/ui/itemCard/ItemCardHints.ts → src/data/items.ts
- `BossScorePreview` --references--> `HandType`  [EXTRACTED]
  src/game/BossEffectsSystem.ts → src/game/types.ts
- `animateGrantToConsumableBar()` --calls--> `getConsumableAtlasKey()`  [EXTRACTED]
  src/phaser/animations/ScoreAnimation.ts → src/game/ConsumablesSystem.ts
- `applyConsumableGrant()` --calls--> `getConsumableDefById()`  [EXTRACTED]
  src/phaser/animations/ScoreAnimation.ts → src/game/ConsumablesSystem.ts
- `ShopStockRow` --references--> `EquipmentDef`  [EXTRACTED]
  src/game/TagSystem.ts → src/game/ItemsSystem.ts

## Import Cycles
- 3-file cycle: `src/game/facade/index.ts -> src/game/facade/meta.ts -> src/game/store/index.ts -> src/game/facade/index.ts`
- 3-file cycle: `src/game/facade/index.ts -> src/game/facade/pack.ts -> src/game/store/index.ts -> src/game/facade/index.ts`
- 3-file cycle: `src/game/facade/index.ts -> src/game/facade/trail.ts -> src/game/store/index.ts -> src/game/facade/index.ts`
- 3-file cycle: `src/game/ConsumablesSystem.ts -> src/game/playback/feedback.ts -> src/game/playback/types.ts -> src/game/ConsumablesSystem.ts`
- 3-file cycle: `src/data/items.ts -> src/game/equipmentUtils.ts -> src/game/ItemsSystem.ts -> src/data/items.ts`
- 3-file cycle: `src/game/BossEffectsSystem.ts -> src/game/store/actions/economyActions.ts -> src/game/equipmentUtils.ts -> src/game/BossEffectsSystem.ts`
- 3-file cycle: `src/game/BossEffectsSystem.ts -> src/game/DiceSystem.ts -> src/game/equipmentUtils.ts -> src/game/BossEffectsSystem.ts`
- 3-file cycle: `src/game/BossEffectsSystem.ts -> src/game/store/actions/progressionActions.ts -> src/game/EquipmentEffects.ts -> src/game/BossEffectsSystem.ts`
- 3-file cycle: `src/game/BossEffectsSystem.ts -> src/game/store/actions/progressionActions.ts -> src/game/store/actions/equipmentActions.ts -> src/game/BossEffectsSystem.ts`
- 3-file cycle: `src/game/EquipmentEffects.ts -> src/game/effects/lifecycle/onRoundStart.ts -> src/game/store/actions/diceActions.ts -> src/game/EquipmentEffects.ts`
- 3-file cycle: `src/game/playback/index.ts -> src/game/playback/queue.ts -> src/game/store/runStore.ts -> src/game/playback/index.ts`
- 3-file cycle: `src/game/playback/index.ts -> src/game/store/playbackEnqueue.ts -> src/game/store/runStore.ts -> src/game/playback/index.ts`
- 3-file cycle: `src/game/DiceSelectionSystem.ts -> src/game/store/runStore.ts -> src/game/store/types.ts -> src/game/DiceSelectionSystem.ts`
- 3-file cycle: `src/game/EquipmentEffects.ts -> src/game/effects/applyMutations.ts -> src/game/store/actions/consumableActions.ts -> src/game/EquipmentEffects.ts`
- 3-file cycle: `src/game/EquipmentEffects.ts -> src/game/effects/lifecycle/afterHandScored.ts -> src/game/store/actions/consumableActions.ts -> src/game/EquipmentEffects.ts`
- 3-file cycle: `src/game/EquipmentEffects.ts -> src/game/effects/lifecycle/onSell.ts -> src/game/store/actions/consumableActions.ts -> src/game/EquipmentEffects.ts`
- 3-file cycle: `src/game/EquipmentEffects.ts -> src/game/effects/lifecycle/onShopEnd.ts -> src/game/store/actions/consumableActions.ts -> src/game/EquipmentEffects.ts`
- 3-file cycle: `src/game/ConsumablesSystem.ts -> src/game/EquipmentEffects.ts -> src/game/effects/applyMutations.ts -> src/game/ConsumablesSystem.ts`
- 4-file cycle: `src/game/facade/gameFacade.ts -> src/game/facade/meta.ts -> src/game/store/index.ts -> src/game/facade/index.ts -> src/game/facade/gameFacade.ts`
- 4-file cycle: `src/game/facade/gameFacade.ts -> src/game/facade/pack.ts -> src/game/store/index.ts -> src/game/facade/index.ts -> src/game/facade/gameFacade.ts`

## Communities (100 total, 26 thin omitted)

### Community 0 - "App Shell & Scenes"
Cohesion: 0.07
Nodes (51): HandUpgradeAnimConfig, resolveTagDescription(), gameFacade, gameConfig, COLORS, FONTS, GAME, TAG_STACK (+43 more)

### Community 1 - "Store Actions & Selectors"
Cohesion: 0.08
Nodes (57): bossActions, consumableActions, diceActions, economyActions, equipment(), equipmentActions, permitActions, progressionActions (+49 more)

### Community 2 - "Types & Formatting"
Cohesion: 0.05
Nodes (28): BossDef, LayoutMode, DecimalSource, formatMult(), formatScientific(), formatScore(), formatScoreComponent(), RunStatusTrait (+20 more)

### Community 3 - "Game Scene Core"
Cohesion: 0.06
Nodes (13): playRollAnimation(), GameSceneDevPanel, gameRoundBackgroundPath(), gameRoundBackgroundTextureKey(), getRunRoundBackgroundIndex(), pickGameRoundBackgroundIndex(), ensureGameRoundBackgroundLoaded(), GameScene (+5 more)

### Community 5 - "Equipment & Tags"
Cohesion: 0.11
Nodes (47): getBossById(), TagDescriptionContext, COPY_INCOMPATIBLE_EFFECTS, EQUIPMENT_MODIFIER, createEquipmentInstance(), getEquipmentSellValue(), resetRunRng(), SerializedTagInstance (+39 more)

### Community 6 - "Serialization & Tooltips"
Cohesion: 0.07
Nodes (22): PackInstance, devLookupPermit(), deserializeEquipmentInstance(), deserializePackItem(), SerializedShopItem, serializeEquipmentInstance(), serializePackItem(), clearSceneCardTooltips() (+14 more)

### Community 7 - "Item Card UI"
Cohesion: 0.05
Nodes (5): CardBar, ClickAwayDismissOptions, hitIncludesObjectOrChild(), installClickAwayDismiss(), ItemCard

### Community 8 - "Shop Generation"
Cohesion: 0.07
Nodes (57): getProfessionById(), generateShopPacks(), SHOP_WEIGHTS, rollShopEquipmentPreview(), getItemAuraById(), applyAuraTagsToShopStock(), applyInjectTagsToShopStock(), AURA_TAG_IDS (+49 more)

### Community 9 - "Dev Modals & Catalog"
Cohesion: 0.07
Nodes (35): devGetAllBosses(), getGameplayPreferences(), BossTestModal, CatalogModalShell, CatalogModalShellOptions, CatalogPanelBounds, CatalogScrollBindings, CatalogScrollHandlers (+27 more)

### Community 10 - "Effect Registry"
Cohesion: 0.12
Nodes (20): findDeathPrevention(), EffectRegistry, registry, AdditiveEffectHandler, HeldDieEffectHandler, LifecycleHandler, LifecyclePhase, PerDieEffectHandler (+12 more)

### Community 11 - "Audio Preferences"
Cohesion: 0.08
Nodes (41): AudioPreferences, clamp01(), DEFAULT_AUDIO_PREFERENCES, getAudioPreferences(), initAudioPreferences(), normalizeAudio(), readFromStorage(), setAudioPreferences() (+33 more)

### Community 12 - "Round FSM Actions"
Cohesion: 0.10
Nodes (39): createInitialRound(), drawRandomHandIds(), patchRound(), requireRound(), roundActions, initRoundSession(), startRoundSession(), BeginRoundSessionOptions (+31 more)

### Community 13 - "Save/Load & RNG"
Cohesion: 0.08
Nodes (43): getRunSeed(), RunRngState, ACTIVE_SCENES, applySaveSnapshot(), buildSaveSnapshot(), BuildSaveSnapshotOptions, deserializeGameRound(), deserializeTags() (+35 more)

### Community 14 - "Dice Row Layout"
Cohesion: 0.06
Nodes (32): ANIM, DICE, MARQUEE, computeDiceSpacing(), DiceRowLayout, getArcOffset(), getRowXPositions(), PlayAreaDiceControllerDeps (+24 more)

### Community 15 - "Boss Effects"
Cohesion: 0.10
Nodes (41): getHandByType(), isBossEffectNegated(), applyBossAfterRoll(), applyBossAfterScore(), applyBossOnDayStart(), applyBossOnScore(), BossRoundConfigMods, BossScorePreview (+33 more)

### Community 16 - "Auto-Save Storage"
Cohesion: 0.10
Nodes (32): clearAutoSaveStorage(), clearPreviousAutoSaveStorage(), hasRunnableAutoSave(), readAutoSaveFromStorage(), readPreviousAutoSaveFromStorage(), readSnapshotFromKey(), snapshotContentKey(), writeAutoSaveToStorage() (+24 more)

### Community 17 - "Booster Pack Data"
Cohesion: 0.09
Nodes (40): getPackById(), PackCategory, PackDef, packs, PackTier, ALL_STICKERS, buildFrontierPackItem(), buildSupplyPackItem() (+32 more)

### Community 18 - "Scoring Pipeline"
Cohesion: 0.15
Nodes (37): createEmptyScoringMutations(), mergeMutations(), applyHolyAuraXMult(), dieMatchesParity(), dieMatchesPip(), forEachEquipmentScoring(), hasStackedDeck(), buildHeldRetriggerSources() (+29 more)

### Community 19 - "Booster Pack Scene"
Cohesion: 0.10
Nodes (4): getBonusPackPicks(), computeDiceRowEdgePad(), computeDiceRowLayout(), BoosterPackScene

### Community 20 - "Equipment Animations"
Cohesion: 0.11
Nodes (32): applyConsumableAnimEvents(), playConsumableAnimEvent(), playEquipmentCreatedPopIn(), animateEquipmentFireDestruction(), animateEquipmentFireDestructionParallel(), animateEquipmentFireDestructionSequence(), EquipmentFireDestruction, EquipmentFireDestructionOptions (+24 more)

### Community 21 - "Frontier & Item Defs"
Cohesion: 0.09
Nodes (25): FrontierDiceSelectionDef, FrontierEncounterDef, frontierEncounters, FrontierInstantEffect, FrontierInstantEffectType, EquipmentAlertType, HintSegment, ItemDef (+17 more)

### Community 23 - "Item Card Layout"
Cohesion: 0.11
Nodes (13): ItemDisplayResult, ItemCardBadges, ItemCardChrome, ItemCardContentResult, CardData, CardTextureSource, ItemCardLayout, ItemCardOptions (+5 more)

### Community 24 - "Score Math & Targets"
Cohesion: 0.15
Nodes (29): getBossDistanceMultiplier(), getBaseTargetMilesForLeg(), SHARED_EARLY, tableForDifficulty(), TARGET_MILES_BY_LEG_DEADLY_STRING, TARGET_MILES_BY_LEG_ROUGH_STRING, TARGET_MILES_BY_LEG_STRING, ceilScore() (+21 more)

### Community 25 - "Permits & Shop"
Cohesion: 0.10
Nodes (25): shopSceneActions, getPermitById(), PermitEffect, permits, PermitStage, devGrantPermit(), applyPermitEffectToRun(), generateShopPermit() (+17 more)

### Community 26 - "Pack Card Use Flow"
Cohesion: 0.12
Nodes (26): PackCardUseContext, PackCardUseOutcome, PackCardUseResult, resolvePackCardUse(), PackOpenResult, getPackDefById(), PackDefinition, PackItem (+18 more)

### Community 27 - "Hint Display System"
Cohesion: 0.13
Nodes (28): tooltipSegmentColors(), DisplayResolver, expandSegmentRowToTokens(), mergeAdjacentSegments(), segmentIsAtomic(), appendSegmentRow(), appendSpacer(), appendTextLine() (+20 more)

### Community 28 - "Consumables System"
Cohesion: 0.16
Nodes (30): applyRunInstantEffect(), bumpAllSellValues(), canBuyAndUseConsumableInShop(), canUseConsumableInShop(), ConsumableCategory, createAllHandUpgrades(), createConsumableInstance(), createTrailGuideConsumableDef() (+22 more)

### Community 29 - "Dice Enhancements"
Cohesion: 0.10
Nodes (19): DiceEnhancementDef, diceEnhancements, getDiceEnhancementById(), getEnhancementScoreDestroyChance(), CardTemplate, PipEnhancementDef, pipEnhancements, isDevMode() (+11 more)

### Community 30 - "Scene Layout Metrics"
Cohesion: 0.10
Nodes (25): clamp01(), computeDiceDisplayScale(), selectRoundTotalMiles(), bindGameObject(), DicePouch, CardBarMetrics, CardBarWidths, clamp01() (+17 more)

### Community 31 - "Dice Sprite Visuals"
Cohesion: 0.10
Nodes (5): getAuraPrimary(), DiceCardVisualResult, DiceSprite, setStickerOrbitOrientation(), setStickerOrbitPosition()

### Community 32 - "Dice & Item Auras"
Cohesion: 0.13
Nodes (21): DICE_AURA_ORDER, DiceAuraDef, diceAuras, getDiceAuraById(), EQUIPMENT_AURA_ORDER, getItemAuraDefById(), itemAuras, pickEquipmentAuraWeighted() (+13 more)

### Community 33 - "Playback Queue"
Cohesion: 0.16
Nodes (16): EquipmentModifierRoundResult, enqueueToastFeedback(), clearPlayback(), enqueuePlayback(), takePlayback(), ToastTone, enqueueConsumablePlayback(), enqueueDayEndDestructions() (+8 more)

### Community 34 - "Equipment Definitions"
Cohesion: 0.12
Nodes (24): active(), condition(), HAND_NAMES, HandsWithContainment, HintStyle, inactive(), items, miles() (+16 more)

### Community 35 - "Boss Equipment UI"
Cohesion: 0.15
Nodes (9): getBossEquipmentDisplayOrder(), isBossEquipmentHidden(), isBossEquipmentHintsHidden(), isEquipmentDisabledByBoss(), remapEquipmentDisplayOrderAfterReorder(), devGetAllAuras(), selectEquipmentBarSlotLabel(), selectEquipmentBarSnapshot() (+1 more)

### Community 36 - "Score Animations"
Cohesion: 0.12
Nodes (24): animateGrantToConsumableBar(), applyConsumableGrant(), DieAnimEventsConfig, ENHANCEMENT_NAMES, floatingText(), getSoundForType(), playAgainRetrigger(), playDieAnimEvents() (+16 more)

### Community 37 - "Trail Events Data"
Cohesion: 0.16
Nodes (23): writeConsumables(), getTrailEventById(), getTrailEventMinimumLeg(), TrailEventCategory, TrailEventChoice, TrailEventCondition, TrailEventConditionType, TrailEventDef (+15 more)

### Community 38 - "Effect Helpers"
Cohesion: 0.18
Nodes (13): applyEquipmentAuraForSlot(), applyEquipmentAuras(), findLowestHeldDieTarget(), handTypeMatches(), isLowestHeldDieTarget(), multiplyCtxXMult(), addScore(), resolveChance() (+5 more)

### Community 39 - "Difficulty & Stats"
Cohesion: 0.17
Nodes (20): DIFFICULTIES, GAMEPLAY, clearUserStatsStorage(), emptyStats(), getDifficultyBeatColor(), getDifficultyBeatStrokeColor(), getHighestDifficultyBeaten(), getHighestUnlockedDifficulty() (+12 more)

### Community 40 - "Trail Event Scene"
Cohesion: 0.14
Nodes (5): TrailEventSaveData, trailEventImageKey(), filterEquipmentEligibleForTrailSacrifice(), TrailEventScene, getSceneState()

### Community 41 - "Bosses & Hands"
Cohesion: 0.13
Nodes (20): BossEffectType, bosses, getEligibleBossesForLeg(), isFinisherLeg(), HandDef, buildHandResult(), buildResult(), createPouch() (+12 more)

### Community 42 - "Trail Event Logic"
Cohesion: 0.13
Nodes (22): applySpyglassAvoid(), applySpyglassInvestigate(), checkCondition(), eventHasEffect(), filterEventsByLeg(), filterStandoffBlockedEvents(), filterUnseenEvents(), findTrailRepairKit() (+14 more)

### Community 43 - "Run RNG & Packs"
Cohesion: 0.17
Nodes (19): PACK_EXCLUDED_SUPPLY_IDS, getRandomSupplyDef(), parseWeightSupplyFromParams(), buildStreamsFromSeed(), generateRunSeed(), getRunRngState(), initRunRng(), restoreRunRng() (+11 more)

### Community 44 - "Equipment Pool Gen"
Cohesion: 0.18
Nodes (21): getRandomFrontierDef(), getShopRandomFrontierDef(), EquipmentCatalogDef, getEquipmentDefById(), getEquipmentPool(), getItemAuraById(), applyRandomAura(), generateRandomEquipment() (+13 more)

### Community 45 - "Difficulty Select UI"
Cohesion: 0.14
Nodes (5): PlayerSaveData, DifficultyLevel, DifficultySelectScene, LegRoundPanelsConfig, RoundInfoConfig

### Community 46 - "Game Facade Modules"
Cohesion: 0.18
Nodes (14): BossRollUiState, gameBoss, gameConsumable, gameDice, gameDiceSelection, gameEquipment, gameMeta, gamePack (+6 more)

### Community 48 - "Equipment Lifecycle"
Cohesion: 0.19
Nodes (17): writeEquipment(), applyScoringMutations(), applyDestroy(), walkEquipmentLifecycle(), processEquipmentOnDayEnd(), processEquipmentOnDiceAdded(), processEquipmentOnDiceDestroyed(), processEquipmentOnPackOpened() (+9 more)

### Community 49 - "Aura Particles"
Cohesion: 0.19
Nodes (12): animateDieCrack(), ItemAura, ItemCardAuras, applyAuraGlow(), AURA_COLORS, AuraParticleResult, createAuraParticles(), createFireParticles() (+4 more)

### Community 51 - "Game & Round State"
Cohesion: 0.14
Nodes (6): GameRoundSaveData, SerializedGameRoundSaveData, GameConfig, RoundState, GameState, GameSetupResult

### Community 52 - "Store Subscriptions"
Cohesion: 0.14
Nodes (9): selectBalance(), SelectorSubscribeOptions, subscribeRoundSelector(), subscribeRunSelector(), subscribeSceneSelector(), createInitialRoundState(), roundStore, RoundStoreState (+1 more)

### Community 53 - "Tag Stack UI"
Cohesion: 0.18
Nodes (4): TrailTagInstance, groupTagsById(), selectTagStackModel(), TagStack

### Community 54 - "Shop Buy Actions"
Cohesion: 0.24
Nodes (12): shopBuyActions, ShopBuyFailReason, ShopBuyResult, acquireEquipmentInstance(), acquireRewardEquipmentInstance(), applyModifiersToEquipment(), getEquipmentPurchasePrice(), rollEquipmentModifiers() (+4 more)

### Community 55 - "Item Card Hints"
Cohesion: 0.21
Nodes (10): HintSize, ItemCardHints, RowMeasurement, getAuraHintRow(), getHintMetrics(), getSegmentSize(), getTooltipMetrics(), HINT_COLORS (+2 more)

### Community 56 - "Dice Selection UI"
Cohesion: 0.19
Nodes (3): DiceSelectionConfig, shouldUpdateDisplayedDiceValue(), GameConsumableTargetingController

### Community 57 - "Trail Event Assets"
Cohesion: 0.19
Nodes (9): computeCoverCrop(), computeCoverScale(), CoverCropResult, trailEventImagePath(), trailEventSpyImageKey(), trailEventSpyImagePath(), getAllTrailEvents(), PUBLIC (+1 more)

### Community 58 - "Card Tooltip Tracking"
Cohesion: 0.20
Nodes (5): ensureResizeHook(), resizeHookByScene, tooltipsByScene, trackCardTooltip(), ItemCardTooltip

### Community 59 - "Consumable Bar"
Cohesion: 0.17
Nodes (4): consumables(), ScoreAnimationConfig, resolveConsumableList(), ConsumableBar

### Community 60 - "Loaded Dice Effects"
Cohesion: 0.17
Nodes (15): LIFECYCLE_MIRROR_DOUBLES, CheckLoadedChanceOptions, EQUIPMENT_WALK_PRESETS, EquipmentWalkPolicy, formatLoadedDieOddsNote(), formatLoadedFaceOdds(), getLoadedFaceRollChance(), hasGamblersDiceCup() (+7 more)

### Community 61 - "Leg Round Panels"
Cohesion: 0.17
Nodes (15): selectBlindSizeMultiplier(), BOSS_PORTRAIT_SIZE, BOSS_PORTRAIT_TOP_GAP, computeLegRoundPanelGeometry(), createLegRoundPanels(), createLegRoundPanelsForPlayer(), getRoundColumnState(), LegRoundPanelGeometry (+7 more)

### Community 62 - "Dice Selection Picks"
Cohesion: 0.27
Nodes (4): getDiceSelectionMaxPicks(), getDiceSelectionMinPicks(), isDiceSelectionReady(), GameConsumableTargetingDeps

### Community 64 - "Run State Reads"
Cohesion: 0.21
Nodes (8): syncPawnBrokerSellValueFromStore(), processEquipmentOnSupplyUsed(), getRunDifficulty(), getRunEquipment(), getRunHandStats(), getRunProfessionId(), getRunState(), RunEconomyView

### Community 65 - "Dice Selection Effects"
Cohesion: 0.41
Nodes (12): pickDiceAuraWeighted(), applyAddSticker(), applyAura(), applyBumpValue(), applyClone(), applyCopy(), applyDiceSelectionEffect(), applyEnhance() (+4 more)

### Community 68 - "Die Scoring Patches"
Cohesion: 0.29
Nodes (10): applyDiceEnhancementMutations(), ScoringMutations, ScoringPipelineContext, setDieEnhancement(), HeldInHandResult, ScoreAnimEvent, applyPreScoringDiePatchImmediate(), DieScoringPatch (+2 more)

### Community 70 - "Action Tabs & HUD"
Cohesion: 0.24
Nodes (10): CardActionTabConfig, selectEffectiveDays(), selectEffectiveRerolls(), selectProfession(), selectCanUseSecondHelpings(), selectConsumableBarSlotLabel(), selectConsumableBarSnapshot(), selectLastUsedConsumableDef() (+2 more)

### Community 73 - "Equipment Modifiers"
Cohesion: 0.38
Nodes (8): getModifierHintRows(), getModifierTooltipLines(), ModifierTooltipLine, processEquipmentModifiersEndOfRound(), hasEquipmentModifier(), isEquipmentCursed(), isEquipmentLeased(), isEquipmentPerishable()

### Community 75 - "Hand Stats & Upgrades"
Cohesion: 0.29
Nodes (7): hands, applyBossTricksterDowngrade(), applyHandLevelUpgrade(), buildHandUpgradeInfo(), HandStats, prepareScoreSidebar(), selectHandStats()

### Community 76 - "Core Die Types"
Cohesion: 0.22
Nodes (9): InstantEffect, DiceSelectionState, ScoringContext, SerializedPackItem, Die, DiceSpriteEntry, StoredPackItem, DiceVisualGroup (+1 more)

### Community 77 - "Payout Scene"
Cohesion: 0.31
Nodes (3): PayoutScene, presentationToView(), PayoutBreakdown

### Community 80 - "Trail Round Effects"
Cohesion: 0.46
Nodes (7): syncTrailRoundEffectsOnRestore(), RunStatusTraitPolarity, selectRunStatusTraits(), getPlayerTrailDebuffLines(), getTrailDebuffLines(), hasActiveTrailRoundEffects(), trailRoundEffectsFromModifiers()

### Community 81 - "Enhancement Payouts"
Cohesion: 0.54
Nodes (4): enhancementCountsAsGold(), enhancementCountsAsSteel(), enhancementHeldGoldPayout(), enhancementMatchesTarget()

### Community 83 - "Action Tabs Layout"
Cohesion: 0.25
Nodes (5): ActionTabInstance, ActionTabsLayout, ActionTabsOptions, SideTabCorners, SideTabDirection

### Community 86 - "Professions Data"
Cohesion: 0.33
Nodes (5): ProfessionModifiers, professions, ProfessionSpecialEquipment, ProfessionStartingEnhancement, ProfessionStartingSupplyCard

### Community 87 - "Lifecycle Orchestrators"
Cohesion: 0.33
Nodes (4): COPY_WIRED_SOURCES, GAME_ROOT, LIFECYCLE_ORCHESTRATORS, ROUND_BOUNDARY_ORCHESTRATORS

## Knowledge Gaps
- **205 isolated node(s):** `IRefPhaserGame`, `IProps`, `bosses`, `diceAuras`, `diceEnhancements` (+200 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **26 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `getRunState()` connect `Run State Reads` to `App Shell & Scenes`, `Store Actions & Selectors`, `Types & Formatting`, `Game Scene Core`, `Misc Utilities`, `Equipment & Tags`, `Serialization & Tooltips`, `Shop Generation`, `Effect Registry`, `Round FSM Actions`, `Save/Load & RNG`, `Boss Effects`, `Auto-Save Storage`, `Booster Pack Data`, `Scoring Pipeline`, `Booster Pack Scene`, `Equipment Animations`, `Item Card Layout`, `Score Math & Targets`, `Permits & Shop`, `Pack Card Use Flow`, `Consumables System`, `Dice Enhancements`, `Scene Layout Metrics`, `Dice & Item Auras`, `Playback Queue`, `Trail Events Data`, `Effect Helpers`, `Trail Event Scene`, `Bosses & Hands`, `Trail Event Logic`, `Difficulty Select UI`, `Game Facade Modules`, `Cluster 47`, `Equipment Lifecycle`, `Game & Round State`, `Store Subscriptions`, `Shop Buy Actions`, `Dice Selection UI`, `Leg Round Panels`, `Dice Selection Effects`, `Cluster 66`, `Die Scoring Patches`, `Action Tabs & HUD`, `Cluster 71`, `Cluster 72`, `Hand Stats & Upgrades`, `Payout Scene`, `Cluster 78`, `Trail Round Effects`, `Enhancement Payouts`, `Cluster 82`?**
  _High betweenness centrality (0.133) - this node is a cross-community bridge._
- **Why does `PlayerState` connect `Cluster 22` to `Store Actions & Selectors`, `Types & Formatting`, `Misc Utilities`, `Equipment & Tags`, `Effect Registry`, `Hand Stats & Upgrades`, `Core Die Types`, `Difficulty Select UI`, `Cluster 82`, `Game & Round State`, `Store Subscriptions`, `Cluster 84`, `Tag Stack UI`, `Pack Card Use Flow`, `Cluster 92`, `Cluster 94`, `Cluster 95`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `Die` connect `Core Die Types` to `App Shell & Scenes`, `Store Actions & Selectors`, `Misc Utilities`, `Equipment & Tags`, `Serialization & Tooltips`, `Shop Generation`, `Effect Registry`, `Round FSM Actions`, `Save/Load & RNG`, `Dice Row Layout`, `Boss Effects`, `Booster Pack Data`, `Scoring Pipeline`, `Booster Pack Scene`, `Frontier & Item Defs`, `Score Math & Targets`, `Pack Card Use Flow`, `Dice Enhancements`, `Dice Sprite Visuals`, `Score Animations`, `Trail Events Data`, `Effect Helpers`, `Bosses & Hands`, `Difficulty Select UI`, `Game Facade Modules`, `Equipment Lifecycle`, `Store Subscriptions`, `Shop Buy Actions`, `Dice Selection UI`, `Dice Selection Picks`, `Cluster 63`, `Dice Selection Effects`, `Cluster 66`, `Cluster 67`, `Die Scoring Patches`, `Cluster 93`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **What connects `IRefPhaserGame`, `IProps`, `bosses` to the rest of the system?**
  _205 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `App Shell & Scenes` be split into smaller, more focused modules?**
  _Cohesion score 0.06767109295199183 - nodes in this community are weakly interconnected._
- **Should `Store Actions & Selectors` be split into smaller, more focused modules?**
  _Cohesion score 0.07531645569620253 - nodes in this community are weakly interconnected._
- **Should `Types & Formatting` be split into smaller, more focused modules?**
  _Cohesion score 0.051582278481012656 - nodes in this community are weakly interconnected._