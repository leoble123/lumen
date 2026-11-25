// Serves Lumen from its versioned cache so the installed app opens instantly (even offline),
// and so over-the-air updates can swap the whole app at once.
importScripts('/update-core.js');
const U = self.LumenUpdate;
const LOCAL = '/__net/';   // the launcher's copy (bypasses this service worker)

self.addEventListener('install', e => e.waitUntil((async () => {
  const meta = await U.getMeta();
  try {
    const m = await U.fetchManifest(LOCAL);
    if (!meta.version || U.cmp(m.version, meta.version) > 0) await U.install(LOCAL, m);
  } catch (err) { if (!meta.active) throw err; }
  await self.skipWaiting();
})()));

self.addEventListener('activate', e => e.waitUntil(U.cleanup().then(() => self.clients.claim())));

async function rollbackIfStuck(meta) {
  meta.launches = (meta.launches || 0) + 1;
  if (meta.launches > 2 && meta.previous) {
    // The new version opened twice without finishing start-up: go back to the last good one.
    const bad = meta.active;
    const prevManifest = await (await caches.open(meta.previous)).match('/version.json').then(r => r && r.json());
    meta = { ...meta, active: meta.previous, previous: null, trial: false, launches: 0,
      version: prevManifest?.version || meta.version, rolledBack: bad.replace('lumen-', ''),
      skip: [...(meta.skip || []), bad.replace('lumen-', '')] };
    await caches.delete(bad);
  }
  await U.setMeta(meta);
  return meta;
}

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith(LOCAL)) return;
  const isPage = e.request.mode === 'navigate';
  e.respondWith((async () => {
    let meta = await U.getMeta();
    if (isPage && meta.trial) meta = await rollbackIfStuck(meta);
    const key = isPage || url.pathname === '/' ? '/index.html' : url.pathname;
    if (meta.active) {
      const hit = await (await caches.open(meta.active)).match(key);
      if (hit) return hit;
    }
    try { return await fetch(isPage ? '/index.html' : e.request); }
    catch { return new Response('Lumen is offline', { status: 503 }); }
  })());
});
