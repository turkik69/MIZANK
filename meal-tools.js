/* Small, local additions to the existing meal flow. No profile or goal migration. */
'use strict';

const mealNutrients = [
  ['cal', 'السعرات'], ['protein', 'بروتين (غ)'], ['carbs', 'كربوهيدرات (غ)'],
  ['fat', 'دهون (غ)'], ['sugar', 'سكر (غ)'], ['fiber', 'ألياف (غ)']
];
const mealSources = {
  photo: 'تقدير من صورة', text: 'تقدير من وصف', voice: 'تقدير من صوت',
  barcode: 'بيانات Open Food Facts', library: 'تقدير من مكتبة الأطعمة',
  manual: 'إدخال يدوي', unknown: 'سجل سابق — المصدر غير محدد'
};
const pendingMealAnalyses = new Map();
let mealReviewDraft = null;
let mealReviewFocus = null;

function mealAnalysisSchema(withWeight = false) {
  const numbers = Object.fromEntries(['calories', 'protein', 'carbs', 'fat', 'sugar', 'fiber'].map(key => [key, { type: 'NUMBER' }]));
  const properties = { name: { type: 'STRING' }, ...numbers,
    components: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
      name: { type: 'STRING' }, quantity: { type: 'NUMBER' }, unit: { type: 'STRING' }, ...numbers
    }, required: ['name', 'quantity', 'unit', ...Object.keys(numbers)] } },
    assumptions: { type: 'ARRAY', items: { type: 'STRING' } }
  };
  if (withWeight) properties.estimatedWeight = { type: 'NUMBER' };
  return { type: 'OBJECT', properties, required: ['name', ...Object.keys(numbers), ...(withWeight ? ['estimatedWeight'] : [])] };
}

function deleteLoggedMeal(index) {
  const record = getTodaysMeals()[index];
  if (record) deleteMeal(record.id);
}

function mealNumber(value) { return Number.isFinite(Number(value)) ? Number(value) : 0; }
function mealRound(value) { return Math.round((value + Number.EPSILON) * 10) / 10; }
function mealSourceLabel(source) { return mealSources[source] || mealSources.unknown; }
function mealReviewSignature(name, components) {
  return JSON.stringify([name, components.map(part => [part.name, part.quantity, part.unit, ...mealNutrients.map(([key]) => part[key])])]);
}
function mealPart(item) {
  const part = {
    name: String(item.name || ''), quantity: mealNumber(item.quantity) > 0 ? Number(item.quantity) : 1,
    unit: String(item.unit || 'حصة')
  };
  mealNutrients.forEach(([key]) => { part[key] = mealNumber(key === 'cal' ? (item.cal ?? item.calories) : item[key]); });
  return part;
}

function showMealAnalysis(containerId, result, source) {
  const host = document.getElementById(containerId);
  if (!host) return;
  pendingMealAnalyses.set(containerId, { result, source });
  const quantity = mealNumber(result.estimatedWeight);
  host.innerHTML = `<div class="message-box meal-analysis-result">
    <b>${escapeMealText(result.name)}</b>
    <p>${Math.round(mealNumber(result.calories ?? result.cal))} سعرة · ${mealRound(mealNumber(result.protein))} غ بروتين</p>
    <small>${escapeMealText(mealSourceLabel(source))}${source === 'barcode' ? ' · القيم لكل 100 غ؛ حدّد الكمية التي تناولتها.' : quantity > 0 ? ` · الوزن التقديري ${quantity} غ` : ' · راجع الحصة والمكونات.'}</small>
    <button type="button" class="btn btn-primary" data-review-analysis="${containerId}">مراجعة وتعديل ثم حفظ</button>
  </div>`;
  host.querySelector('[data-review-analysis]').addEventListener('click', () => {
    const pending = pendingMealAnalyses.get(containerId);
    if (pending) openMealReview(pending.result, pending.source, { previewId: containerId, remember: source !== 'barcode' });
  });
}

function openMealReview(item, source = 'manual', options = {}) {
  mealReviewFocus = document.activeElement;
  const total = mealPart(item);
  let components = Array.isArray(item.components) && item.components.length ? item.components.map(mealPart) : [total];
  const assumptions = Array.isArray(item.assumptions) ? item.assumptions.map(String).slice(0, 6) : [];
  if (item.components?.length && !options.reference && !options.recipe && (item.cal !== undefined || item.calories !== undefined)) {
    const sums = mealPartTotals(components);
    if (mealNutrients.some(([key]) => Math.abs(sums[key] - total[key]) > Math.max(key === 'cal' ? 5 : 1, Math.abs(total[key]) * .05))) {
      components = [total];
      assumptions.push('تفصيل المكونات لا يطابق الإجمالي؛ عُرض إجمالي الوجبة للمراجعة. يمكنك إدخال المكونات يدويًا.');
    }
  }
  if (!item.components?.length && mealNumber(item.estimatedWeight) > 0) {
    components[0].quantity = Number(item.estimatedWeight);
    components[0].unit = 'غ';
  }
  mealReviewDraft = {
    name: String(item.name || ''), source, components,
    assumptions,
    options, sourceEdited: !!item.sourceEdited, reference: options.reference || null
  };
  mealReviewDraft.initialValues = mealReviewSignature(mealReviewDraft.name, components);
  renderMealReview();
}

function openLoggedMealReview(index) {
  const record = getTodaysMeals()[index];
  if (!record) return;
  openMealReview(record, record.source || 'unknown', { reference: record });
}

function renderMealReview() {
  const draft = mealReviewDraft;
  if (!draft) return;
  showModal(draft.reference ? 'تعديل الوجبة المسجلة' : 'مراجعة الوجبة', `
    <form id="meal-review-form" class="meal-review-form">
      <p class="meal-review-note">${escapeMealText(mealSourceLabel(draft.source))}${draft.sourceEdited ? ' · عُدّل يدويًا' : ''}.
      ${['photo', 'text', 'voice', 'library'].includes(draft.source) ? 'القيم تقديرية؛ راجع الكمية والزيوت والصلصات قبل الحفظ.' : 'راجع القيم والكمية التي تناولتها قبل الحفظ.'}</p>
      ${draft.assumptions.length ? `<details class="meal-review-assumptions"><summary>افتراضات التحليل</summary><ul>${draft.assumptions.map(s => `<li>${escapeMealText(s)}</li>`).join('')}</ul></details>` : ''}
      <label class="form-label" for="meal-review-name">اسم الوجبة</label>
      <input id="meal-review-name" class="form-input" required maxlength="240" value="${escapeMealText(draft.name)}">
      <div class="meal-review-parts">${draft.components.map((part, i) => `
        <fieldset class="meal-review-part"><legend>المكوّن ${i + 1}</legend>
          <label class="form-label" for="meal-part-${i}-name">اسم المكوّن</label>
          <input id="meal-part-${i}-name" class="form-input" required maxlength="240" value="${escapeMealText(part.name)}">
          <div class="meal-review-grid">
            <label>الكمية<input id="meal-part-${i}-quantity" class="form-input" type="number" inputmode="decimal" min="0.01" step="any" required value="${part.quantity}" data-quantity="${i}"></label>
            <label>الوحدة<input id="meal-part-${i}-unit" class="form-input" required maxlength="30" value="${escapeMealText(part.unit)}"></label>
          </div>
          <details class="meal-review-values" ${draft.components.length === 1 ? 'open' : ''}><summary>القيم لهذه الكمية · تعديل</summary>
            <p class="meal-review-note">القيم للكمية المكتوبة أعلاه. تغيير الكمية يحسبها تناسبيًا؛ تغيير اسم المكوّن وحده لا يعيد التحليل.</p>
            <div class="meal-review-grid">${mealNutrients.map(([key, label]) => `<label for="meal-part-${i}-${key}">${label}<input id="meal-part-${i}-${key}" class="form-input" type="number" inputmode="decimal" min="0" step="any" required value="${part[key]}" data-nutrient="${key}"></label>`).join('')}</div>
          </details>
          ${draft.components.length > 1 ? `<button type="button" class="icon-btn" data-remove-part="${i}">حذف المكوّن</button>` : ''}
        </fieldset>`).join('')}</div>
      <button type="button" class="icon-btn" id="meal-add-part">إضافة مكوّن يدويًا</button>
      <div id="meal-review-total" class="meal-review-total" aria-live="polite"></div>
      <p id="meal-review-error" class="meal-review-error" role="alert"></p>
      <div class="meal-review-actions"><button type="submit" class="btn btn-primary">${draft.reference ? 'حفظ التعديلات' : 'حفظ الوجبة'}</button><button type="button" class="btn btn-secondary" id="meal-review-cancel">إلغاء</button></div>
    </form>`);
  const form = document.getElementById('meal-review-form');
  form.addEventListener('submit', saveMealReview);
  document.getElementById('meal-review-name').addEventListener('input', event => {
    if (draft.components.length === 1) {
      const partName = document.getElementById('meal-part-0-name');
      if (!partName.value.trim() || partName.value === draft.name) partName.value = event.target.value;
    }
    draft.name = event.target.value.trim();
  });
  form.querySelectorAll('[data-quantity]').forEach(input => {
    let previousQuantity = Number(input.value);
    input.addEventListener('input', () => {
      const next = Number(input.value);
      if (Number.isFinite(next) && next > 0 && previousQuantity > 0) {
        const i = Number(input.dataset.quantity);
        mealNutrients.forEach(([key]) => {
          const el = document.getElementById(`meal-part-${i}-${key}`);
          el.value = mealRound(mealNumber(el.value) * next / previousQuantity);
        });
        previousQuantity = next;
      }
      renderMealReviewTotal();
    });
  });
  form.querySelectorAll('[data-nutrient]').forEach(input => input.addEventListener('input', renderMealReviewTotal));
  form.querySelectorAll('[data-remove-part]').forEach(button => button.addEventListener('click', () => {
    syncMealReviewDraft();
    draft.components.splice(Number(button.dataset.removePart), 1);
    renderMealReview();
  }));
  document.getElementById('meal-add-part').addEventListener('click', () => {
    syncMealReviewDraft();
    draft.components.push(mealPart({ name: '' }));
    renderMealReview();
    document.getElementById(`meal-part-${draft.components.length - 1}-name`).focus();
  });
  document.getElementById('meal-review-cancel').addEventListener('click', closeModal);
  const overlay = document.getElementById('app-modal');
  overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-labelledby', 'modal-title');
  renderMealReviewTotal();
  document.getElementById('meal-review-name').focus({ preventScroll: true });
}

function syncMealReviewDraft() {
  if (!mealReviewDraft || !document.getElementById('meal-review-form')) return;
  mealReviewDraft.name = document.getElementById('meal-review-name').value.trim();
  mealReviewDraft.components = mealReviewDraft.components.map((part, i) => {
    const result = { name: document.getElementById(`meal-part-${i}-name`).value.trim(), unit: document.getElementById(`meal-part-${i}-unit`).value.trim(), quantity: Number(document.getElementById(`meal-part-${i}-quantity`).value) };
    mealNutrients.forEach(([key]) => { result[key] = Number(document.getElementById(`meal-part-${i}-${key}`).value); });
    return result;
  });
}

function mealPartTotals(parts) {
  return Object.fromEntries(mealNutrients.map(([key]) => [key, mealRound(parts.reduce((sum, part) => sum + mealNumber(part[key]), 0))]));
}

function renderMealReviewTotal() {
  syncMealReviewDraft();
  const totals = mealPartTotals(mealReviewDraft.components);
  document.getElementById('meal-review-total').textContent = `الإجمالي: ${totals.cal} سعرة · ${totals.protein} غ بروتين · ${totals.carbs} غ كربوهيدرات · ${totals.fat} غ دهون`;
}

function saveMealReview(event) {
  event?.preventDefault();
  const form = document.getElementById('meal-review-form');
  if (!mealReviewDraft || !form || !form.reportValidity()) return;
  syncMealReviewDraft();
  const draft = mealReviewDraft;
  const invalid = !draft.name || draft.components.some(part => !part.name || !part.unit || !Number.isFinite(part.quantity) || part.quantity <= 0 || mealNutrients.some(([key]) => !Number.isFinite(part[key]) || part[key] < 0));
  if (invalid) { document.getElementById('meal-review-error').textContent = 'راجع الأسماء والكميات؛ أدخل أرقامًا صالحة دون قيم سالبة.'; return; }
  if (draft.reference && !appState.meals.includes(draft.reference)) { document.getElementById('meal-review-error').textContent = 'هذه الوجبة لم تعد موجودة. أغلق النافذة وافتح السجل مجددًا.'; return; }
  const totals = mealPartTotals(draft.components);
  const now = Date.now();
  const record = draft.reference || {
    id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${now}-${Math.random().toString(36).slice(2)}`,
    date: todayStr(), timestamp: now, mealType: inferMealType(draft.name, now),
    time: new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })
  };
  Object.assign(record, totals, { name: draft.name, source: draft.source,
    sourceEdited: draft.sourceEdited || (draft.source !== 'manual' && draft.initialValues !== mealReviewSignature(draft.name, draft.components)), components: draft.components.map(part => ({ ...part })),
    assumptions: [...draft.assumptions], updatedAt: now });
  if (!draft.reference) appState.meals.push(record);
  if (!draft.reference && draft.options.remember) {
    appState.customMeals ||= [];
    if (!appState.customMeals.some(meal => meal.name === record.name)) {
      appState.customMeals.push({ ...totals, name: record.name, source: record.source, sourceEdited: record.sourceEdited,
        components: record.components.map(part => ({ ...part })), desc: 'وجبة راجعتها وحفظتها بنفسك' });
    }
  }
  saveCurrentUserData();
  if (draft.options.previewId) {
    document.getElementById(draft.options.previewId).textContent = '';
    pendingMealAnalyses.delete(draft.options.previewId);
    if (draft.source === 'text') document.getElementById('meal-text-input').value = '';
    if (draft.source === 'photo') { document.getElementById('meal-photo-input').value = ''; lastPhotoAnalysisResult = null; }
  }
  mealReviewDraft = null; // Ignore rapid or repeated submit events after one save.
  closeModal();
  updateDashboard(); updateMealsList();
  showToast(draft.reference ? 'تم تعديل الوجبة وتحديث مجموع اليوم' : 'تم حفظ الوجبة', 'success');
}

document.addEventListener('keydown', event => {
  if (!mealReviewDraft || !document.getElementById('app-modal').classList.contains('active')) return;
  if (event.key === 'Escape') { event.preventDefault(); closeModal(); return; }
  if (event.key === 'Tab') {
    const controls = [...document.querySelectorAll('#app-modal button, #app-modal input, #app-modal summary')].filter(el => el.getClientRects().length && !el.disabled);
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
});

// The dashboard already uses food minus recorded activity. Keep that convention.
function mealDayBalance(profile = appState.profile, meals = getTodaysMeals(), workouts = getTodaysWorkouts()) {
  const totals = mealPartTotals(meals);
  const burned = workouts.reduce((sum, workout) => sum + Math.max(0, mealNumber(workout.cal)), 0);
  const target = Math.max(0, mealNumber(profile?.dailyCalories));
  return { ...totals, target, burned, net: mealRound(totals.cal - burned),
    remaining: mealRound(target - (totals.cal - burned)),
    proteinRemaining: Math.max(0, mealRound(mealNumber(profile?.protein) - totals.protein)) };
}

function mealGuidanceText(balance, meals = getTodaysMeals()) {
  if (!meals.length) return 'سجّل أول وجبة عندما تتناولها؛ بعدها يظهر المتبقي واقتراح يناسب يومك.';
  const latest = [...meals].sort((a, b) => mealNumber(b.updatedAt || b.timestamp || b.id) - mealNumber(a.updatedAt || a.timestamp || a.id))[0];
  const contribution = `${latest.name}: ${mealRound(mealNumber(latest.protein))} غ بروتين و${Math.round(mealNumber(latest.cal))} سعرة.`;
  if (!balance.target) return `${contribution} حدّث أهدافك من بيانات الحساب لعرض المتبقي.`;
  if (balance.remaining <= 0) return `${contribution} ${balance.remaining < 0 ? `تجاوز صافي اليوم الهدف بـ${Math.round(Math.abs(balance.remaining))} سعرة.` : 'وصل صافي اليوم إلى هدف السعرات.'} واصل التسجيل كالمعتاد؛ يمكنك استعراض خيارات الوجبة التالية دون تغيير هدفك.`;
  return `${contribution} بقي من هدف اليوم ${Math.round(balance.remaining)} سعرة${balance.proteinRemaining > 0 ? ` و${balance.proteinRemaining} غ بروتين` : '، وقد اكتمل هدف البروتين المسجل'}. اختر من الاقتراحات ما يناسب وجبتك التالية.`;
}

function renderMealGuidance() {
  const host = document.getElementById('meal-guidance');
  if (!host || !appState.profile) return;
  const balance = mealDayBalance();
  host.innerHTML = `<div class="meal-guidance-heading"><span>✦</span><b>خطوتك التالية</b></div>
    <p id="meal-guidance-text" aria-live="polite">${escapeMealText(mealGuidanceText(balance))}</p>
    <small>المتبقي حسب صافي اليوم، مثل لوحة اليوم. يتحدث عند الحفظ والتعديل والحذف.</small>
    <button type="button" class="btn btn-secondary" onclick="openNextMealSuggestions()">اقترح وجبتي التالية</button>`;
}

let nextMealCandidates = [];
let nextMealOptions = null;

function nextMealSlot() {
  const latest = getTodaysMeals().at(-1);
  if (!latest) return inferMealType('', Date.now());
  return ({ breakfast: 'lunch', lunch: 'dinner', dinner: 'snack', snack: inferMealType('', Date.now()) })[latest.mealType] || inferMealType('', Date.now());
}

function mealSuggestionCandidates(balance, options = {}) {
  const categories = { breakfast: ['breakfast'], lunch: ['lunch', 'grills'], dinner: ['dinner', 'grills'], snack: ['snacks', 'fruits', 'vegetables', 'bakery'] };
  const allowed = categories[options.slot] || ['breakfast', 'lunch', 'dinner', 'grills', 'snacks'];
  const excluded = String(options.exclude || '').split(/[،,\n]+/).map(normalizeMealSearch).filter(Boolean);
  const pool = allowed.flatMap(category => (suggestedMealsData[category] || []).map(item => ({ ...item, category, source: 'library' })));
  if (options.useSaved !== false) pool.unshift(...(appState.customMeals || []).map(item => ({ ...item, category: 'custom', source: item.source || 'library' })));
  const seen = new Set();
  const budget = balance.remaining > 0 ? balance.remaining : null;
  const results = pool.filter(item => {
    const key = normalizeMealSearch(item.name);
    const text = normalizeMealSearch(`${item.name} ${item.desc || ''} ${(item.components || []).map(part => part.name).join(' ')}`);
    if (!key || seen.has(key) || mealNumber(item.cal) <= 0 || mealNutrients.some(([n]) => !Number.isFinite(Number(item[n] ?? 0)) || Number(item[n] ?? 0) < 0)) return false;
    if (excluded.some(word => text.includes(word))) return false;
    seen.add(key); return true;
  }).map(item => {
    const cal = mealNumber(item.cal), protein = mealNumber(item.protein);
    const fits = budget !== null && cal <= budget;
    const proteinFit = balance.proteinRemaining > 0 ? Math.min(1, protein / balance.proteinRemaining) : 0;
    const desiredCal = budget !== null ? Math.min(budget, options.slot === 'snack' ? 250 : 550) : 400;
    const score = (fits ? 100 : 0) + proteinFit * 35 - Math.abs(cal - desiredCal) / Math.max(desiredCal, 1) * 20;
    return { ...item, fits, score };
  }).sort((a, b) => b.score - a.score);
  // Do not quietly offer an over-budget meal as if it fit. The UI distinguishes alternatives.
  return results;
}

function openNextMealSuggestions() {
  nextMealOptions = { slot: nextMealSlot(), exclude: appState.mealPreferences?.exclude || '', useSaved: appState.mealPreferences?.useSaved !== false };
  showModal('اقتراح وجبتك التالية', `
    <div class="next-meal-panel">
      <p class="meal-review-note">اقتراحات من مكتبتك ووجباتك المحفوظة حسب المتبقي اليوم. اختيار اقتراح يفتح المراجعة؛ لا يُسجّل تلقائيًا.</p>
      <div class="meal-review-grid"><label for="next-meal-slot">نوع الوجبة<select id="next-meal-slot" class="form-select">
        <option value="breakfast">إفطار</option><option value="lunch">غداء</option><option value="dinner">عشاء</option><option value="snack">وجبة خفيفة</option><option value="all">كل الوجبات</option></select></label>
        <label for="next-meal-exclude">استبعاد كلمات، اختياري<input id="next-meal-exclude" class="form-input" placeholder="مثل: تونة، بيض" maxlength="240" value="${escapeMealText(nextMealOptions.exclude)}"></label></div>
      <label class="next-meal-saved"><input type="checkbox" id="next-meal-saved" ${nextMealOptions.useSaved ? 'checked' : ''}> تضمين وجباتي المحفوظة</label>
      <small class="meal-review-note">الاستبعاد يطابق الكلمات المكتوبة؛ راجع المكونات بنفسك عند وجود حساسية غذائية.</small>
      <button type="button" class="btn btn-secondary" id="next-meal-refresh">تحديث الاقتراحات وحفظ التفضيلات</button>
      <div id="next-meal-results" aria-live="polite"></div>
    </div>`);
  document.getElementById('next-meal-slot').value = nextMealOptions.slot;
  document.getElementById('next-meal-refresh').addEventListener('click', () => {
    nextMealOptions = { slot: document.getElementById('next-meal-slot').value, exclude: document.getElementById('next-meal-exclude').value.trim(), useSaved: document.getElementById('next-meal-saved').checked };
    appState.mealPreferences = { ...(appState.mealPreferences || {}), exclude: nextMealOptions.exclude, useSaved: nextMealOptions.useSaved };
    saveCurrentUserData(); renderNextMealSuggestions();
  });
  renderNextMealSuggestions();
}

function renderNextMealSuggestions() {
  const host = document.getElementById('next-meal-results');
  if (!host || !nextMealOptions) return;
  const balance = mealDayBalance();
  if (!balance.target) { host.textContent = 'حدّث أهدافك من بيانات الحساب أولًا.'; return; }
  const ranked = mealSuggestionCandidates(balance, nextMealOptions);
  const fits = ranked.filter(item => item.fits);
  const showingAlternatives = balance.remaining <= 0 || fits.length === 0;
  nextMealCandidates = (showingAlternatives ? ranked : fits).slice(0, 3);
  host.innerHTML = `<p class="meal-review-total">${balance.remaining > 0 ? `المتبقي اليوم ${Math.round(balance.remaining)} سعرة · ${balance.proteinRemaining} غ بروتين` : 'وصلت إلى هدف السعرات أو تجاوزته؛ المعروض خيارات عامة للمراجعة.'}</p>
    ${showingAlternatives && balance.remaining > 0 ? '<p class="meal-review-note">لا توجد حصة كاملة ضمن المتبقي بهذه التفضيلات. هذه بدائل للمراجعة وتعديل الحصة، وليست ضمن المتبقي تلقائيًا.</p>' : ''}
    ${nextMealCandidates.length ? nextMealCandidates.map((item, index) => `<article class="next-meal-option">
      <b>${escapeMealText(item.name)}</b><p>${Math.round(item.cal)} سعرة · ${mealRound(mealNumber(item.protein))} غ بروتين</p>
      <small>${escapeMealText(item.desc || '')}</small>
      <small>${item.fits ? 'ضمن السعرات المتبقية للحصة المعروضة' : 'راجع الكمية قبل الاعتماد'} · ${escapeMealText(mealSourceLabel(item.source))}</small>
      <button type="button" class="btn btn-primary" data-next-meal="${index}">مراجعة هذه الوجبة</button>
    </article>`).join('') : '<p>لا توجد اقتراحات مطابقة. جرّب تغيير نوع الوجبة أو الكلمات المستبعدة.</p>'}`;
  host.querySelectorAll('[data-next-meal]').forEach(button => button.addEventListener('click', () => {
    const item = nextMealCandidates[Number(button.dataset.nextMeal)];
    if (!item) return;
    closeModal();
    openMealReview(item, item.source, { recipe: item.category === 'custom' });
  }));
}
