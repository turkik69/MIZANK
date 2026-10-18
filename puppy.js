/* One puppy, one home, and a non-interactive roaming layer shared by every page. */
'use strict';
const puppyRuntime = { step: 0, interval: null, returnTimer: null, layoutTimer: null, awayUntil: 0, lastInput: 0, lastReaction: 0,
  position: null, placedStep: null, travelUntil: 0, travelTimer: null, trailTimer: null, facing: 'right' };

function clearPuppyFootprints() {
  if (puppyRuntime.trailTimer) clearTimeout(puppyRuntime.trailTimer);
  puppyRuntime.trailTimer = null;
  const layer = document.getElementById('puppy-footprints');
  if (layer) layer.innerHTML = '';
}

function puppyFootprintPlan(from, to, duration, anchor = {x:48,y:86}) {
  const dx = to.x-from.x, dy = to.y-from.y, distance = Math.hypot(dx,dy);
  if (distance < 20 || duration <= 0) return [];
  const angle = Math.atan2(dy,dx)*180/Math.PI+90;
  const steps = [];
  // Match the 240ms footfalls of the walking cycle, with alternating paw tracks.
  for (let delay=240, i=0; delay<duration && i<8; delay+=240,i++) {
    const fraction = Math.max(0,(delay-65)/duration), side = i%2 ? 5 : -5;
    steps.push({x:from.x+dx*fraction+anchor.x-dy/distance*side,
      y:from.y+dy*fraction+anchor.y+dx/distance*side, angle, delay});
  }
  return steps;
}

function showPuppyFootprints(from, to, duration) {
  clearPuppyFootprints();
  const layer = document.getElementById('puppy-footprints');
  const roamer = document.getElementById('puppy-roamer');
  if (!layer || !roamer || document.hidden || !mizoPreferences().motion || mizoReducedMotion?.matches) return;
  const body = roamer.querySelector('.mizo-puppy')?.getBoundingClientRect();
  const root = roamer.getBoundingClientRect();
  const anchor = body?.width ? {x:body.left-root.left+body.width/2,y:body.bottom-root.top-5} : undefined;
  const marks = puppyFootprintPlan(from,to,duration,anchor);
  layer.innerHTML = marks.map(mark => `<span class="puppy-pawprint" style="left:${mark.x.toFixed(1)}px;top:${mark.y.toFixed(1)}px;--paw-angle:${mark.angle.toFixed(1)}deg;animation-delay:${mark.delay}ms"></span>`).join('');
  if (marks.length) puppyRuntime.trailTimer = setTimeout(clearPuppyFootprints,duration+1700);
}

// Poses change the legs and body in the atlas, independently of position changes.
function puppyPose(motion, now = Date.now()) {
  if (!motion || document.hidden || mizoRuntime.pending.size) return 'stand';
  if (now < puppyRuntime.travelUntil) return 'walk';
  if (now < mizoRuntime.danceUntil) return 'jump';
  return 'idle';
}

function syncPuppyPose(motion) {
  const pose = puppyPose(motion);
  document.querySelectorAll('[data-mizo-card]').forEach(host => { host.dataset.pose = pose; });
  const roamer = document.getElementById('puppy-roamer');
  if (roamer) { roamer.dataset.pose = pose; roamer.dataset.facing = puppyRuntime.facing; }
}

function stopPuppyTravel() {
  if (typeof stopMizoSteps === 'function') stopMizoSteps();
  clearPuppyFootprints();
  if (puppyRuntime.travelTimer) clearTimeout(puppyRuntime.travelTimer);
  puppyRuntime.travelTimer = null;
  puppyRuntime.travelUntil = 0;
  puppyRuntime.position = null;
}

function trackPuppyTravel(position, moving, wasHidden) {
  const previous = puppyRuntime.position;
  const changed = previous && Math.hypot(position.x - previous.x, position.y - previous.y) > 2;
  if (moving && !wasHidden && changed) {
    if (position.x !== previous.x) puppyRuntime.facing = position.x < previous.x ? 'left' : 'right';
    // A fixed walking speed avoids slow glides across short distances.
    const duration = puppyTravelDuration(previous, position);
    showPuppyFootprints(previous, position, duration);
    if (typeof queueMizoSteps === 'function') queueMizoSteps(duration);
    document.getElementById('puppy-roamer')?.style.setProperty('--puppy-travel-ms', `${duration}ms`);
    puppyRuntime.travelUntil = Date.now() + duration;
    if (puppyRuntime.travelTimer) clearTimeout(puppyRuntime.travelTimer);
    puppyRuntime.travelTimer = setTimeout(() => {
      puppyRuntime.travelUntil = 0; puppyRuntime.travelTimer = null;
      syncPuppyPose(mizoPreferences().motion && !mizoReducedMotion?.matches && !document.hidden);
    }, duration);
  } else if (!moving || wasHidden) stopPuppyTravel();
  puppyRuntime.position = position;
}

function puppyTravelDuration(from, to) {
  return Math.max(240, Math.round(Math.hypot(to.x - from.x, to.y - from.y) / 90 * 1000));
}

function puppyOverlap(a, b) {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

function puppyChooseSpot({ width, height, size, blocked = [], preferred = 0, from = null, stay = false, safeTop = 0, safeBottom = 0, safeLeft = 0, safeRight = 0 }) {
  if (width < size.width + 24 || height < size.height + 110) return null;
  const left = Math.max(12, safeLeft + 8), right = width - size.width - Math.max(12, safeRight + 8), top = Math.max(20, safeTop + 8);
  const bottom = height - size.height - Math.max(94, safeBottom + 80);
  if (right < left || bottom < top) return null;
  const middle = Math.max(top, Math.round((top + bottom) / 2));
  const center = (left + right) / 2;
  const candidates = [
    { x: center, y: middle }, { x: left + (right-left)*.25, y: middle },
    { x: left + (right-left)*.75, y: middle }, { x: center, y: top + (bottom-top)*.3 },
    { x: center, y: top + (bottom-top)*.7 },
    { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom },
    { x: left, y: top }, { x: left, y: middle }, { x: right, y: middle }
  ];
  const inside = p => p.x >= left && p.x <= right && p.y >= top && p.y <= bottom;
  const start = from && inside(from) ? from : null;
  if (stay && start && blocked.every(rect => puppyOverlap({x:start.x-16,y:start.y-16,width:size.width+32,height:size.height+32},rect) === 0)) return start;
  for (let offset = 0; offset < candidates.length; offset++) {
    let position = candidates[(preferred + offset) % candidates.length];
    if (start) {
      const distance = Math.hypot(position.x-start.x,position.y-start.y);
      if (distance < 10) continue;
      const fraction = Math.min(1, 132 / distance);
      position = { x:start.x+(position.x-start.x)*fraction, y:start.y+(position.y-start.y)*fraction };
    }
    // The complete swept rectangle is clear, including every point during the walk.
    const padded = { x: Math.min(position.x,start?.x ?? position.x)-16,
      y: Math.min(position.y,start?.y ?? position.y)-16,
      width: size.width+32+Math.abs(position.x-(start?.x ?? position.x)),
      height: size.height+32+Math.abs(position.y-(start?.y ?? position.y)) };
    if (blocked.every(rect => puppyOverlap(padded, rect) === 0)) return position;
  }
  if (start && blocked.every(rect => puppyOverlap({x:start.x-16,y:start.y-16,width:size.width+32,height:size.height+32},rect) === 0)) return start;
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
  if (moving && !puppyRuntime.interval) puppyRuntime.interval = setInterval(puppyTick, 4000);
  if (!moving && puppyRuntime.interval) { clearInterval(puppyRuntime.interval); puppyRuntime.interval = null; }
}

function renderPuppyRoamer(view, motion) {
  const roamer = document.getElementById('puppy-roamer');
  if (!roamer || !document.body) return;
  const preferences = mizoPreferences();
  syncPuppyLoop(preferences.enabled && motion && !document.hidden);
  syncPuppyPose(motion);
  if (!preferences.enabled || document.hidden) {
    stopPuppyTravel();
    roamer.hidden = true; document.body.dataset.puppyRoaming = 'false'; return;
  }
  const viewport = puppyViewport();
  const atHome = puppyHomeVisible(viewport.height) && Date.now() >= puppyRuntime.awayUntil && !document.querySelector?.('.modal-overlay.active');
  if (atHome) { stopPuppyTravel(); syncPuppyPose(motion); roamer.hidden = true; document.body.dataset.puppyRoaming = 'false'; return; }
  const hasMessage = mizoRuntime.pending.size > 0 || Date.now() < mizoRuntime.until;
  const size = hasMessage ? { width: 170, height: 166 } : { width: 96, height: 108 };
  const blocked = puppyBlockedRects().map(rect => ({ ...rect, x: rect.x - viewport.offsetX, y: rect.y - viewport.offsetY }));
  const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
  const previous = !roamer.hidden && puppyRuntime.position;
  const from = previous ? { x:previous.x-viewport.offsetX,y:previous.y-viewport.offsetY } : null;
  // Layout-only refreshes keep the destination; each tick selects the next short walk.
  const preferred = puppyRuntime.step % 5;
  const position = puppyChooseSpot({ ...viewport, size, blocked, preferred, from,
    stay: !motion || editing || puppyRuntime.placedStep === puppyRuntime.step });
  if (!position) { stopPuppyTravel(); syncPuppyPose(motion); roamer.hidden = true; document.body.dataset.puppyRoaming = 'false'; return; }
  puppyRuntime.placedStep = puppyRuntime.step;
  trackPuppyTravel({ x: position.x + viewport.offsetX, y: position.y + viewport.offsetY }, motion && !editing, roamer.hidden);
  syncPuppyPose(motion);
  roamer.hidden = false; document.body.dataset.puppyRoaming = 'true';
  roamer.dataset.state = view.state; roamer.dataset.motion = motion ? 'on' : 'off';
  roamer.dataset.dance = motion && !mizoRuntime.pending.size && Date.now() < mizoRuntime.danceUntil ? mizoRuntime.danceVariant : 'none';
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
    puppyRuntime.awayUntil = Date.now() + 8500;
    if (puppyRuntime.returnTimer) clearTimeout(puppyRuntime.returnTimer);
    puppyRuntime.returnTimer = setTimeout(() => { puppyRuntime.awayUntil = 0; renderPuppyFromCurrentState(); }, 8500);
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
