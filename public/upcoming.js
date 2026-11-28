// Announced (not yet released) albums and singles, with live countdowns.
// Spotify has no "upcoming releases" data, so this asks MusicBrainz (the open music database),
// and also picks up future-dated albums Spotify itself lists (pre-saves).
import * as kv from './kv.js';

const DAY = 864e5;
export const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9぀-ヿ一-鿿가-힯]+/g, '');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Midnight (local) of a release date; null when only the year or month is known. */
export function releaseTime(date) {
  if (!date || date.length !== 10) return null;
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getTime();
}

let lastMb = 0;
async function mbFetch(url) {   // MusicBrainz asks apps for at most one request a second
  const wait = Math.max(0, lastMb + 1100 - Date.now());
  lastMb = Date.now() + wait;
  if (wait) await new Promise(r => setTimeout(r, wait));
  return fetch(url).then(r => r.ok ? r.json() : Promise.reject(new Error('MusicBrainz ' + r.status)));
}

/** artists: [{ id, name }] → upcoming releases [{ id, name, type, date, artist, img }] sorted soonest first. */
export async function forArtists(artists) {
  if (!artists.length) return [];
  const key = 'upcoming2:' + norm(artists.map(a => a.id).join(',')).slice(0, 60) + artists.length;
  const saved = await kv.get(key).catch(() => null);
  if (saved && Date.now() - saved.at < 12 * 3600e3) return saved.items;
  const today = new Date().toISOString().slice(0, 10);
  const wanted = new Map(artists.map(a => [norm(a.name), a]));
  const found = [];
  const list = artists.slice(0, 60);
  for (let i = 0; i < list.length; i += 20) {
    const q = `(${list.slice(i, i + 20).map(a => `artist:"${a.name.replace(/["\\]/g, '')}"`).join(' OR ')}) AND firstreleasedate:[${today} TO 2099-12-31]`;
    try {
      const r = await mbFetch(`https://musicbrainz.org/ws/2/release-group/?${new URLSearchParams({ query: q, fmt: 'json', limit: 60 })}`);
      for (const g of r['release-groups'] || []) {
        const credit = (g['artist-credit'] || []).map(c => c.name || c.artist?.name);
        const match = credit.map(norm).map(n => wanted.get(n)).find(Boolean);
        const date = g['first-release-date'];
        if (!match || !date || date.slice(0, 4) > '2098') continue;
        const t = releaseTime(date);
        if (t ? t <= Date.now() - DAY : date < today.slice(0, date.length)) continue;
        found.push({ id: g.id, name: g.title, type: (g['primary-type'] || 'Release').toLowerCase(), date, artist: match,
          img: `https://coverartarchive.org/release-group/${g.id}/front-250` });
      }
    } catch {}
  }
  const items = dedupe(found);
  kv.set(key, { at: Date.now(), items }).catch(() => {});
  return items;
}

export function dedupe(list) {
  return [...new Map(list.map(x => [norm(x.artist.name + x.name), x])).values()].sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- countdowns ---------- */
const fmtDay = t => new Date(t).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const fmtMonth = d => d.length === 7 ? new Date(d + '-01T12:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : d;

function parts(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 };
}
const two = n => String(n).padStart(2, '0');
function text(t) {
  const left = t - Date.now();
  if (left <= 0) return 'Out now';
  const p = parts(left);
  return p.d >= 2 ? `${p.d} days` : `${p.d ? p.d + 'd ' : ''}${two(p.h)}:${two(p.m)}:${two(p.s)}`;
}

/** A countdown chip for a release date (falls back to "Expected March 2027" when there's no exact day). */
export function countdownHtml(date, big) {
  const t = releaseTime(date);
  if (!t) return `<span class="cd${big ? ' big' : ''} vague">Expected ${esc(fmtMonth(date))}</span>`;
  return `<span class="cd${big ? ' big' : ''}" data-t="${t}"><b>${text(t)}</b><i>${esc(fmtDay(t))}</i></span>`;
}

// One shared ticker; only touches countdowns that are on screen.
setInterval(() => {
  if (document.hidden) return;
  for (const el of document.querySelectorAll('.view.active .cd[data-t]')) {
    const v = text(Number(el.dataset.t));
    const b = el.firstChild;
    if (b && b.textContent !== v) b.textContent = v;
  }
}, 1000);
