// New Music, built from what you actually listen to:
//   your Spotify top artists (this month / lately / all time), top songs, recently played,
//   plays counted on this device, saved albums and follows → a score per artist.
// Their recent releases are ranked by that score and freshness ("For you"), listed by date ("Latest"),
// and announced albums get live countdowns ("Coming soon", via MusicBrainz + Spotify pre-saves).
import { api } from './api.js';
import * as kv from './kv.js';
import * as stats from './stats.js';
import * as upcoming from './upcoming.js';
import { icons } from './icons.js';
import { pickImage } from './pages.js';

let ctx;   // { isLoggedIn, onBadge(count) }
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY = 864e5;
let releases = [], soon = [], artists = new Map(), loading = null, filter = 'all', loadedAt = 0, progress = 0;

export function setup(c) { ctx = c; }

export const dateOf = r => {   // Spotify dates can be "2026", "2026-11" or "2026-11-21"
  const d = r.release_date || '';
  return upcoming.releaseTime(d) ?? new Date(d.length === 4 ? `${d}-01-01T00:00` : `${d}-01T00:00`).getTime();
};

/** Who you listen to, scored. */
async function scoreArtists() {
  const out = new Map();
  const add = (a, pts, why) => {
    if (!a?.id || !a.name) return;
    const e = out.get(a.id) || { id: a.id, name: a.name, img: '', score: 0, why: '', whyPts: 0 };
    e.score += pts;
    if (a.images?.length && !e.img) e.img = pickImage(a.images, true);
    if (why && pts > e.whyPts) { e.why = why; e.whyPts = pts; }
    out.set(a.id, e);
  };
  const get = (path, query) => api(path, { query }).catch(() => null);
  const [short, medium, long, topTracks, recent, follows, saved, local] = await Promise.all([
    get('/me/top/artists', { time_range: 'short_term', limit: 50 }),
    get('/me/top/artists', { time_range: 'medium_term', limit: 50 }),
    get('/me/top/artists', { time_range: 'long_term', limit: 50 }),
    get('/me/top/tracks', { time_range: 'short_term', limit: 50 }),
    get('/me/player/recently-played', { limit: 50 }),
    get('/me/following', { type: 'artist', limit: 50 }),
    get('/me/albums', { limit: 50 }),
    stats.artistTotals().catch(() => ({})),
  ]);
  (short?.items || []).forEach((a, i) => add(a, 10 * (1 - i / 60), 'On repeat this month'));
  (medium?.items || []).forEach((a, i) => add(a, 6 * (1 - i / 60), 'One of your top artists'));
  (long?.items || []).forEach((a, i) => add(a, 3 * (1 - i / 60), 'An all-time favorite'));
  for (const t of topTracks?.items || []) for (const a of t?.artists || []) add(a, 1.2, 'In your top songs');
  for (const p of recent?.items || []) for (const a of p?.track?.artists || []) add(a, 0.8, 'You played them recently');
  for (const [name, v] of Object.entries(local || {})) if (v.id) add({ id: v.id, name }, Math.min(8, v.ms / 1800e3), 'You play them a lot');
  for (const a of follows?.artists?.items || []) add(a, 2, 'You follow them');
  for (const s of saved?.items || []) for (const a of s?.album?.artists || []) add(a, 0.6, 'In your saved albums');
  return [...out.values()].sort((a, b) => b.score - a.score).slice(0, 70);
}

async function releasesFor(a, deep) {
  const key = 'rel2:' + a.id;
  const saved = await kv.get(key).catch(() => null);
  if (saved && Date.now() - saved.at < 12 * 3600e3) return saved.items;
  // albums and singles separately: one combined list puts all albums first and hides new singles
  const groups = deep ? ['single', 'album'] : ['album,single'];
  const lists = await Promise.all(groups.map(g => api(`/artists/${a.id}/albums`, { query: { include_groups: g, limit: deep ? 6 : 10 } }).catch(() => null)));
  const items = lists.flatMap(r => r?.items || []).filter(Boolean).map(x => ({
    id: x.id, uri: x.uri, name: x.name, type: x.album_type, release_date: x.release_date, img: pickImage(x.images), tracks: x.total_tracks,
    artists: (x.artists || []).map(y => ({ id: y.id, name: y.name })), artistId: a.id,
  }));
  if (lists.some(Boolean)) kv.set(key, { at: Date.now(), items }).catch(() => {});
  return items;
}

/** Loads everything (quietly, in the background is fine). Streams progress into the page if it's open. */
export function refresh(force) {
  if (!ctx.isLoggedIn()) return Promise.resolve();
  if (loading) return loading;
  if (!force && Date.now() - loadedAt < 30 * 60e3 && releases.length) return Promise.resolve();
  loading = (async () => {
    progress = 0.05; releases.length ? setBar() : render();
    const list = await scoreArtists();
    artists = new Map(list.map(a => [a.id, a]));
    const cutoff = Date.now() - 120 * DAY;
    const all = new Map(), future = new Map();
    let done = 0;
    const queue = list.map((a, i) => [a, i < 40]);
    const worker = async () => {
      while (queue.length) {
        const [a, deep] = queue.shift();
        try {
          for (const r of await releasesFor(a, deep)) {
            const t = dateOf(r);
            if (t > Date.now()) future.set(r.id, r);
            else if (t >= cutoff) all.set(r.id, r);
          }
        } catch {}
        done++;
        progress = 0.05 + 0.9 * done / list.length;
        // re-draw the page only once early (so it's not blank), then just move the progress bar: no jumping
        if (!releases.length && all.size >= 6) { releases = rank([...all.values()]); render(); } else setBar();
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    releases = rank([...all.values()]);
    loadedAt = Date.now(); progress = 0;
    const spotSoon = [...future.values()].map(r => ({ id: r.id, uri: r.uri, name: r.name, type: r.type, date: r.release_date, img: r.img, artist: artists.get(r.artistId) || r.artists[0] }));
    soon = upcoming.dedupe(spotSoon);
    keepScroll(render);
    updateBadge();
    const mb = await upcoming.forArtists(list.slice(0, 60)).catch(() => []);
    if (mb.length) { soon = upcoming.dedupe([...spotSoon, ...mb]); keepScroll(render); }
  })().finally(() => { loading = null; progress = 0; });
  return loading;
}

function rank(list) {
  const now = Date.now();
  for (const r of list) {
    const a = artists.get(r.artistId);
    const age = Math.max(0, (now - dateOf(r)) / DAY);
    r.score = (a?.score || 1) * Math.exp(-age / 21) * (r.type === 'album' ? 1.25 : 1);
    r.why = a?.why || '';
  }
  return list.sort((x, y) => dateOf(y) - dateOf(x));
}

function setBar() {
  const el = document.querySelector('#new-body .nm-load');
  if (!el) return;
  el.classList.toggle('on', !!progress);
  el.firstChild.style.transform = `scaleX(${progress.toFixed(3)})`;
}

function updateBadge() {
  const seen = Number(localStorage.getItem('lumen.newSeenAt') || 0);
  ctx.onBadge(releases.filter(r => dateOf(r) > seen && dateOf(r) > Date.now() - 14 * DAY).length);
}
export function markSeen() { localStorage.setItem('lumen.newSeenAt', String(Date.now())); ctx.onBadge(0); }

const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const ago = r => { const d = Math.floor((Date.now() - dateOf(r)) / DAY); return d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d < 7 ? `${d} days ago` : fmtDate(dateOf(r)); };
const kind = r => r.type === 'album' ? 'Album' : r.tracks > 3 ? 'EP' : 'Single';
const byline = r => esc(r.artists.map(a => a.name).join(', '));

function forYouHero(r) {
  return `<div class="tile nm-hero glass" data-kind="album" data-id="${esc(r.id)}" data-uri="${esc(r.uri)}">
    <div class="cover"><img src="${esc(r.img)}" alt=""></div>
    <div class="nm-hero-info"><div class="nm-why">${icons.sparkle}<span>${esc(r.why || 'New for you')}</span></div>
      <div class="nm-hero-t">${esc(r.name)}</div><div class="nm-hero-s">${byline(r)} · ${kind(r)} · ${ago(r)}</div>
      <button class="primary pill tile-play" aria-label="Play">${icons.play}<span>Play</span></button></div></div>`;
}
const card = r => `<div class="tile nm-card" data-kind="album" data-id="${esc(r.id)}" data-uri="${esc(r.uri)}">
    <div class="cover"><img src="${esc(r.img)}" loading="lazy" alt=""><button class="tile-play" aria-label="Play">${icons.play}</button></div>
    <div class="t">${esc(r.name)}</div><div class="s">${byline(r)}</div></div>`;
const row = (r, seen) => `<div class="tile nm-row" data-kind="album" data-id="${esc(r.id)}" data-uri="${esc(r.uri)}">
    <img src="${esc(r.img)}" loading="lazy" alt="">
    <div class="nm-row-i"><div class="t">${dateOf(r) > seen && Date.now() - dateOf(r) < 7 * DAY ? '<i class="nm-dot"></i>' : ''}${esc(r.name)}</div><div class="s">${byline(r)} · ${kind(r)}</div></div>
    <div class="nm-when">${ago(r)}</div><button class="tile-play" aria-label="Play">${icons.play}</button></div>`;
function soonCard(u) {
  const ph = esc((u.artist?.name || '?').slice(0, 1));
  return `<div class="tile nm-soon" data-kind="${u.uri ? 'album' : 'artist'}" data-id="${esc(u.uri ? u.id : u.artist?.id)}">
    <div class="cover"><span class="soon-ph">${ph}</span>${u.img ? `<img src="${esc(u.img)}" loading="lazy" alt="" onerror="this.remove()">` : ''}</div>
    <div class="t">${esc(u.name)}</div><div class="s">${esc(u.artist?.name || '')} · ${esc(u.type === 'album' ? 'Album' : u.type === 'single' ? 'Single' : u.type || 'Release')}</div>
    ${upcoming.countdownHtml(u.date)}</div>`;
}

const keepScroll = fn => { const v = $('#view-new'); const y = v?.scrollTop || 0; fn(); if (v) v.scrollTop = y; };
let seenAtOpen = 0;
export function render() {
  const body = $('#new-body');
  if (!body) return;
  if (!ctx.isLoggedIn()) { body.innerHTML = '<p class="empty">Connect Spotify to see new music from your artists.</p>'; return; }
  const bar = `<div class="nm-load${progress ? ' on' : ''}"><i style="transform:scaleX(${progress.toFixed(3)})"></i></div>`;
  if (!releases.length && loading) {
    body.innerHTML = bar + `<div class="nm-hero skeleton"></div><div class="row-scroll">${Array(6).fill('<div><div class="skeleton" style="aspect-ratio:1"></div></div>').join('')}</div>`;
    return;
  }
  const list = releases.filter(r => filter === 'all' || (filter === 'albums' ? r.type === 'album' : r.type !== 'album'));
  const picks = [...list].filter(r => Date.now() - dateOf(r) < 45 * DAY).sort((a, b) => b.score - a.score).slice(0, 11);
  const age = r => (Date.now() - dateOf(r)) / DAY;
  const groups = [['This week', list.filter(r => age(r) < 7)], ['Last week', list.filter(r => age(r) >= 7 && age(r) < 14)],
    ['This month', list.filter(r => age(r) >= 14 && age(r) < 31)], ['Earlier', list.filter(r => age(r) >= 31)]];
  const seen = seenAtOpen;
  body.innerHTML = `${bar}
    <div class="nm-filters">${[['all', 'All'], ['albums', 'Albums'], ['singles', 'Singles & EPs']].map(([v, l]) => `<button class="q-chip${filter === v ? ' on' : ''}" data-f="${v}">${l}</button>`).join('')}</div>
    ${picks.length ? `<div class="section-title">For you</div>${forYouHero(picks[0])}${picks.length > 1 ? `<div class="row-scroll nm-picks">${picks.slice(1).map(card).join('')}</div>` : ''}` : ''}
    ${soon.length && filter === 'all' ? `<div class="section-title">Coming soon</div><div class="row-scroll">${soon.slice(0, 20).map(soonCard).join('')}</div>` : ''}
    ${groups.filter(([, l]) => l.length).map(([t, l]) => `<div class="section-title nm-sub">${t}</div><div class="nm-list">${l.map(r => row(r, seen)).join('')}</div>`).join('')}
    ${!list.length && !loading ? '<p class="empty">Nothing new from the artists you listen to in the last few months.</p>' : ''}`;
  body.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; render(); });
  body.querySelectorAll('.glass').forEach(el => window.__lumenGlass?.attach(el));
}

export function open() {
  seenAtOpen = Number(localStorage.getItem('lumen.newSeenAt') || 0);
  markSeen();
  render();
  refresh();
}
