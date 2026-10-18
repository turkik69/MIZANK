/* Mizo: an optional, local companion. Reactions never change health goals or records. */
'use strict';

const mizoRuntime = { initialized: false, previousVisit: null, event: null, until: 0, timer: null, pending: new Set(), openCards: new Set(), danceUntil: 0, danceTimer: null, danceCount: 0, danceVariant: 'none' };
const mizoReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

function mizoPreferences(state = appState) {
  return { enabled: state.mizoPreferences?.enabled !== false,
    motion: state.mizoPreferences?.motion !== false, sound: state.mizoPreferences?.sound === true };
}

function initializeMizoVisit() {
  if (mizoRuntime.initialized || !appState.profile) return;
  mizoRuntime.initialized = true;
  mizoRuntime.previousVisit = appState.mizoLastVisit || null;
  if (appState.mizoLastVisit !== todayStr()) {
    appState.mizoLastVisit = todayStr();
    saveCurrentUserData();
  }
}

function mizoView(state, { today = todayStr(), now = Date.now(), previousVisit = null, event = null, until = 0, pending = 0 } = {}) {
  const profile = state.profile || {};
  const name = String(profile.name || '').trim().split(/\s+/)[0].slice(0, 32);
  const meals = (state.meals || []).filter(meal => meal.date === today);
  const protein = meals.reduce((sum, meal) => sum + mealNumber(meal.protein), 0);
  const proteinLeft = Math.max(0, mealRound(mealNumber(profile.protein) - protein));
  const water = state.waterDate === today ? mealNumber(state.water) : 0;
  const waterTarget = Math.max(0, mealNumber(profile.water));
  const currentEvent = now < until ? event : null;
  if (pending > 0) return { state: 'thinking', message: 'أراجع بيانات الوجبة… ستتمكن من تعديلها قبل الحفظ.', action: 'meals' };
  if (currentEvent?.type === 'checkin') return { state: 'celebrate', message: 'أحسنت! حفظت تقييم هذا الأسبوع. المتابعة نفسها خطوة تستحق الاحتفال.', action: 'progress' };
  if (currentEvent?.type === 'water') {
    if (waterTarget > 0 && water >= waterTarget) return { state: currentEvent.crossedTarget ? 'celebrate' : 'encourage', cup: true,
      message: `تم التسجيل؛ وصلت إلى هدف الماء المحدد لليوم (${waterTarget} أكواب).`, action: 'water' };
    return { state: 'encourage', cup: true, message: `تم تسجيل الماء${waterTarget > 0 ? `: ${water} من ${waterTarget} أكواب اليوم` : ''}. شكرًا لمتابعتك.`, action: 'water' };
  }
  if (currentEvent?.type === 'input') return { state: 'encourage', message: 'أتابع معك… أكمل بياناتك على راحتك، ثم احفظ عندما تكون مستعدًا.', action: 'meals' };
  if (currentEvent?.type === 'saved') return { state: 'celebrate', message: 'تم حفظ إدخالك. خطوة جديدة في متابعة يومك!', action: 'progress' };
  if (currentEvent?.type === 'profile') return { state: 'welcome', message: 'أهلًا بك! بياناتك محفوظة، وسأرافقك في صفحات ميزانك.', action: 'meals' };
  if (currentEvent?.type === 'workout') return { state: 'celebrate', message: 'سجّلت نشاطك! أحسنت في متابعة يومك.', action: 'progress' };
  if (currentEvent?.type === 'weight') return { state: 'encourage', message: 'تم حفظ قراءتك. نتابع التقدم بهدوء، خطوة خطوة.', action: 'progress' };
  if (currentEvent?.type === 'retry') return { state: 'calm', message: 'خذ وقتك، راجع الإدخال أو حاول مجددًا عندما تكون جاهزًا.', action: 'meals' };
  if (currentEvent?.type === 'review') return { state: 'encourage', message: 'التحليل جاهز. راجع الكمية والمكونات، ثم احفظ الوجبة عندما تكون مستعدًا.', action: 'meals' };
  if (currentEvent?.type === 'meal' || currentEvent?.type === 'edit') return {
    state: 'encourage', message: `${currentEvent.type === 'edit' ? 'تم تحديث وجبتك ومجموع اليوم.' : 'تم تسجيل وجبتك، خطوة جميلة في متابعة يومك.'}${proteinLeft > 0 ? ` بقي من هدف البروتين ${proteinLeft} غ.` : mealNumber(profile.protein) > 0 ? ' اكتمل هدف البروتين المسجل.' : ''}`,
    action: 'suggest'
  };
  const gap = previousVisit && /^\d{4}-\d{2}-\d{2}$/.test(previousVisit)
    ? Math.round((new Date(today + 'T12:00:00') - new Date(previousVisit + 'T12:00:00')) / 86400000) : 0;
  if (gap >= 2) return { state: 'welcome', message: `حياك من جديد${name ? ` يا ${name}` : ''}. نكمّل من آخر خطوة، وعلى راحتك.`, action: 'meals' };
  if (meals.length) return { state: 'encourage', message: `سجّلت ${meals.length} ${meals.length === 1 ? 'وجبة' : 'وجبات'} اليوم.${proteinLeft > 0 ? ` بقي من هدف البروتين ${proteinLeft} غ؛ استعرض خيارات وجبتك التالية.` : ' استعرض ملخص يومك أو اختر وجبتك التالية.'}`, action: 'suggest' };
  if (state.fasting?.active) return { state: 'calm', message: 'مؤقت الصيام يعمل. سجلّك هنا عندما تحتاجه، وخطوة واحدة تكفي للبداية.', action: 'progress' };
  if (water > 0) return { state: 'calm', cup: true, message: `سجّلت ${water} ${water === 1 ? 'كوب ماء' : 'أكواب ماء'} اليوم. سجّل وجبتك عندما تتناولها.`, action: 'meals' };
  return { state: 'welcome', message: `أهلًا${name ? ` يا ${name}` : ''}، أنا مِيزو، رفيق ميزانك. نتابع يومك خطوة خطوة؟`, action: 'meals' };
}

function mizoSvg() {
  return '<img class="mizo-art mizo-puppy" src="./assets/puppy.webp" alt="" width="1280" height="1280" decoding="async" draggable="false">';
}

function renderMizoCards() {
  initializeMizoVisit();
  const preferences = mizoPreferences();
  const view = mizoView(appState, { today: todayStr(), now: Date.now(), previousVisit: mizoRuntime.previousVisit,
    event: mizoRuntime.event, until: mizoRuntime.until, pending: mizoRuntime.pending.size });
  const motion = preferences.motion && !mizoReducedMotion?.matches && !document.hidden;
  document.querySelectorAll('[data-mizo-card]').forEach(host => {
    const location = host.dataset.mizoCard;
    const transient = location === 'water' || location === 'checkin';
    const visible = preferences.enabled && (!transient || (mizoRuntime.event?.type === location && Date.now() < mizoRuntime.until));
    host.hidden = !visible;
    if (location === 'hero') host.parentElement?.classList.toggle('has-mizo', visible);
    if (!visible) { host.innerHTML = ''; delete host.dataset.signature; return; }
    const isOpen = mizoRuntime.openCards.has(location);
    const dance = motion && mizoRuntime.pending.size === 0 && Date.now() < mizoRuntime.danceUntil ? mizoRuntime.danceVariant : 'none';
    const signature = JSON.stringify([view, motion, isOpen, dance]);
    if (host.dataset.signature === signature) return;
    host.dataset.signature = signature;
    host.dataset.state = view.state; host.dataset.motion = motion ? 'on' : 'off'; host.dataset.cup = view.cup ? 'on' : 'off';
    host.dataset.dance = dance;
    if (location === 'hero') {
      host.innerHTML = `<button type="button" class="mizo-character mizo-hero-character" data-mizo-dance aria-label="تفاعل مع مِيزو وشغّل رقصته">${mizoSvg()}</button>
        <span class="mizo-hero-caption">${dance !== 'none' ? 'مِيزو يرقص معك ✦' : motion ? 'مِيزو · اضغط وتفاعل' : 'مِيزو · الحركة متوقفة'}</span>`;
      host.querySelector('[data-mizo-dance]').addEventListener('click', () => {
        mizoDance();
        host.querySelector('[data-mizo-dance]')?.focus({ preventScroll: true });
      });
      return;
    }
    host.innerHTML = `<div class="mizo-card-main">
      <button type="button" class="mizo-character" data-mizo-toggle aria-label="مِيزو: ${isOpen ? 'إغلاق' : 'فتح'} الاختصارات" aria-expanded="${isOpen}" aria-controls="mizo-actions-${location}">${mizoSvg()}</button>
      <div class="mizo-copy"><div class="mizo-name"><b>مِيزو</b><span>رفيق ميزانك</span></div><p class="mizo-message">${escapeMealText(view.message)}</p>
        <button type="button" class="mizo-primary-action" data-mizo-action="${view.action}">${({ meals: 'سجّل وجبتك', suggest: 'اقترح وجبتي التالية', progress: 'اعرض تقدمي', water: 'افتح سجل الماء' })[view.action]}</button>
      </div>
      <button type="button" class="mizo-settings-button" data-mizo-settings aria-label="إعدادات مِيزو">⋯</button>
    </div>
    <div id="mizo-actions-${location}" class="mizo-shortcuts" ${isOpen ? '' : 'hidden'}>
      <button type="button" data-mizo-action="meals">سجّل وجبتي</button><button type="button" data-mizo-action="suggest">اقترح وجبتي</button><button type="button" data-mizo-action="progress">اعرض تقدمي</button><button type="button" data-mizo-dance>ارقص يا مِيزو</button>
    </div>`;
    host.querySelector('[data-mizo-toggle]').addEventListener('click', () => {
      if (mizoRuntime.openCards.has(location)) mizoRuntime.openCards.delete(location); else mizoRuntime.openCards.add(location);
      mizoDance();
      host.querySelector('[data-mizo-toggle]')?.focus({ preventScroll: true });
    });
    host.querySelector('[data-mizo-settings]').addEventListener('click', openMizoSettings);
    host.querySelector('[data-mizo-dance]').addEventListener('click', () => {
      mizoDance();
      host.querySelector('[data-mizo-dance]')?.focus({ preventScroll: true });
    });
    host.querySelectorAll('[data-mizo-action]').forEach(button => button.addEventListener('click', () => mizoAction(button.dataset.mizoAction)));
  });
  if (typeof renderPuppyRoamer === 'function') renderPuppyRoamer(view, motion);
}

function queueMizoDance(duration = 5000) {
  const preferences = mizoPreferences();
  if (!preferences.enabled || !preferences.motion || mizoReducedMotion?.matches || document.hidden || mizoRuntime.pending.size) return;
  mizoRuntime.danceCount += 1;
  mizoRuntime.danceVariant = ['sway', 'bounce', 'twist'][(mizoRuntime.danceCount - 1) % 3];
  mizoRuntime.danceUntil = Date.now() + duration;
  if (mizoRuntime.danceTimer) clearTimeout(mizoRuntime.danceTimer);
  mizoRuntime.danceTimer = setTimeout(() => {
    mizoRuntime.danceUntil = 0; mizoRuntime.danceTimer = null; renderMizoCards();
  }, duration);
}

function mizoDance() {
  queueMizoDance();
  renderMizoCards();
  if (!mizoPreferences().motion || mizoReducedMotion?.matches) showToast('الحركة متوقفة حسب إعدادات مِيزو أو تقليل الحركة في الهاتف', 'info');
}

function mizoAction(action) {
  if (action === 'suggest') { openNextMealSuggestions(); return; }
  if (action === 'progress') { switchScreen('cutting'); return; }
  if (action === 'water') { switchScreen('water'); return; }
  switchScreen('meals');
  document.getElementById('meal-text-input')?.focus({ preventScroll: true });
}

function beginMizoAnalysis() {
  const token = Symbol('meal-analysis');
  mizoRuntime.pending.add(token); renderMizoCards();
  return token;
}

function endMizoAnalysis(token) {
  mizoRuntime.pending.delete(token); renderMizoCards();
}

function mizoReact(type, detail = {}) {
  initializeMizoVisit();
  mizoRuntime.previousVisit = null;
  const target = mealNumber(appState.profile?.water);
  const crossedTarget = type === 'water' && target > 0 && mealNumber(detail.previousWater) < target && mealNumber(appState.water) >= target;
  mizoRuntime.event = { type, crossedTarget }; mizoRuntime.until = Date.now() + 14000;
  if (mizoRuntime.timer) clearTimeout(mizoRuntime.timer);
  if (['meal', 'checkin', 'saved', 'profile', 'workout', 'weight'].includes(type) || type === 'water') queueMizoDance(4200);
  if (type === 'input') queueMizoDance(1100);
  if (typeof puppyReact === 'function') puppyReact(type);
  renderMizoCards();
  if (type === 'checkin' || crossedTarget) playMizoChime();
  mizoRuntime.timer = setTimeout(() => { mizoRuntime.event = null; mizoRuntime.timer = null; renderMizoCards(); }, 14000);
}

function playMizoChime() {
  const preferences = mizoPreferences();
  if (!preferences.enabled || !preferences.sound || document.hidden) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  try {
    const context = new Audio();
    [523.25, 659.25].forEach((frequency, index) => {
      const oscillator = context.createOscillator(), gain = context.createGain();
      const start = context.currentTime + index * .12;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(.035, start + .015); gain.gain.exponentialRampToValueAtTime(.001, start + .16);
      oscillator.connect(gain); gain.connect(context.destination); oscillator.start(start); oscillator.stop(start + .18);
    });
    setTimeout(() => context.close().catch(() => {}), 600);
  } catch (_) { /* Optional audio must never interrupt recording. */ }
}

function openMizoSettings() {
  mealReviewFocus = document.activeElement;
  const preferences = mizoPreferences();
  showModal('مِيزو · رفيق ميزانك', `<form id="mizo-settings-form" class="mizo-settings-form">
    <div class="mizo-settings-preview" data-state="welcome" data-motion="off">${mizoSvg()}</div>
    <p>الجرو الذي اخترته يرافقك تلقائيًا في جميع الصفحات، وبيته داخل بطاقة السعرات. يتفاعل مع الإدخال والحفظ والوجبات والماء.</p>
    <label><input type="checkbox" id="mizo-enabled" ${preferences.enabled ? 'checked' : ''}> إظهار مِيزو</label>
    <label><input type="checkbox" id="mizo-motion" ${preferences.motion ? 'checked' : ''}> الحركات والرقص والتجول التلقائي</label>
    <small>يُراعى إعداد تقليل الحركة في هاتفك تلقائيًا.</small>
    <label><input type="checkbox" id="mizo-sound" ${preferences.sound ? 'checked' : ''}> صوت احتفال قصير عند إكمال التقييم أو هدف الماء</label>
    <small>الصوت مغلق افتراضيًا، ويعمل بعد تفاعلك مع التطبيق إذا سمح المتصفح.</small>
    <div class="meal-review-actions"><button class="btn btn-primary" type="submit">حفظ الإعدادات</button><button class="btn btn-secondary" type="button" id="mizo-cancel">إلغاء</button></div>
  </form>`);
  document.getElementById('mizo-settings-form').addEventListener('submit', event => {
    event.preventDefault();
    appState.mizoPreferences = { ...(appState.mizoPreferences || {}), enabled: document.getElementById('mizo-enabled').checked,
      motion: document.getElementById('mizo-motion').checked, sound: document.getElementById('mizo-sound').checked };
    saveCurrentUserData(); closeModal(); renderMizoCards();
    showToast('تم حفظ إعدادات مِيزو', 'success');
  });
  document.getElementById('mizo-cancel').addEventListener('click', closeModal);
  const overlay = document.getElementById('app-modal');
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-labelledby', 'modal-title');
  document.getElementById('mizo-enabled').focus({ preventScroll: true });
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.getElementById('mizo-settings-form') && document.getElementById('app-modal').classList.contains('active')) closeModal();
});
mizoReducedMotion?.addEventListener?.('change', renderMizoCards);
document.addEventListener('visibilitychange', renderMizoCards);
window.addEventListener('load', renderMizoCards);
