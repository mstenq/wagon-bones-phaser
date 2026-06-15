// Keeps CSS custom properties in sync with visualViewport so #app padding
// clears mobile browser chrome (tab bars, etc.) in addition to env(safe-area-inset-*).

function updateVisualViewportInsets(): void {
  const root = document.documentElement;
  const vv = window.visualViewport;
  if (!vv) {
    root.style.setProperty('--vv-inset-top', '0px');
    root.style.setProperty('--vv-inset-bottom', '0px');
    root.style.setProperty('--vv-inset-left', '0px');
    root.style.setProperty('--vv-inset-right', '0px');
    return;
  }

  const top = Math.max(0, Math.round(vv.offsetTop));
  const left = Math.max(0, Math.round(vv.offsetLeft));
  const bottom = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  const right = Math.max(0, Math.round(window.innerWidth - vv.width - vv.offsetLeft));

  root.style.setProperty('--vv-inset-top', `${top}px`);
  root.style.setProperty('--vv-inset-bottom', `${bottom}px`);
  root.style.setProperty('--vv-inset-left', `${left}px`);
  root.style.setProperty('--vv-inset-right', `${right}px`);
}

function notifyLayoutChange(): void {
  updateVisualViewportInsets();
  window.dispatchEvent(new Event('resize'));
}

export function initViewportInsets(): void {
  notifyLayoutChange();

  window.visualViewport?.addEventListener('resize', notifyLayoutChange);
  window.visualViewport?.addEventListener('scroll', notifyLayoutChange);
  window.addEventListener('resize', updateVisualViewportInsets);
  window.addEventListener('orientationchange', notifyLayoutChange);
}
