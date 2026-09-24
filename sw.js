/* ميزان: إشعارات ذكية تعمل بالخلفية. كل قرارات الوجبات والماء تتم محلياً. */
const DB_NAME = 'mizank-notifications';
const DB_VERSION = 1;
const STORE = 'state';

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readValue(key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function writeValue(key, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function localDay(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function mealSlot(hour) {
  if (hour >= 8 && hour < 11) return ['breakfast', '🍳 وقت الإفطار', 'سجّل إفطارك عندما تتناوله لنحسب يومك بدقة.'];
  if (hour >= 13 && hour < 16) return ['lunch', '🍲 وقت الغداء', 'هل تناولت الغداء؟ سجّله بسهولة في ميزان.'];
  if (hour >= 19 && hour < 22) return ['dinner', '🥗 وقت العشاء', 'سجّل عشاءك لتكتمل صورة يومك الغذائية.'];
  return null;
}

async function smartTick() {
  const state = await readValue('snapshot').catch(() => null);
  if (!state?.notificationsEnabled) return;

  const now = new Date();
  const hour = now.getHours();
  if (hour < 7 || hour >= 22) return;
  const day = localDay(now);
  const sent = await readValue('sent').catch(() => ({})) || {};
  if (sent.day !== day) {
    sent.day = day;
    sent.meals = {};
  }

  const slot = mealSlot(hour);
  if (slot) {
    const [type, title, body] = slot;
    const alreadyLogged = (state.meals || []).some(meal => meal.day === day && meal.mealType === type);
    if (!alreadyLogged && !sent.meals?.[type]) {
      sent.meals = { ...(sent.meals || {}), [type]: Date.now() };
      await writeValue('sent', sent);
      await self.registration.showNotification(title, {
        body, icon: './icon-192.png', badge: './icon-192.png', tag: `mizank-meal-${day}-${type}`,
        data: { url: './', screen: 'meals' }, renotify: false,
      });
      return;
    }
  }

  const waterTarget = Number(state.waterTarget || 8);
  const waterNow = Number(state.water || 0);
  const intervalMs = Number(state.waterIntervalHours || 2) * 60 * 60 * 1000;
  const lastDrink = Number(state.lastWaterAt || 0);
  const lastWaterReminder = Number(sent.lastWater || 0);
  const baseline = Math.max(lastDrink, lastWaterReminder);
  if (waterNow < waterTarget && (!baseline || Date.now() - baseline >= intervalMs)) {
    sent.lastWater = Date.now();
    await writeValue('sent', sent);
    await self.registration.showNotification('💧 حان وقت الماء', {
      body: `بقي ${Math.max(1, waterTarget - waterNow)} كوب للوصول إلى هدفك اليوم.`,
      icon: './icon-192.png', badge: './icon-192.png', tag: `mizank-water-${day}`,
      data: { url: './', screen: 'water' }, renotify: true,
    });
  }
}

self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch (_) {}
  if (!payload.type || payload.type === 'MIZANK_TICK') event.waitUntil(smartTick());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    event.waitUntil(self.registration.showNotification(event.data.title, {
      body: event.data.body, icon: './icon-192.png', badge: './icon-192.png', tag: 'mizank-test',
      data: { url: './' },
    }));
  }
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(openClients => {
    const existing = openClients.find(client => 'focus' in client);
    return existing ? existing.focus() : clients.openWindow(event.notification.data?.url || './');
  }));
});
