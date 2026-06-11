// ─── Score animation timings panel (HTML inputs) ───

import type { Scene } from 'phaser';
import { FONTS, TEXT_COLORS } from '../../../game/Constants';
import {
  DEFAULT_SCORE_ANIM_TIMINGS,
  getScoreAnimTimings,
  patchScoreAnimTimings,
  SCORE_ANIM_TIMING_GROUPS,
  type ScoreAnimTimings,
} from '../../../game/ScoreAnimTimings';

export interface ScoreAnimTimingsPanelBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

type PanelRow = {
  key: keyof ScoreAnimTimings;
  input: HTMLInputElement;
};

const MUTED = '#9a9ab0';
const LABEL = '#e0e0ec';
const SECTION = '#e8c547';
const BORDER = '#3a3a55';
const DEFAULT_HINT = '#7ab87a';

function formatTimingDefault(key: keyof ScoreAnimTimings, unit?: string): string {
  const value = DEFAULT_SCORE_ANIM_TIMINGS[key];
  if (unit) return `Default: ${value} ${unit}`;
  return `Default: ${value}`;
}

export class ScoreAnimTimingsPanel {
  private readonly scene: Scene;
  private readonly container: HTMLDivElement;
  private readonly scroll: HTMLDivElement;
  private readonly rows: PanelRow[] = [];
  private bounds: ScoreAnimTimingsPanelBounds;
  private resizeHandler: (() => void) | null = null;

  constructor(scene: Scene, bounds: ScoreAnimTimingsPanelBounds) {
    this.scene = scene;
    this.bounds = bounds;

    const parent = scene.game.canvas.parentElement ?? document.body;
    this.container = document.createElement('div');
    this.container.style.position = 'absolute';
    this.container.style.boxSizing = 'border-box';
    this.container.style.background = 'rgba(12, 12, 24, 0.94)';
    this.container.style.border = `1px solid ${BORDER}`;
    this.container.style.borderRadius = '8px';
    this.container.style.padding = '10px 10px 8px';
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.zIndex = '20';
    this.container.style.pointerEvents = 'auto';

    const title = document.createElement('div');
    title.textContent = 'Score animation timings';
    title.style.fontFamily = FONTS.HEADING;
    title.style.fontSize = '15px';
    title.style.color = SECTION;
    title.style.marginBottom = '4px';
    this.container.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.textContent =
      'Changes save automatically. Groups are ordered by how often you’ll touch them during a hand.';
    subtitle.style.fontFamily = FONTS.PRIMARY;
    subtitle.style.fontSize = '12px';
    subtitle.style.color = MUTED;
    subtitle.style.lineHeight = '1.35';
    subtitle.style.marginBottom = '10px';
    this.container.appendChild(subtitle);

    this.scroll = document.createElement('div');
    this.scroll.style.flex = '1';
    this.scroll.style.minHeight = '0';
    this.scroll.style.overflowY = 'auto';
    this.scroll.style.paddingRight = '6px';
    this.container.appendChild(this.scroll);

    for (const group of SCORE_ANIM_TIMING_GROUPS) {
      this.appendGroup(group.title, group.blurb, group.fields);
    }

    parent.appendChild(this.container);
    this.syncInputsFromStore();
    this.applyBounds();

    this.resizeHandler = () => this.applyBounds();
    this.scene.scale.on('resize', this.resizeHandler);
    this.scene.events.once('shutdown', () => this.destroy());
  }

  setBounds(bounds: ScoreAnimTimingsPanelBounds): void {
    this.bounds = bounds;
    this.applyBounds();
  }

  refreshInputs(): void {
    this.syncInputsFromStore();
  }

  resetToDefaults(): void {
    patchScoreAnimTimings({ ...DEFAULT_SCORE_ANIM_TIMINGS });
    this.syncInputsFromStore();
  }

  destroy(): void {
    if (this.resizeHandler) {
      this.scene.scale.off('resize', this.resizeHandler);
      this.resizeHandler = null;
    }
    this.container.remove();
  }

  private appendGroup(
    title: string,
    blurb: string | undefined,
    fields: (typeof SCORE_ANIM_TIMING_GROUPS)[number]['fields'],
  ): void {
    const section = document.createElement('section');
    section.style.marginBottom = '14px';
    section.style.paddingBottom = '10px';
    section.style.borderBottom = `1px solid ${BORDER}`;

    const heading = document.createElement('div');
    heading.textContent = title;
    heading.style.fontFamily = FONTS.HEADING;
    heading.style.fontSize = '13px';
    heading.style.fontWeight = '700';
    heading.style.color = SECTION;
    heading.style.marginBottom = blurb ? '4px' : '8px';
    section.appendChild(heading);

    if (blurb) {
      const intro = document.createElement('div');
      intro.textContent = blurb;
      intro.style.fontFamily = FONTS.PRIMARY;
      intro.style.fontSize = '11px';
      intro.style.color = MUTED;
      intro.style.lineHeight = '1.4';
      intro.style.marginBottom = '8px';
      section.appendChild(intro);
    }

    for (const field of fields) {
      section.appendChild(this.createFieldRow(field.key, field.title, field.description, field.unit));
    }

    this.scroll.appendChild(section);
  }

  private createFieldRow(
    key: keyof ScoreAnimTimings,
    title: string,
    description: string,
    unit?: string,
  ): HTMLDivElement {
    const row = document.createElement('div');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '1fr 76px';
    row.style.gap = '6px 10px';
    row.style.alignItems = 'start';
    row.style.marginBottom = '10px';
    row.style.padding = '8px';
    row.style.borderRadius = '6px';
    row.style.background = 'rgba(255, 255, 255, 0.03)';

    const textCol = document.createElement('div');

    const titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.alignItems = 'baseline';
    titleRow.style.gap = '6px';
    titleRow.style.flexWrap = 'wrap';

    const label = document.createElement('div');
    label.textContent = title;
    label.style.fontFamily = FONTS.PRIMARY;
    label.style.fontSize = '13px';
    label.style.fontWeight = '600';
    label.style.color = LABEL;
    label.style.lineHeight = '1.25';
    titleRow.appendChild(label);

    const keyHint = document.createElement('code');
    keyHint.textContent = key;
    keyHint.style.fontFamily = 'monospace';
    keyHint.style.fontSize = '10px';
    keyHint.style.color = '#6e6e88';
    keyHint.style.wordBreak = 'break-all';
    titleRow.appendChild(keyHint);

    textCol.appendChild(titleRow);

    const help = document.createElement('div');
    help.textContent = description;
    help.style.fontFamily = FONTS.PRIMARY;
    help.style.fontSize = '11px';
    help.style.color = MUTED;
    help.style.lineHeight = '1.4';
    help.style.marginTop = '4px';
    textCol.appendChild(help);

    const defaultHint = document.createElement('div');
    defaultHint.textContent = formatTimingDefault(key, unit);
    defaultHint.style.fontFamily = FONTS.PRIMARY;
    defaultHint.style.fontSize = '11px';
    defaultHint.style.fontWeight = '600';
    defaultHint.style.color = DEFAULT_HINT;
    defaultHint.style.lineHeight = '1.35';
    defaultHint.style.marginTop = '4px';
    textCol.appendChild(defaultHint);

    row.appendChild(textCol);

    const inputWrap = document.createElement('div');
    inputWrap.style.display = 'flex';
    inputWrap.style.flexDirection = 'column';
    inputWrap.style.alignItems = 'stretch';
    inputWrap.style.gap = '3px';

    const input = document.createElement('input');
    input.type = 'number';
    input.step = 'any';
    input.title = key;
    input.style.width = '100%';
    input.style.boxSizing = 'border-box';
    input.style.padding = '5px 6px';
    input.style.border = '1px solid #555577';
    input.style.borderRadius = '4px';
    input.style.background = '#1a1a2e';
    input.style.color = TEXT_COLORS.PRIMARY;
    input.style.fontFamily = 'monospace';
    input.style.fontSize = '12px';

    if (unit) {
      const unitLabel = document.createElement('div');
      unitLabel.textContent = unit;
      unitLabel.style.fontFamily = FONTS.PRIMARY;
      unitLabel.style.fontSize = '10px';
      unitLabel.style.color = '#6e6e88';
      unitLabel.style.textAlign = 'center';
      inputWrap.appendChild(input);
      inputWrap.appendChild(unitLabel);
    } else {
      inputWrap.appendChild(input);
    }

    const applyValue = () => {
      const parsed = Number(input.value);
      if (!Number.isFinite(parsed)) {
        input.value = String(getScoreAnimTimings()[key]);
        return;
      }
      patchScoreAnimTimings({ [key]: parsed });
    };

    input.addEventListener('change', applyValue);
    input.addEventListener('blur', applyValue);

    row.appendChild(inputWrap);
    this.rows.push({ key, input });
    return row;
  }

  private syncInputsFromStore(): void {
    const timings = getScoreAnimTimings();
    for (const row of this.rows) {
      row.input.value = String(timings[row.key]);
    }
  }

  private applyBounds(): void {
    const parent = this.scene.game.canvas.parentElement ?? document.body;
    const containerRect = parent.getBoundingClientRect();
    const canvasRect = this.scene.game.canvas.getBoundingClientRect();

    this.container.style.left = `${canvasRect.left - containerRect.left + this.bounds.x}px`;
    this.container.style.top = `${canvasRect.top - containerRect.top + this.bounds.y}px`;
    this.container.style.width = `${this.bounds.width}px`;
    this.container.style.height = `${this.bounds.height}px`;
  }
}
