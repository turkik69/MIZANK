/* One puppy, one home, and a non-interactive roaming layer shared by every page. */
'use strict';
const puppyRuntime = { step: 0, interval: null, returnTimer: null, layoutTimer: null, awayUntil: 0, lastInput: 0, lastReaction: 0 };

function puppyOverlap(a, b) {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

function puppyChooseSpot({ width, height, size, blocked = [], preferred = 0, safeTop = 0, safeBottom = 0, safeLeft = 0, safeRight = 0 }) {
  if (width < size.width + 24 || height < size.height + 110) return null;
  const left = Math.max(12, safeLeft + 8), right = width - size.width - Math.max(12, safeRight + 8), top = Math.max(20, safeTop + 8);
  const bottom = height - size.height - Math.max(94, safeBottom + 80);
  if (right < left || bottom < top) return null;
  const middle = Math.max(top, Math.round((top + bottom) / 2));
  const candidates = [{ x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }, { x: left, y: top }, { x: left, y: middle }, { x: right, y: middle }];
  for (let offset = 0; offset < candidates.length; offset++) {
    const position = candidates[(preferred + offset) % candidates.length];
    const padded = { x: position.x - 16, y: position.y - 16, width: size.width + 32, height: size.height + 32 };
    if (blocked.every(rect => puppyOverlap(padded, rect) === 0)) return position;
  }
  return null; // A busy form takes priority over the decorative character.
}

function puppyViewport() {
  const visual = window.visualViewport;
  const marker = document.getElementById('puppy-safe-area');
  const padding = marker && window.getComputedStyle?.(marker);
  return { width: visual?.width || window.innerWidth || 390, height: visual?.height || window.innerHeight || 844,
    offsetX: visual?.offsetLeft || 0, offsetY: visual?.offsetTop || 0,
    safeTop: parseFloat(padding?.paddingTop) || 0, safeBottom: parseFloat(padding?.paddingBottom) || 0,
    safeLeft: parseFloat(padding?.paddingLeft) || 0, safeRight: parseFloat(padding?.paddingRight) || 0 };
}

function puppyHomeVisible(height = puppyViewport().height) {
  if (document.body?.dataset.view !== 'dashboard') return false;
  const home = document.getElementById('mizo-hero');
  const rect = home?.getBoundingClientRect?.();
  return !!rect && rect.width > 0 && rect.bottom > 70 && rect.top < height * .75;
}

function puppyBlockedRects() {
  const modal = document.querySelector?.('.modal-overlay.active');
  const surface = modal || document.querySelector?.('.screen.active') || document;
  const controls = [...surface.querySelectorAll('button, input, textarea, select, [role="button"]')];
  const active = document.activeElement;
  if (active && (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(active.tagName) || active.isContentEditable)) controls.push(active);
  if (!modal) {
    const nav = document.getElementById('bottom-nav');
    if (nav) controls.push(nav);
  }
  return controls.filter(element => !element.closest?.('[data-mizo-card], #puppy-roamer')).map(element => element.getBoundingClientRect?.()).filter(rect => rect && rect.width > 0 && rect.height > 0).map(rect => ({ x: rect.left, y: rect.top, width: rect.width, height: rect.height }));
}

function syncPuppyLoop(moving) {
  if (moving && !puppyRuntime.interval) puppyRuntime.interval = setInterval(puppyTick, 9000);
  if (!moving && puppyRuntime.interval) { clearInterval(puppyRuntime.interval); puppyRuntime.interval = null; }
}

function renderPuppyRoamer(view, motion) {
  const roamer = document.getElementById('puppy-roamer');
  if (!roamer || !document.body) return;
  const preferences = mizoPreferences();
  syncPuppyLoop(preferences.enabled && motion && !document.hidden);
  if (!preferences.enabled || document.hidden) {
    roamer.hidden = true; document.body.dataset.puppyRoaming = 'false'; return;
  }
  const viewport = puppyViewport();
  const atHome = puppyHomeVisible(viewport.height) && Date.now() >= puppyRuntime.awayUntil && !document.querySelector?.('.modal-overlay.active');
  if (atHome) { roamer.hidden = true; document.body.dataset.puppyRoaming = 'false'; return; }
  const hasMessage = mizoRuntime.pending.size > 0 || Date.now() < mizoRuntime.until;
  const size = hasMessage ? { width: 170, height: 166 } : { width: 96, height: 108 };
  const blocked = puppyBlockedRects().map(rect => ({ ...rect, x: rect.x - viewport.offsetX, y: rect.y - viewport.offsetY }));
  const position = puppyChooseSpot({ ...viewport, size, blocked, preferred: puppyRuntime.step % 4 });
  if (!position) { roamer.hidden = true; document.body.dataset.puppyRoaming = 'false'; return; }
  roamer.hidden = false; document.body.dataset.puppyRoaming = 'true';
  roamer.dataset.state = view.state; roamer.dataset.motion = motion ? 'on' : 'off';
  roamer.dataset.dance = motion && !mizoRuntime.pending.size && Date.now() < mizoRuntime.danceUntil ? mizoRuntime.danceVariant : 'none';
  const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  roamer.dataset.editing = editing ? 'true' : 'false';
  roamer.style.setProperty('--puppy-x', `${position.x + viewport.offsetX}px`);
  roamer.style.setProperty('--puppy-y', `${position.y + viewport.offsetY}px`);
  roamer.style.setProperty('--puppy-width', `${size.width}px`);
  const bubble = document.getElementById('puppy-roamer-message');
  if (bubble) { bubble.hidden = !hasMessage; bubble.textContent = view.message; }
}

function renderPuppyFromCurrentState() {
  const motion = mizoPreferences().motion && !mizoReducedMotion?.matches && !document.hidden;
  renderPuppyRoamer(mizoView(appState, { event: mizoRuntime.event, until: mizoRuntime.until, pending: mizoRuntime.pending.size, previousVisit: mizoRuntime.previousVisit }), motion);
}

function puppyTick() {
  if (!mizoPreferences().enabled || !mizoPreferences().motion || mizoReducedMotion?.matches || document.hidden) return;
  // Let the puppy stay in its house most of the time, with occasional short outings.
  const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  if (editing) return;
  puppyRuntime.step += 1;
  if (puppyHomeVisible() && puppyRuntime.step % 3 === 0) {
    puppyRuntime.awayUntil = Date.now() + 6500;
    if (puppyRuntime.returnTimer) clearTimeout(puppyRuntime.returnTimer);
    puppyRuntime.returnTimer = setTimeout(() => { puppyRuntime.awayUntil = 0; renderPuppyFromCurrentState(); }, 6500);
  }
  renderPuppyFromCurrentState();
}

function puppyReact(type) {
  if (Date.now() - puppyRuntime.lastReaction > 500) puppyRuntime.step += 1;
  puppyRuntime.lastReaction = Date.now();
}

function puppyOnInput(event) {
  if (!['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName)) return;
  if (!mizoPreferences().enabled || Date.now() - puppyRuntime.lastInput < 1400) return;
  puppyRuntime.lastInput = Date.now();
  mizoReact('input'); // Never read, store, echo, or transmit the field's contents.
}

function puppyOnToast(type) {
  if (!mizoPreferences().enabled) return;
  if (type === 'success') mizoReact('saved');
  else if (type === 'error' || type === 'warning') mizoReact('retry');
}

function schedulePuppyLayout() {
  if (puppyRuntime.layoutTimer) clearTimeout(puppyRuntime.layoutTimer);
  puppyRuntime.layoutTimer = setTimeout(() => { puppyRuntime.layoutTimer = null; renderPuppyFromCurrentState(); }, 100);
}

document.addEventListener('input', puppyOnInput, true);
document.addEventListener('change', puppyOnInput, true);
document.addEventListener('focusin', schedulePuppyLayout);
document.addEventListener('focusout', schedulePuppyLayout);
document.addEventListener('scroll', schedulePuppyLayout, { passive: true, capture: true });
window.addEventListener('resize', schedulePuppyLayout);
window.visualViewport?.addEventListener('resize', schedulePuppyLayout);
window.visualViewport?.addEventListener('scroll', schedulePuppyLayout);
window.addEventListener('load', renderPuppyFromCurrentState);
