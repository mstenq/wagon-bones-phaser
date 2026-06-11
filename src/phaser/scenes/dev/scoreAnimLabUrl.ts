// ─── Score Anim Lab URL gate (?animlab=true) ───

let scoreAnimLabUrlEnabled = false;

/** Read ?animlab=true from the page URL (call once at app bootstrap). */
export function initScoreAnimLabFromUrl(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  scoreAnimLabUrlEnabled = params.get('animlab') === 'true';
}

/** Test-only override for URL anim lab flag. */
export function setScoreAnimLabUrlForTests(enabled: boolean): void {
  scoreAnimLabUrlEnabled = enabled;
}

export function isScoreAnimLabUrl(): boolean {
  return scoreAnimLabUrlEnabled;
}
