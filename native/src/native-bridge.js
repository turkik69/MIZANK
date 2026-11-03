import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

if (Capacitor.isNativePlatform()) {
  const BASE_ID = 2100000;
  let queue = Promise.resolve();
  const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const atHour = (day, hour) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour);
  const idFor = (day, slot) => BASE_ID + Math.floor(atHour(day, 0).getTime() / 86400000) * 100 + slot;

  async function cancelMizankNotifications() {
    const { notifications } = await LocalNotifications.getPending();
    const ours = notifications.filter(({ id }) => id >= BASE_ID && id < BASE_ID + 10000000);
    if (ours.length) await LocalNotifications.cancel({ notifications: ours.map(({ id }) => ({ id })) });
  }

  async function schedule(snapshot) {
    await cancelMizankNotifications();
    if (!snapshot?.notificationsEnabled) return;
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display !== 'granted') return;

    const now = new Date();
    const next = [];
    const intervalHours = Math.max(1, Math.min(3, Number(snapshot.waterIntervalHours) || 2));
    const waterGoal = Math.max(1, Number(snapshot.waterTarget) || 8);
    for (let offset = 0; offset < 3; offset++) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      const dayId = dayKey(day);
      const logged = new Set((snapshot.meals || []).filter(m => m.day === dayId).map(m => m.mealType));
      const slots = [
        ['breakfast', 9, '🍳 وقت الإفطار', 'سجّل إفطارك إذا تناولته.'],
        ['lunch', 14, '🍲 وقت الغداء', 'سجّل غداءك إذا تناولته.'],
        ['dinner', 20, '🥗 وقت العشاء', 'سجّل عشاءك إذا تناولته.'],
      ];
      slots.forEach(([type, hour, title, body], index) => {
        const when = atHour(day, hour);
        if (!logged.has(type) && when > now) next.push({ id: idFor(day, index + 1), title, body, schedule: { at: when }, extra: { screen: 'meals' } });
      });

      if (offset === 0 && Number(snapshot.water || 0) >= waterGoal) continue;
      const lastDrink = offset === 0 && snapshot.waterDate === dayId ? Number(snapshot.lastWaterAt || 0) : 0;
      for (let hour = 8, count = 0; hour <= 20; hour += intervalHours, count++) {
        const when = atHour(day, hour);
        if (when <= now || (lastDrink && when.getTime() - lastDrink < intervalHours * 3600000)) continue;
        next.push({ id: idFor(day, 10 + count), title: '💧 وقت الماء', body: 'باقي خطوة صغيرة نحو هدف الترطيب اليومي.', schedule: { at: when }, extra: { screen: 'water' } });
      }
    }
    if (next.length) await LocalNotifications.schedule({ notifications: next });
  }

  window.MizankNative = {
    async hydrate() {
      try {
        const current = JSON.parse(localStorage.getItem('mizankV2Users') || '{}');
        if (current['mizank-v2-local-user']?.profile) return;
        const { data } = await Filesystem.readFile({ path: 'mizank-data.json', directory: Directory.Data, encoding: Encoding.UTF8 });
        const saved = JSON.parse(data);
        if (saved?.users && typeof saved.users === 'object') localStorage.setItem('mizankV2Users', JSON.stringify(saved.users));
      } catch (error) {
        if (error?.message && !/does not exist|not found|ENOENT/i.test(error.message)) console.warn('Native data restore unavailable', error);
      }
    },
    persist(users) {
      queue = queue.catch(() => {}).then(() => Filesystem.writeFile({
        path: 'mizank-data.json', data: JSON.stringify({ users }), directory: Directory.Data, encoding: Encoding.UTF8,
      }));
      return queue;
    },
    async deleteData() {
      await queue.catch(() => {});
      try { await Filesystem.deleteFile({ path: 'mizank-data.json', directory: Directory.Data }); }
      catch (error) { if (!/does not exist|not found|ENOENT/i.test(error?.message || '')) throw error; }
    },
    async requestPermission() {
      const current = await LocalNotifications.checkPermissions();
      return (current.display === 'granted' ? current : await LocalNotifications.requestPermissions()).display === 'granted';
    },
    reschedule(snapshot) {
      queue = queue.catch(() => {}).then(() => schedule(snapshot));
      return queue;
    },
    async show(title, body) {
      await LocalNotifications.schedule({ notifications: [{
        id: BASE_ID + 1, title, body, schedule: { at: new Date(Date.now() + 1200) },
      }] });
    },
    clear: cancelMizankNotifications,
    async exportBackup(json, filename) {
      await Filesystem.writeFile({ path: filename, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
      const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
      await Share.share({ title: 'نسخة احتياطية من ميزانك', url: uri, dialogTitle: 'احفظ النسخة الاحتياطية في الملفات' });
    },
  };

  LocalNotifications.addListener('localNotificationActionPerformed', event => {
    const screen = event.notification?.extra?.screen;
    if (screen && typeof window.switchScreen === 'function') window.switchScreen(screen);
  });
}
