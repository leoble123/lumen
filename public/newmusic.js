// New Music: fresh releases from the artists you follow (and listen to most), plus what's announced as coming soon.
// Spotify has no "upcoming releases" data, so "Coming soon" comes from MusicBrainz (open music database).
import { api } from './api.js';
import * as kv from './kv.js';
import { icons } from './icons.js';
import { pickImage } from './pages.js';

let ctx;   // { play, openPage, toast, isLoggedIn, onBadge(count) }
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9぀-ヿ一-鿿가-힯]+/g, '');
const DAY = 864e5;
let releases = [], upcoming = [], loading = null, filter = 'all', loadedAt = 0;

export function setup(c) { ctx = c; }

const dateOf = r => {   // Spotify dates can be "2026", "2026-11" or "2026-11-21"
  const d = r.release_date || '';
  return new Date(d.length === 4 ? `${d}-01-01` : d.length === 7 ? `${d}-01` : d).getTime();
};

async function artistList() {
  const out = new Map();
  try {
    let page = (await api('/me/following', { query: { type: 'artist', limit: 50 } })).artists;
    while (page) {
      for (const a of page.items || []) if (a) out.set(a.id, { id: a.id, name: a.name, img: pickImage(a.images, true) });
      if (!page.next || out.size >= 250) break;
      page = (await api(page.next)).artists;
    }
  } catch {}
  // the artists you actually play count too (people often don't press "follow")
  try {
    const top = await api('/me/top/artists', { query: { time_range: 'medium_term', limit: 30 } });
    for (const a of top.items || []) if (a && !out.has(a.id)) out.set(a.id, { id: a.id, name: a.name, img: pickImage(a.images, true), top: true });
  } catch {}
  return [...out.values()];
}

async function releasesFor(a) {
  const key = 'rel:' + a.id;
  const saved = await kv.get(key).catch(() => null);
  if (saved && Date.now() - saved.at < 12 * 3600e3) return saved.items;
  const r = await api(`/artists/${a.id}/albums`, { query: { include_groups: 'album,single', limit: 10 } });
  const items = (r.items || []).filter(Boolean).map(x => ({
    id: x.id, uri: x.uri, name: x.name, type: x.album_type, release_date: x.release_date, img: pickImage(x.images),
    artists: (x.artists || []).map(y => ({ id: y.id, name: y.name })), artistId: a.id,
  }));
  kv.set(key, { at: Date.now(), items }).catch(() => {});
  return items;
}

async function upcomingFor(artists) {
  const key = 'upcoming:' + norm(artists.map(a => a.id).join(',')).slice(0, 40);
  const saved = await kv.get(key).catch(() => null);
  if (saved && Date.now() - saved.at < 24 * 3600e3) return saved.items;
  const today = new Date(Date.now() + DAY).toISOString().slice(0, 10);
  const names = artists.slice(0, 40).map(a => a.name);
  const wanted = new Map(artists.map(a => [norm(a.name), a]));
  const found = [];
  // one search per 20 artists, a second apart (MusicBrainz asks apps to go easy)
  for (let i = 0; i < names.length; i += 20) {
    const q = `(${names.slice(i, i + 20).map(n => `artist:"${n.replace(/"/g, '')}"`).join(' OR ')}) AND firstreleasedate:[${today} TO 2099-12-31]`;
    try {
      const r = await fetch(`https://musicbrainz.org/ws/2/release-group/?${new URLSearchParams({ query: q, fmt: 'json', limit: 50 })}`).then(x => x.json());
      for (const g of r['release-groups'] || []) {
        const credit = (g['artist-credit'] || []).map(c => c.name || c.artist?.name);
        const match = credit.map(norm).map(n => wanted.get(n)).find(Boolean);
        const date = g['first-release-date'];
        if (!match || !date || date <= today.slice(0, date.length)) continue;
        found.push({ id: g.id, name: g.title, type: (g['primary-type'] || 'Release').toLowerCase(), date, artist: match,
          img: `https://coverartarchive.org/release-group/${g.id}/front-250` });
      }
    } catch {}
    if (i + 20 < names.length) await new Promise(r => setTimeout(r, 1100));
  }
  const items = [...new Map(found.map(x => [norm(x.artist.name + x.name), x])).values()].sort((a, b) => a.date.localeCompare(b.date));
  kv.set(key, { at: Date.now(), items }).catch(() => {});
  return items;
}

/** Loads everything (quietly, in the background is fine). Streams progress into the page if it's open. */
export function refresh(force) {
  if (!ctx.isLoggedIn()) return Promise.resolve();
  if (loading) return loading;
  if (!force && Date.now() - loadedAt < 30 * 60e3 && releases.length) return Promise.resolve();
  loading = (async () => {
    const artists = await artistList();
    const cutoff = Date.now() - 120 * DAY;
    const all = new Map();
    let done = 0;
    const queue = [...artists];
    const worker = async () => {
      while (queue.length) {
        const a = queue.shift();
        try { for (const r of await releasesFor(a)) if (dateOf(r) >= cutoff && dateOf(r) <= Date.now() + DAY) all.set(r.id, r); } catch {}
        done++;
        if (done % 6 === 0 || !queue.length) { releases = [...all.values()].sort((x, y) => dateOf(y) - dateOf(x)); render(`Checking your artists… ${done} of ${artists.length}`); }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    releases = [...all.values()].sort((x, y) => dateOf(y) - dateOf(x));
    loadedAt = Date.now();
    render();
    updateBadge();
    upcoming = await upcomingFor(artists.filter(a => a.top).concat(artists.filter(a => !a.top))).catch(() => []);
    render();
  })().finally(() => { loading = null; });
  return loading;
}

function updateBadge() {
  const seen = Number(localStorage.getItem('lumen.newSeenAt') || 0);
  const fresh = releases.filter(r => dateOf(r) > seen && dateOf(r) > Date.now() - 14 * DAY).length;
  ctx.onBadge(fresh);
}
export function markSeen() { localStorage.setItem('lumen.newSeenAt', String(Date.now())); ctx.onBadge(0); }

const fmtDate = t => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
function card(r) {
  const age = Math.floor((Date.now() - dateOf(r)) / DAY);
  const when = age <= 0 ? 'Today' : age === 1 ? 'Yesterday' : age < 7 ? `${age} days ago` : fmtDate(dateOf(r));
  return `<div class="tile nm-card" data-kind="album" data-id="${esc(r.id)}" data-uri="${esc(r.uri)}">
    <div class="cover"><img src="${esc(r.img)}" loading="lazy" alt=""><button class="tile-play glass" aria-label="Play">${icons.play}</button>
      ${age < 7 ? '<span class="nm-badge">NEW</span>' : ''}</div>
    <div class="t">${esc(r.name)}</div><div class="s">${esc(r.artists.map(a => a.name).join(', '))} · ${r.type === 'single' ? 'Single' : 'Album'} · ${when}</div></div>`;
}
function soonCard(u) {
  const d = u.date.length === 10 ? fmtDate(u.date) : u.date;
  return `<div class="tile nm-card soon" data-kind="artist" data-id="${esc(u.artist.id)}">
    <div class="cover"><img src="${esc(u.img)}" loading="lazy" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'soon-ph',textContent:'${esc(u.artist.name.slice(0, 1))}'}))"><span class="nm-date">${esc(d)}</span></div>
    <div class="t">${esc(u.name)}</div><div class="s">${esc(u.artist.name)} · ${esc(u.type)}</div></div>`;
}

export function render(progress) {
  const body = $('#new-body');
  if (!body) return;
  if (!ctx.isLoggedIn()) { body.innerHTML = '<p class="empty">Connect Spotify to see new music from your artists.</p>'; return; }
  const list = releases.filter(r => filter === 'all' || (filter === 'albums' ? r.type === 'album' : r.type !== 'album'));
  const age = r => (Date.now() - dateOf(r)) / DAY;
  const groups = [['Out now', list.filter(r => age(r) < 15)], ['Earlier this month', list.filter(r => age(r) >= 15 && age(r) < 45)], ['Recently', list.filter(r => age(r) >= 45)]];
  body.innerHTML = `<div class="nm-filters">${[['all', 'All'], ['albums', 'Albums'], ['singles', 'Singles & EPs']].map(([v, l]) => `<button class="q-chip${filter === v ? ' on' : ''}" data-f="${v}">${l}</button>`).join('')}</div>
    ${progress ? `<p class="set-hint nm-progress">${esc(progress)}</p>` : ''}
    ${upcoming.length ? `<div class="section-title">Coming soon</div><div class="row-scroll">${upcoming.map(soonCard).join('')}</div>` : ''}
    ${groups.filter(([, l]) => l.length).map(([t, l]) => `<div class="section-title">${t}</div><div class="grid nm-grid">${l.map(card).join('')}</div>`).join('')}
    ${!list.length && !progress && !loading ? '<p class="empty">No new releases from your artists in the last few months. Follow more artists in Spotify to see more here.</p>' : ''}`;
  body.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { filter = b.dataset.f; render(); });
}

export function open() {
  markSeen();
  if (!releases.length && !loading) { $('#new-body').innerHTML = `<div class="grid nm-grid">${Array(8).fill('<div><div class="skeleton" style="height:auto;aspect-ratio:1"></div></div>').join('')}</div>`; }
  else render(loading ? 'Checking your artists…' : '');
  refresh();
}
