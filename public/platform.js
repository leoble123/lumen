// Talks to the Android app (if Lumen is running inside it). On a computer this all does nothing.
export const ANDROID = typeof window.LumenAndroid !== 'undefined';
const pending = new Map();
let seq = 0;
window.__lumenNative = window.__lumenNative || {};
// The Android side answers async calls through here
window.__lumenNative.resolve = (id, json) => {
  const p = pending.get(id); if (!p) return;
  pending.delete(id);
  let v; try { v = JSON.parse(json); } catch { v = { error: 'Bad reply from the app' }; }
  v && v.error ? p.rej(new Error(v.error)) : p.res(v);
};
export function call(method, ...args) {
  return new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    try { window.LumenAndroid[method](id, ...args); } catch (e) { pending.delete(id); rej(e); }
  });
}
export function info() {
  if (!ANDROID) return null;
  try { return JSON.parse(window.LumenAndroid.getInfo()); } catch { return null; }
}
export function openExternal(url) { if (ANDROID) window.LumenAndroid.openExternal(url); else window.open(url, '_blank', 'noopener'); }
