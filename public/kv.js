// Tiny key-value store on IndexedDB (for saved lyrics, translations, stats). Falls back to memory.
const DB = 'lumen-kv', STORE = 'kv';
let dbp = null;
const mem = new Map();
function db() {
  if (!dbp) dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }).catch(() => null);
  return dbp;
}
async function tx(mode, fn) {
  const d = await db();
  if (!d) return undefined;
  return new Promise(res => {
    const t = d.transaction(STORE, mode), req = fn(t.objectStore(STORE));
    t.oncomplete = () => res(req?.result);
    t.onerror = () => res(undefined);
  });
}
export async function get(key) { const v = await tx('readonly', s => s.get(key)); return v === undefined ? mem.get(key) : v; }
export async function set(key, value) { mem.set(key, value); await tx('readwrite', s => s.put(value, key)); }
export async function del(key) { mem.delete(key); await tx('readwrite', s => s.delete(key)); }
export async function keys(prefix = '') {
  const all = (await tx('readonly', s => s.getAllKeys())) || [...mem.keys()];
  return all.filter(k => typeof k === 'string' && k.startsWith(prefix));
}
