// Home: greeting, quick picks, jump back in, recently played, top artists & songs, saved albums, playlists.
import { api } from './api.js';
import { icons } from './icons.js';
import { normTrack, pickImage, renderList } from './pages.js';

let ctx;     // { play, toast, needReconnect, isLoggedIn, isDemo }
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const idOf = uri => String(uri || '').split(':').pop();
let loadedAt = 0, loading = null, me = null;

export function setup(c) { ctx = c; }

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : h < 22 ? 'Good evening' : 'Good night';
}

const tile = (o, round) => `<div class="tile${round ? ' round' : ''}" data-kind="${o.kind}" data-id="${esc(o.id)}" data-uri="${esc(o.uri)}">
  <div class="cover">${o.img ? `<img src="${esc(o.img)}" loading="lazy" alt="">` : `<div class="hero-ph">${icons.note}</div>`}<button class="tile-play glass" aria-label="Play">${icons.play}</button></div>
  <div class="t">${esc(o.title)}</div>${o.sub ? `<div class="s">${esc(o.sub)}</div>` : ''}</div>`;
const quick = o => `<div class="tile qp" data-kind="${o.kind}" data-id="${esc(o.id)}" data-uri="${esc(o.uri)}">
  ${o.img ? `<img src="${esc(o.img)}" alt="">` : `<span class="qp-ph">${icons.heart}</span>`}<span class="qp-t">${esc(o.title)}</span>
  <button class="tile-play glass" aria-label="Play">${icons.play}</button></div>`;
const section = (title, body, id = '') => body ? `<section class="home-sec"${id ? ` id="${id}"` : ''}><div class="section-title">${title}</div>${body}</section>` : '';

const LIKED_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#5b3cff"/><stop offset="1" stop-color="#ff5fa2"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><path transform="translate(26 26) scale(2)" fill="#fff" d="M12 20.3s-7.8-4.6-7.8-10.4A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 7.8 2.7c0 5.8-7.8 10.4-7.8 10.4z"/></svg>');

// Turn "recently played" into the albums / playlists / artists you were listening to
async function recentContexts(items) {
  const seen = new Map();
  for (const it of items) {
    const c = it.context, t = it.track;
    if (!t) continue;
    let key, o;
    if (c?.uri?.includes(':collection')) { key = 'liked'; o = { kind: 'liked', id: '', uri: 'liked', title: 'Liked Songs', img: LIKED_IMG }; }
    else if (c?.type === 'playlist') { key = c.uri; o = { kind: 'playlist', id: idOf(c.uri), uri: c.uri, title: '', img: '' }; }
    else if (c?.type === 'artist') { key = c.uri; const a = t.artists.find(x => x.uri === c.uri) || t.artists[0]; o = { kind: 'artist', id: idOf(c.uri), uri: c.uri, title: a?.name || 'Artist', img: '', round: true }; }
    else { key = t.album.uri; o = { kind: 'album', id: t.album.id || idOf(t.album.uri), uri: t.album.uri, title: t.album.name, sub: t.artists.map(a => a.name).join(', '), img: pickImage(t.album.images) }; }
    if (!seen.has(key)) seen.set(key, o);
    if (seen.size >= 12) break;
  }
  const list = [...seen.values()];
  // fill in names/pictures for playlists & artists (one small request each)
  await Promise.all(list.map(async o => {
    try {
      if (o.kind === 'playlist') { const p = await api(`/playlists/${o.id}`, { query: { fields: 'name,images,owner(display_name)' } }); o.title = p.name; o.img = pickImage(p.images); o.sub = p.owner?.display_name ? `By ${p.owner.display_name}` : 'Playlist'; }
      if (o.kind === 'artist') { const a = await api(`/artists/${o.id}`); o.img = pickImage(a.images); o.sub = 'Artist'; }
    } catch { o.broken = !o.title; }
  }));
  return list.filter(o => !o.broken && o.title);
}

export async function load(force) {
  const view = $('#home-body');
  $('#home-greet').textContent = greeting();
  $('#home-date').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  if (!ctx.isLoggedIn()) {
    view.innerHTML = `<div class="notice glass">${icons.note}<div><b>Connect Spotify to fill your Home</b><span>Your recent music, top artists and playlists will show up here. Open ⚙ Customize → Connect Spotify.</span></div></div>`;
    return;
  }
  if (loading) return loading;
  if (!force && Date.now() - loadedAt < 5 * 60 * 1000 && view.dataset.ready) return;
  if (!view.dataset.ready) view.innerHTML = `<div class="quick-grid">${Array(6).fill('<div class="skeleton" style="height:64px"></div>').join('')}</div>`;
  loading = (async () => {
    const [meR, recentR, topAR, topTR, albumsR, plsR] = await Promise.allSettled([
      me ? Promise.resolve(me) : api('/me'),
      api('/me/player/recently-played', { query: { limit: 50 } }),
      api('/me/top/artists', { query: { time_range: 'short_term', limit: 12 } }),
      api('/me/top/tracks', { query: { time_range: 'short_term', limit: 10 } }),
      api('/me/albums', { query: { limit: 20 } }),
      api('/me/playlists', { query: { limit: 20 } }),
    ]);
    if ([recentR, topAR, topTR].some(r => r.status === 'rejected' && r.reason?.status === 403)) ctx.needReconnect();
    if (meR.status === 'fulfilled') { me = meR.value; const first = (me.display_name || '').split(' ')[0]; if (first) $('#home-greet').textContent = `${greeting()}, ${first}`; }
    const recentItems = recentR.status === 'fulfilled' ? recentR.value.items || [] : [];
    const contexts = await recentContexts(recentItems);
    const topArtists = topAR.status === 'fulfilled' ? (topAR.value.items || []).filter(Boolean) : [];
    const topTracks = topTR.status === 'fulfilled' ? (topTR.value.items || []).map(t => normTrack(t)).filter(Boolean) : [];
    const albums = albumsR.status === 'fulfilled' ? (albumsR.value.items || []).map(i => i.album).filter(Boolean) : [];
    const playlists = plsR.status === 'fulfilled' ? (plsR.value.items || []).filter(Boolean) : [];
    const recentTracks = [];
    const seenT = new Set();
    for (const it of recentItems) { const t = normTrack(it.track); if (t && !seenT.has(t.uri)) { seenT.add(t.uri); recentTracks.push(t); } if (recentTracks.length >= 8) break; }

    // Quick picks: what you've been playing, topped up with favourites
    const picks = [...contexts];
    for (const a of topArtists) picks.push({ kind: 'artist', id: a.id, uri: a.uri, title: a.name, img: pickImage(a.images, true) });
    for (const p of playlists) picks.push({ kind: 'playlist', id: p.id, uri: p.uri, title: p.name, img: pickImage(p.images, true) });
    const uniq = []; const seenP = new Set();
    for (const p of picks) { if (!seenP.has(p.uri)) { seenP.add(p.uri); uniq.push(p); } if (uniq.length >= 6) break; }

    view.innerHTML =
      (uniq.length ? `<div class="quick-grid">${uniq.map(quick).join('')}</div>` : '') +
      section('Jump back in', contexts.length ? `<div class="row-scroll">${contexts.map(o => tile(o, o.round)).join('')}</div>` : '') +
      section('Recently played', recentTracks.length ? '<div id="home-recent"></div>' : '') +
      section('Your top artists', topArtists.length ? `<div class="row-scroll">${topArtists.map(a => tile({ kind: 'artist', id: a.id, uri: a.uri, title: a.name, img: pickImage(a.images), sub: 'Artist' }, true)).join('')}</div>` : '') +
      section('On repeat', topTracks.length ? '<div id="home-top"></div>' : '') +
      section('Your albums', albums.length ? `<div class="row-scroll">${albums.map(a => tile({ kind: 'album', id: a.id, uri: a.uri, title: a.name, img: pickImage(a.images), sub: (a.artists || []).map(x => x.name).join(', ') })).join('')}</div>` : '') +
      section('Your playlists', playlists.length ? `<div class="row-scroll">${playlists.map(p => tile({ kind: 'playlist', id: p.id, uri: p.uri, title: p.name, img: pickImage(p.images), sub: p.owner?.display_name ? `By ${p.owner.display_name}` : '' })).join('')}</div>` : '');
    if (!view.innerHTML.trim()) view.innerHTML = '<p class="empty">Play some music and your Home will fill up.</p>';
    if (recentTracks.length) renderList($('#home-recent'), { kind: 'home', tracks: recentTracks, showAlbum: true, playAt: i => ctx.play(recentTracks[i].album?.uri ? { context_uri: recentTracks[i].album.uri, offset: { uri: recentTracks[i].uri } } : { uris: [recentTracks[i].uri] }) });
    if (topTracks.length) renderList($('#home-top'), { kind: 'home', tracks: topTracks, showAlbum: true, playAt: i => ctx.play({ uris: [...topTracks.slice(i), ...topTracks.slice(0, i)].map(t => t.uri) }) });
    view.dataset.ready = '1';
    loadedAt = Date.now();
  })().catch(e => { view.innerHTML = `<p class="empty">Couldn't load Home: ${esc(e.message)}</p>`; }).finally(() => { loading = null; });
  return loading;
}
