// Artist bios (Wikipedia) and song credits (MusicBrainz). Both free, open, and saved on this device.
import * as kv from './kv.js';
import { icons } from './icons.js';
import { cleanTitle } from './lyrics.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '');
const MUSIC = /singer|band|rapper|musician|group|dj|producer|composer|duo|artist|songwriter|vocalist|guitarist|record|music/i;
const getJson = async url => { const r = await fetch(url); if (!r.ok) throw new Error('not found'); return r.json(); };

/** Short Wikipedia bio for an artist, or null if we can't be sure it's the right page. */
export async function artistAbout(name) {
  const key = 'bio:' + norm(name);
  const saved = await kv.get(key).catch(() => null);
  if (saved && Date.now() - saved.at < 14 * 864e5) return saved.v;
  let v = null;
  try {
    const s = await getJson(`https://en.wikipedia.org/w/rest.php/v1/search/page?${new URLSearchParams({ q: `${name} music`, limit: 6 })}`);
    const n = norm(name);
    const page = (s.pages || []).find(p => (norm(p.title) === n || norm(p.title.replace(/\s*\(.*\)$/, '')) === n) && MUSIC.test(p.description || ''));
    if (page) {
      const sum = await getJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(page.key)}`);
      if (sum.extract && sum.type !== 'disambiguation') v = { text: sum.extract, url: sum.content_urls?.desktop?.page, about: page.description };
    }
  } catch {}
  kv.set(key, { at: Date.now(), v }).catch(() => {});
  return v;
}

export function aboutHtml(a) {
  return `<div class="about glass"><div class="about-text">${esc(a.text)}</div>
    ${a.url ? `<button class="text-link" data-href="${esc(a.url)}">Read more on Wikipedia ↗</button>` : ''}</div>`;
}

/** Credits for a song from MusicBrainz: who wrote, produced, played on it, and when it first came out. */
export async function songCredits(track) {
  const key = 'credits:' + track.id;
  const saved = await kv.get(key).catch(() => null);
  if (saved) return saved;
  const artist = track.artists?.[0]?.name || '';
  const q = `recording:"${cleanTitle(track.name).replace(/"/g, '')}" AND artist:"${artist.replace(/"/g, '')}"`;
  const found = await getJson(`https://musicbrainz.org/ws/2/recording/?${new URLSearchParams({ query: q, fmt: 'json', limit: 8 })}`);
  const sec = (track.durationMs || 0) / 1000;
  const best = (found.recordings || [])
    .map(r => ({ r, d: Math.abs((r.length || 0) / 1000 - sec) }))
    .filter(o => o.r.score >= 80 && (!o.r.length || o.d < 12))
    .sort((a, b) => a.d - b.d || b.r.score - a.r.score)[0]?.r;
  if (!best) { const v = { found: false }; kv.set(key, v).catch(() => {}); return v; }
  await new Promise(r => setTimeout(r, 1100));   // MusicBrainz asks apps to keep it to ~1 request a second
  const rec = await getJson(`https://musicbrainz.org/ws/2/recording/${best.id}?inc=artist-credits+releases+artist-rels+work-rels+work-level-rels&fmt=json`);
  const groups = {};
  const add = (role, name) => { if (!name) return; (groups[role] ||= new Set()).add(name); };
  for (const rel of rec.relations || []) {
    const who = rel.artist?.name;
    if (rel.type === 'producer') add('Produced by', who);
    else if (rel.type === 'vocal') add('Vocals', who);
    else if (rel.type === 'instrument') add('Musicians', who + (rel.attributes?.length ? ` (${rel.attributes.join(', ')})` : ''));
    else if (rel.type === 'mix') add('Mixed by', who);
    else if (rel.type === 'engineer' || rel.type === 'recording') add('Engineered by', who);
    if (rel.type === 'performance' && rel.work) {
      for (const w of rel.work.relations || []) {
        if (w.type === 'composer' || w.type === 'writer') add('Written by', w.artist?.name);
        if (w.type === 'lyricist') add('Lyrics by', w.artist?.name);
      }
    }
  }
  const order = ['Written by', 'Lyrics by', 'Produced by', 'Vocals', 'Musicians', 'Mixed by', 'Engineered by'];
  const v = {
    found: true,
    released: rec['first-release-date'] || '',
    credits: order.filter(k => groups[k]).map(k => [k, [...groups[k]]]),
    url: `https://musicbrainz.org/recording/${rec.id}`,
  };
  kv.set(key, v).catch(() => {});
  return v;
}

const fmt = ms => { const s = Math.round((ms || 0) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export function songInfoHtml(track, c) {
  const genius = `https://genius.com/search?q=${encodeURIComponent(`${track.artists?.[0]?.name || ''} ${cleanTitle(track.name)}`)}`;
  const rows = [
    track.album?.name && ['Album', esc(track.album.name)],
    c?.released && ['First released', esc(new Date(c.released).toLocaleDateString(undefined, { year: 'numeric', month: c.released.length > 4 ? 'long' : undefined, day: c.released.length > 7 ? 'numeric' : undefined }))],
    ['Length', fmt(track.durationMs)],
    ...(c?.credits || []).map(([k, list]) => [k, list.map(esc).join(', ')]),
  ].filter(Boolean);
  return `<div class="si-head">${track.image ? `<img src="${esc(track.image)}" alt="">` : ''}<div><h3>${esc(track.name)}</h3><div class="si-sub">${esc((track.artists || []).map(a => a.name).join(', '))}</div></div></div>
    <div class="si-rows">${rows.map(([k, v]) => `<div class="si-row"><span>${k}</span><b>${v}</b></div>`).join('')}</div>
    ${c && !c.found ? '<p class="set-hint">No credits for this song in MusicBrainz yet.</p>' : ''}
    <div class="si-links">
      <button class="pill-btn" data-href="${esc(genius)}">Lyrics & meaning on Genius ↗</button>
      ${c?.url ? `<button class="pill-btn" data-href="${esc(c.url)}">MusicBrainz ↗</button>` : ''}
      ${track.id ? `<button class="pill-btn" data-href="https://open.spotify.com/track/${esc(track.id)}">Open in Spotify ↗</button>` : ''}
    </div>`;
}
export const loadingHtml = `<div class="si-loading">${icons.note}<span>Looking up credits…</span></div>`;
