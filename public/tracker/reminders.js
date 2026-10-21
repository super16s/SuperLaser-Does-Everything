// In-app reminder scheduler. IMPORTANT LIMITATION: a web app cannot wake itself
// when it is fully closed — these fire only while the app is open or backgrounded
// in a tab/PWA. (Reliable closed-app reminders need server push or a native app.)
// Reminders never log anything: dismissing, snoozing or ignoring one leaves the
// day's data exactly as it was.

import { dueReminders, ymd } from "./logic.js";

export function startScheduler(store, { onDue }) {
  const check = () => {
    const now = new Date(), today = ymd(now);
    const s = store.state;
    const fire = [];
    // Snoozed reminders come back at their snooze time (no grace limit: the user asked for it).
    for (const [id, until] of Object.entries(s.reminderState.snoozedUntil)) {
      if (now.getTime() >= until) {
        const r = s.reminders.find((x) => x.id === id);
        if (r && r.enabled && s.reminderCategories[r.category] !== false) fire.push({ reminder: r, snoozed: true });
      }
    }
    for (const d of dueReminders(s, now)) fire.push(d);
    if (!fire.length) return;
    store.quiet((st) => {
      for (const f of fire) {
        delete st.reminderState.snoozedUntil[f.reminder.id];
        st.reminderState.fired[`${today}|${f.reminder.id}`] = true;
      }
      for (const k of Object.keys(st.reminderState.fired)) if (k.slice(0, 10) < today) delete st.reminderState.fired[k]; // prune
      for (const k of Object.keys(st.reminderState.skipped)) if (k.slice(0, 10) < today) delete st.reminderState.skipped[k];
    });
    for (const f of fire) onDue(f.reminder);
  };
  check();
  const id = setInterval(check, 15000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });
  return () => clearInterval(id);
}

export function snooze(store, id, minutes) {
  store.quiet((s) => { s.reminderState.snoozedUntil[id] = Date.now() + minutes * 60000; });
}
export function skipToday(store, id) {
  store.quiet((s) => { s.reminderState.skipped[`${ymd()}|${id}`] = true; delete s.reminderState.snoozedUntil[id]; });
}

export async function notify(reminder) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const opts = { body: "Tap to open the tracker. Nothing is logged until you do it.", tag: reminder.id, icon: "../icons/icon-192.png" };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) reg.showNotification(reminder.label, opts); else new Notification(reminder.label, opts);
  } catch { /* notifications are best-effort */ }
}
export async function askPermission() {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission === "default" ? Notification.requestPermission() : Notification.permission;
}
