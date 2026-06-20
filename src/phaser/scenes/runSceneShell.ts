// ─── Run scene shell ───
// Shared layout, consumable bar, and playback wiring for run scenes.

import type { Scene } from 'phaser';
import type Phaser from 'phaser';
import { gameFacade } from '../../game/facade';
import type { ConsumableDef, ConsumableInstance, UseConsumableResult } from '../../game/facade/consumable';
import { canUseConsumableInShop } from '../../game/facade/consumable';
import { createLayout, type LayoutOptions, type LayoutResult } from '../ui/SceneLayout';
import { bindPlaybackRunner, type PlaybackRunnerHandle } from '../playback/PlaybackRunner';
import type { PlaybackHandlerContext } from '../playback/handlers';
import { handleStandardConsumableResult } from './consumableResult';

export type RunScenePlaybackOptions = Partial<
  Omit<PlaybackHandlerContext, 'scene' | 'equipBar' | 'consumableBar' | 'sidebar'>
>;

export interface RunSceneShellOptions {
  layout?: LayoutOptions;
  consumableReturnScene: string;
  canUseConsumable?: (def: ConsumableDef) => boolean;
  playback?: RunScenePlaybackOptions;
  /** When false, failed consumable use skips the floating failure popup (dice-selection redirect still runs). */
  showConsumableFailurePopup?: boolean;
  consumableCancelAnchor?: () => { x: number; y: number };
  consumableFailureSound?: () => void;
  /** Full override for consumable-used handling (skips default use + result routing). */
  onConsumableUsed?: (consumed: ConsumableInstance) => void;
  /** When false, caller must call destroy() (e.g. layout rebuilt without scene restart). Default true. */
  autoDestroyOnShutdown?: boolean;
}

export interface RunSceneShell {
  layout: LayoutResult;
  playbackRunner: PlaybackRunnerHandle;
  handleConsumableResult: (result: UseConsumableResult) => void;
  destroy: () => void;
}

function consumableBarAnchor(layout: LayoutResult): { x: number; y: number } {
  const bar = layout.consumableBar;
  return { x: bar.x + bar.width / 2, y: bar.y };
}

/** Bind playback runner with the same defaults as legacy scene binding. */
export function bindRunScenePlayback(
  scene: Scene,
  bars: Pick<LayoutResult, 'equipBar' | 'consumableBar' | 'sidebar'>,
  playback?: RunScenePlaybackOptions,
): PlaybackRunnerHandle {
  return bindPlaybackRunner(scene, {
    scene,
    equipBar: bars.equipBar,
    consumableBar: bars.consumableBar,
    sidebar: bars.sidebar,
    getDiceSprites: playback?.getDiceSprites ?? (() => []),
    destroyDice: playback?.destroyDice ?? (async () => {}),
    scoreLayoutGate: playback?.scoreLayoutGate ?? null,
    setAnimating: playback?.setAnimating ?? (() => {}),
    onDiceAdded: playback?.onDiceAdded ?? (() => {}),
    onScoreComplete: playback?.onScoreComplete ?? (() => {}),
    onScoreAnimStart: playback?.onScoreAnimStart,
    onScoreAnimEnd: playback?.onScoreAnimEnd,
    registerScoreAnimSkip: playback?.registerScoreAnimSkip,
    showFloatingText: playback?.showFloatingText,
    getTagEarnedOrigin: playback?.getTagEarnedOrigin,
    getTagStackAnchor: playback?.getTagStackAnchor,
  });
}

function destroyGameObjectIfActive(obj: Phaser.GameObjects.GameObject): void {
  if (obj.scene) {
    obj.destroy();
  }
}

/** Tear down shared run-scene chrome before rebuilding layout. */
export function destroyRunSceneLayout(layout: LayoutResult): void {
  destroyGameObjectIfActive(layout.tagStack);
  destroyGameObjectIfActive(layout.dicePouch);
  destroyGameObjectIfActive(layout.consumableBar);
  destroyGameObjectIfActive(layout.equipBar);
  destroyGameObjectIfActive(layout.sidebar);
}

export function createRunSceneShell(scene: Scene, options: RunSceneShellOptions): RunSceneShell {
  const layout = createLayout(scene, options.layout);
  const canUse = options.canUseConsumable ?? canUseConsumableInShop;
  layout.consumableBar.setCanUsePredicate(canUse);

  const playbackRunner = bindRunScenePlayback(scene, layout, options.playback);

  const showFailurePopup = options.showConsumableFailurePopup ?? true;
  const getAnchor = options.consumableCancelAnchor ?? (() => consumableBarAnchor(layout));
  const failureSound =
    options.consumableFailureSound ??
    (() => {
      scene.sound.play('sfx_cancel', { volume: 0.5 });
    });

  const handleConsumableResult = (result: UseConsumableResult) => {
    const failurePopup = showFailurePopup
      ? {
          x: getAnchor().x,
          y: getAnchor().y,
          sound: failureSound,
        }
      : undefined;
    handleStandardConsumableResult(scene, layout.sidebar, result, options.consumableReturnScene, failurePopup);
  };

  const onConsumableUsed =
    options.onConsumableUsed ??
    ((consumed: ConsumableInstance) => {
      const result = gameFacade.consumable.use(consumed);
      handleConsumableResult(result);
    });

  layout.consumableBar.on('consumable-used', onConsumableUsed);

  let destroyed = false;
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    layout.consumableBar.off('consumable-used', onConsumableUsed);
    playbackRunner.unbind();
    destroyRunSceneLayout(layout);
  };

  if (options.autoDestroyOnShutdown !== false) {
    scene.events.once('shutdown', destroy);
  }

  return { layout, playbackRunner, handleConsumableResult, destroy };
}
