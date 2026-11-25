// Lumen over-the-air updates (shared by the app page and the service worker).
// Each version lives in its own cache ("lumen-0.4.0"). Updates are downloaded into a NEW cache,
// every file is checked against its SHA-256 from version.json, and only then switched on.
// If a new version fails to start twice, the service worker rolls back to the previous one.
(function (g) {
  const META_CACHE = 'lumen-meta', META_KEY = '/__meta';
  const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
    '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };
  const mime = p => MIME[p.slice(p.lastIndexOf('.'))] || 'application/octet-stream';
  const SAFE_PATH = /^(?!.*\.\.)[A-Za-z0-9_-][A-Za-z0-9_\-./]*$/;
  const cmp = (a, b) => {
    const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return Math.sign(d); }
    return 0;
  };
  const jsonResponse = obj => new Response(JSON.stringify(obj), { headers: { 'Content-Type': 'application/json' } });

  async function getMeta() {
    const r = await (await caches.open(META_CACHE)).match(META_KEY);
    return r ? r.json() : {};
  }
  async function setMeta(m) { await (await caches.open(META_CACHE)).put(META_KEY, jsonResponse(m)); }

  async function sha256(buf) {
    const h = await crypto.subtle.digest('SHA-256', buf);
    return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function fetchManifest(base) {
    const r = await fetch(`${base}version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(`update server answered ${r.status}`);
    const m = await r.json();
    if (!/^\d+\.\d+\.\d+$/.test(m.version) || !m.files || typeof m.files !== 'object') throw new Error('invalid version.json');
    for (const [p, h] of Object.entries(m.files)) {
      if (!SAFE_PATH.test(p) || !/^[0-9a-f]{64}$/.test(h)) throw new Error(`invalid entry in version.json: ${p}`);
    }
    if (!m.files['index.html'] || !m.files['app.js']) throw new Error('version.json is missing core files');
    return m;
  }

  async function install(base, manifest, onProgress) {
    const meta = await getMeta();
    const name = `lumen-${manifest.version}`;
    if (meta.active === name) return false;
    let old = null, oldManifest = null;
    if (meta.active) {
      old = await caches.open(meta.active);
      const r = await old.match('/version.json');
      oldManifest = r ? await r.json() : null;
    }
    await caches.delete(name);
    const cache = await caches.open(name);
    const entries = Object.entries(manifest.files);
    let done = 0;
    try {
      for (const [file, hash] of entries) {
        let buf = null;
        if (old && oldManifest?.files?.[file] === hash) {            // unchanged: reuse, no download
          const r = await old.match('/' + file);
          if (r) buf = await r.arrayBuffer();
        }
        if (!buf) {
          const r = await fetch(`${base}${file}?v=${hash.slice(0, 12)}`, { cache: 'no-store' });
          if (!r.ok) throw new Error(`couldn't download ${file} (${r.status})`);
          buf = await r.arrayBuffer();
        }
        if (await sha256(buf) !== hash) throw new Error(`${file} failed its integrity check`);
        await cache.put('/' + file, new Response(buf, { headers: { 'Content-Type': mime(file) } }));
        onProgress?.(++done / entries.length);
      }
      await cache.put('/version.json', jsonResponse(manifest));
    } catch (e) {
      await caches.delete(name);
      throw e;
    }
    const m = await getMeta();
    if (m.active && m.active !== name) m.previous = m.active;
    Object.assign(m, { active: name, version: manifest.version, notes: manifest.notes || '', trial: !!m.previous, launches: 0 });
    await setMeta(m);
    return true;
  }

  // Look at every source (the local launcher and GitHub) and install the newest version found.
  async function check({ sources, onProgress }) {
    const meta = await getMeta();
    const current = meta.version || '0.0.0';
    const found = [], errors = [];
    for (const base of sources) {
      try { found.push({ base, m: await fetchManifest(base) }); } catch (e) { errors.push(e); }
    }
    if (!found.length) throw errors[errors.length - 1] || new Error('no update source');
    // never re-install a version that already failed to start on this computer
    const usable = found.filter(f => !(meta.skip || []).includes(f.m.version));
    found.length = 0; found.push(...usable);
    if (!found.length) return { updated: false, version: current };
    found.sort((a, b) => cmp(b.m.version, a.m.version));
    const best = found[0];
    if (cmp(best.m.version, current) <= 0) return { updated: false, version: current };
    await install(best.base, best.m, onProgress);
    return { updated: true, version: best.m.version, notes: best.m.notes || '' };
  }

  async function markHealthy() {
    const m = await getMeta();
    if (m.trial || m.launches) { m.trial = false; m.launches = 0; await setMeta(m); }
  }

  async function cleanup() {
    const m = await getMeta();
    const keep = new Set([META_CACHE, m.active, m.previous].filter(Boolean));
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
  }

  g.LumenUpdate = { getMeta, setMeta, install, check, fetchManifest, markHealthy, cleanup, cmp, mime, sha256 };
})(self);
