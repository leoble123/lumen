// Your own wallpaper: an image or looping video, kept on this computer (IndexedDB), never uploaded anywhere.
const DB = 'lumen-files', STORE = 'files', KEY = 'wallpaper';
const MAX_BYTES = 300 * 1024 * 1024;
let url = null, kind = null;

function db() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), st = t.objectStore(STORE);
    const req = fn(st);
    t.oncomplete = () => { res(req?.result); d.close(); };
    t.onerror = () => { rej(t.error); d.close(); };
  });
}

export async function save(file) {
  if (!/^(image|video)\//.test(file.type)) throw new Error('Pick an image or a video file.');
  if (file.size > MAX_BYTES) throw new Error('That file is over 300 MB — try a smaller one.');
  await tx('readwrite', st => st.put({ blob: file, type: file.type, name: file.name }, KEY));
  await load(true);
}
export async function clear() { await tx('readwrite', st => st.delete(KEY)); show(null); }
export async function info() { try { const v = await tx('readonly', st => st.get(KEY)); return v ? { name: v.name, type: v.type } : null; } catch { return null; } }

let loaded = false;
export async function load(force) {
  if (loaded && !force) return !!url;
  loaded = true;
  let v = null;
  try { v = await tx('readonly', st => st.get(KEY)); } catch {}
  show(v);
  return !!v;
}

function show(v) {
  const host = document.getElementById('bg-wall');
  if (url) URL.revokeObjectURL(url);
  url = null; kind = null; host.innerHTML = '';
  if (!v?.blob) return;
  url = URL.createObjectURL(v.blob);
  kind = v.type.startsWith('video/') ? 'video' : 'image';
  if (kind === 'video') {
    const el = document.createElement('video');
    Object.assign(el, { src: url, muted: true, loop: true, autoplay: true, playsInline: true });
    el.setAttribute('muted', '');
    host.appendChild(el);
    el.play().catch(() => {});
  } else {
    const el = document.createElement('img'); el.src = url; el.alt = ''; host.appendChild(el);
  }
}
export const hasWallpaper = () => !!url;
export function setActive(on) {
  const v = document.querySelector('#bg-wall video');
  if (v) on ? v.play().catch(() => {}) : v.pause();
}
