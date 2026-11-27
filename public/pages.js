// Detail pages (playlist / album / artist / liked songs), track lists, menus, queue and playlist editing.
import { api } from './api.js';
import { icons } from './icons.js';
import * as info from './info.js';

let ctx;                 // { toast, play, showView, getState, getSource, refreshLibrary, needReconnect }
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = ms => { const s = Math.max(0, Math.floor((ms || 0) / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const idOf = uri => uri ? String(uri).split(':').pop() : '';
const run = async fn => { try { return await fn(); } catch (e) { report(e); } };
function report(e) {
  if (e?.status === 403 && /scope/i.test(e.message)) { ctx.needReconnect(); return; }
  ctx.toast(e?.message || String(e));
}

/* ---------------- data helpers ---------------- */
export function pickImage(arr, small) {
  if (!arr?.length) return '';
  const s = [...arr].sort((a, b) => (a.width || 0) - (b.width || 0));
  return small ? (s.find(i => (i.width || 0) >= 60) || s.at(-1)).url : s.at(-1).url;
}
export function normTrack(t, album) {
  if (!t || !t.uri) return null;
  const alb = album || (t.album ? { id: t.album.id || idOf(t.album.uri), uri: t.album.uri, name: t.album.name, image: pickImage(t.album.images, true) } : null);
  return {
    uri: t.uri, id: t.id, name: t.name || 'Unknown', type: t.type || 'track',
    artists: (t.artists || (t.show ? [t.show] : [])).map(a => ({ id: a.id || idOf(a.uri), name: a.name })),
    album: alb, durationMs: t.duration_ms, image: alb?.image || pickImage(t.images, true),
  };
}
let me = null;
const getMe = async () => me || (me = await api('/me'));
async function allPages(first, map, onPage, max = 2000) {
  let page = first, out = [];
  while (page) {
    const items = (page.items || []).map(map).filter(Boolean);
    out = out.concat(items);
    onPage?.(out);
    if (!page.next || out.length >= max) break;
    page = await api(page.next);
  }
  return out;
}
let ownedCache = null;
async function myPlaylists(force) {
  if (ownedCache && !force) return ownedCache;
  const [user, first] = await Promise.all([getMe(), api('/me/playlists', { query: { limit: 50 } })]);
  const all = await allPages(first, p => p, null, 1000);
  ownedCache = all.filter(p => p.owner?.id === user.id || p.collaborative);
  return ownedCache;
}
const libraryContains = async uris => (await api('/me/library/contains', { query: { uris: uris.join(',') } })) || [];
const librarySave = (uri, on) => api('/me/library', { method: on ? 'PUT' : 'DELETE', query: { uris: uri } });

/* ---------------- track lists ---------------- */
const lists = new WeakMap();   // container element -> { tracks, playAt, removable, onRemove, reorder }

export function trackRow(t, i, o = {}) {
  const artists = t.artists.map(a => a.id ? `<span class="link" data-artist="${esc(a.id)}">${esc(a.name)}</span>` : esc(a.name)).join(', ');
  const lead = o.numbered ? `<b>${i + 1}</b>` : `<img src="${esc(t.image)}" loading="lazy" alt="">`;
  return `<div class="track${o.reorder ? ' reorderable' : ''}${o.numbered ? ' numbered' : ''}" data-i="${i}" data-uri="${esc(t.uri)}"${o.reorder ? ' draggable="true"' : ''}>
    ${o.reorder ? `<span class="grip" title="Drag to reorder">${icons.grip}</span>` : ''}
    <span class="lead">${lead}<span class="play-ic">${icons.play}</span><span class="eq"><i></i><i></i><i></i></span></span>
    <div class="ti"><div class="t">${esc(t.name)}</div><div class="s">${artists}</div></div>
    <div class="al">${o.showAlbum && t.album?.id ? `<span class="link" data-album="${esc(t.album.id)}">${esc(t.album.name)}</span>` : ''}</div>
    <span class="dur">${fmt(t.durationMs)}</span>
    <button class="more" aria-label="More options">${icons.more}</button>
  </div>`;
}

export function renderList(el, cfg) {
  lists.set(el, cfg);
  el.classList.add('tracklist');
  el.innerHTML = cfg.tracks.length ? cfg.tracks.map((t, i) => trackRow(t, i, cfg)).join('') : `<p class="empty">${cfg.emptyText || 'No songs here yet.'}</p>`;
  markPlaying();
}

export function markPlaying() {
  const uri = ctx?.getState().track?.uri;
  document.querySelectorAll('.track').forEach(r => r.classList.toggle('playing', !!uri && r.dataset.uri === uri));
}

document.addEventListener('click', e => {
  const link = e.target.closest('.link[data-artist], .link[data-album]');
  if (link) { e.stopPropagation(); return link.dataset.artist ? openPage('artist', link.dataset.artist) : openPage('album', link.dataset.album); }
  const row = e.target.closest('.track');
  if (!row) return;
  const listEl = row.closest('.tracklist'); const cfg = listEl && lists.get(listEl);
  if (!cfg) return;
  const i = Number(row.dataset.i), t = cfg.tracks[i];
  if (e.target.closest('.more')) { e.stopPropagation(); return trackMenu(e.target.closest('.more'), t, i, cfg); }
  run(() => cfg.playAt(i));
});
document.addEventListener('contextmenu', e => {
  const row = e.target.closest('.track'); const listEl = row?.closest('.tracklist'); const cfg = listEl && lists.get(listEl);
  if (!cfg) return;
  e.preventDefault();
  const i = Number(row.dataset.i);
  trackMenu({ getBoundingClientRect: () => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) }, cfg.tracks[i], i, cfg);
});

/* ---- drag to reorder (owned playlists) ---- */
let dragFrom = null;
document.addEventListener('dragstart', e => {
  const row = e.target.closest?.('.track.reorderable'); if (!row) return;
  dragFrom = { el: row.closest('.tracklist'), i: Number(row.dataset.i) };
  row.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', row.dataset.uri);
});
document.addEventListener('dragover', e => {
  const row = e.target.closest?.('.track.reorderable'); if (!row || !dragFrom || row.closest('.tracklist') !== dragFrom.el) return;
  e.preventDefault();
  const r = row.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
  document.querySelectorAll('.drop-before, .drop-after').forEach(x => x.classList.remove('drop-before', 'drop-after'));
  row.classList.add(after ? 'drop-after' : 'drop-before');
});
document.addEventListener('drop', e => {
  const row = e.target.closest?.('.track.reorderable'); if (!row || !dragFrom) return;
  e.preventDefault();
  const after = row.classList.contains('drop-after');
  const to = Number(row.dataset.i) + (after ? 1 : 0);
  const cfg = lists.get(dragFrom.el);
  if (to !== dragFrom.i && to !== dragFrom.i + 1) run(() => cfg.reorder(dragFrom.i, to));
});
document.addEventListener('dragend', () => {
  document.querySelectorAll('.dragging, .drop-before, .drop-after').forEach(x => x.classList.remove('dragging', 'drop-before', 'drop-after'));
  dragFrom = null;
});

/* ---------------- menus ---------------- */
const menuEl = document.createElement('div');
menuEl.id = 'menu'; menuEl.className = 'glass';
let menuItems = [];
export function openMenu(anchor, items) {
  menuItems = items.filter(Boolean);
  menuEl.innerHTML = menuItems.map((it, i) => it === '-' ? '<div class="menu-sep"></div>'
    : `<button data-mi="${i}" class="${it.danger ? 'danger' : ''}"><span>${esc(it.label)}</span>${icons[it.icon] || ''}</button>`).join('');
  if (!menuEl.isConnected) document.body.appendChild(menuEl);
  window.__lumenGlass?.attach(menuEl);
  menuEl.classList.add('show');
  const a = anchor.getBoundingClientRect(), m = menuEl.getBoundingClientRect();
  let left = Math.min(a.right - m.width, innerWidth - m.width - 12); left = Math.max(12, left);
  let top = a.bottom + 6; if (top + m.height > innerHeight - 12) top = Math.max(12, a.top - m.height - 6);
  menuEl.style.left = left + 'px'; menuEl.style.top = top + 'px';
}
export function closeMenu() { menuEl.classList.remove('show'); }
menuEl.addEventListener('click', e => {
  const b = e.target.closest('button[data-mi]'); if (!b) return;
  const it = menuItems[Number(b.dataset.mi)]; closeMenu(); run(it.action);
});
document.addEventListener('pointerdown', e => { if (!menuEl.contains(e.target)) closeMenu(); }, true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); closeModal(); } });
window.addEventListener('blur', closeMenu);
document.addEventListener('scroll', closeMenu, true);

async function trackMenu(anchor, t, i, cfg) {
  let liked = null;
  if (t.type === 'track') liked = await libraryContains([t.uri]).then(r => r[0]).catch(() => null);
  openMenu(anchor, [
    { label: 'Add to queue', icon: 'queue', action: () => addToQueue(t) },
    { label: 'Add to playlist…', icon: 'listAdd', action: () => playlistPicker([t.uri]) },
    liked != null && { label: liked ? 'Remove from Liked Songs' : 'Save to Liked Songs', icon: liked ? 'heart' : 'heartLine', action: () => toggleLike(t.uri, !liked, cfg, i) },
    '-',
    t.type === 'track' && ctx.songInfo && { label: 'Song info & credits', icon: 'info', action: () => ctx.songInfo(t) },
    t.album?.id && !cfg.hideAlbumLink && { label: 'Go to album', icon: 'album', action: () => openPage('album', t.album.id) },
    t.artists[0]?.id && { label: `Go to ${t.artists[0].name}`, icon: 'person', action: () => openPage('artist', t.artists[0].id) },
    cfg.reorder && i > 0 && { label: 'Move up', icon: 'up', action: () => cfg.reorder(i, i - 1) },
    cfg.reorder && i < cfg.tracks.length - 1 && { label: 'Move down', icon: 'down', action: () => cfg.reorder(i, i + 2) },
    cfg.onRemove && '-',
    cfg.onRemove && { label: cfg.removeLabel || 'Remove from this playlist', icon: 'trash', danger: true, action: () => cfg.onRemove(i) },
  ]);
}

async function toggleLike(uri, on, cfg, i) {
  await librarySave(uri, on);
  ctx.toast(on ? 'Saved to Liked Songs' : 'Removed from Liked Songs');
  if (ctx.getState().track?.uri === uri) refreshLikeButton();
  if (!on && cfg?.kind === 'liked') cfg.onRemoveLocal?.(i);
}

/* ---------------- modals ---------------- */
let modalClose = null;
export function openModal(html, mount) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="glass modal" data-glass-blur="22">${html}</div>`;
  document.body.appendChild(wrap);
  window.__lumenGlass?.attach(wrap.firstChild);
  requestAnimationFrame(() => wrap.classList.add('show'));
  wrap.addEventListener('pointerdown', e => { if (e.target === wrap) closeModal(); });
  const close = () => {
    // a closing dialog must not react to clicks while it fades out (they belong to whatever opens next)
    wrap.classList.remove('show'); wrap.inert = true; wrap.style.pointerEvents = 'none'; wrap.firstChild.classList.add('closing');
    setTimeout(() => wrap.remove(), 300);
    if (modalClose === close) modalClose = null;
  };
  modalClose = close;
  mount?.(wrap.firstChild);
  wrap.querySelector('input, textarea')?.focus();
  return modalClose;
}
export function closeModal() { modalClose?.(); }
const confirmBox = (title, text, okLabel) => new Promise(res => {
  openModal(`<h3>${esc(title)}</h3><p class="modal-text">${esc(text)}</p><div class="modal-actions"><button class="text-btn" data-x>Cancel</button><button class="primary small danger-btn" data-ok>${esc(okLabel)}</button></div>`, m => {
    m.querySelector('[data-x]').onclick = () => { closeModal(); res(false); };
    m.querySelector('[data-ok]').onclick = () => { closeModal(); res(true); };
  });
});

function playlistForm({ title, name = '', description = '', isPublic = false, submit, extra = '' }) {
  return new Promise(res => {
    openModal(`<h3>${esc(title)}</h3>
      <label class="field"><span>Name</span><input id="pl-name" maxlength="100" value="${esc(name)}" placeholder="My playlist"></label>
      <label class="field"><span>Description</span><textarea id="pl-desc" maxlength="300" rows="3" placeholder="Optional">${esc(description)}</textarea></label>
      <div class="field-row"><span>Show on my profile</span><button class="switch${isPublic ? ' on' : ''}" id="pl-public" role="switch"></button></div>
      <div class="modal-actions">${extra}<span style="flex:1"></span><button class="text-btn" data-x>Cancel</button><button class="primary small" data-ok>${esc(submit)}</button></div>`, m => {
      const sw = m.querySelector('#pl-public');
      sw.onclick = () => sw.classList.toggle('on');
      m.querySelector('[data-x]').onclick = () => { closeModal(); res(null); };
      const ok = () => {
        const n = m.querySelector('#pl-name').value.trim();
        if (!n) { m.querySelector('#pl-name').focus(); return; }
        closeModal(); res({ name: n, description: m.querySelector('#pl-desc').value.trim(), public: sw.classList.contains('on') });
      };
      m.querySelector('[data-ok]').onclick = ok;
      m.querySelector('#pl-name').addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
      m.querySelector('[data-delete]')?.addEventListener('click', () => { closeModal(); res('delete'); });
    });
  });
}

export async function createPlaylist(addUris) {
  const f = await playlistForm({ title: 'New playlist', submit: 'Create' });
  if (!f) return null;
  const pl = await api('/me/playlists', { method: 'POST', body: f });
  if (addUris?.length) await api(`/playlists/${pl.id}/items`, { method: 'POST', body: { uris: addUris } });
  ownedCache = null; ctx.refreshLibrary();
  ctx.toast(addUris?.length ? `Added to ${pl.name}` : `Created “${pl.name}”`);
  return pl;
}

async function playlistPicker(uris) {
  let lists_;
  try { lists_ = await myPlaylists(); } catch (e) { return report(e); }
  openModal(`<h3>Add to playlist</h3><div class="picker">
      <button class="pick new" data-new>${icons.plus}<span>New playlist…</span></button>
      ${lists_.map(p => `<button class="pick" data-id="${esc(p.id)}"><img src="${esc(pickImage(p.images, true))}" alt=""><span>${esc(p.name)}</span></button>`).join('')}
    </div><div class="modal-actions"><span style="flex:1"></span><button class="text-btn" data-x>Cancel</button></div>`, m => {
    m.querySelector('[data-x]').onclick = closeModal;
    m.querySelector('[data-new]').onclick = () => { closeModal(); run(() => createPlaylist(uris)); };
    m.querySelectorAll('.pick[data-id]').forEach(b => b.onclick = () => run(async () => {
      closeModal();
      const p = lists_.find(x => x.id === b.dataset.id);
      await api(`/playlists/${p.id}/items`, { method: 'POST', body: { uris } });
      ctx.toast(`Added to ${p.name}`);
      if (page?.kind === 'playlist' && page.id === p.id) openPage('playlist', p.id, { replace: true });
    }));
  });
}

/* ---------------- queue ---------------- */
const removedFromQueue = new Map();   // uri -> how many upcoming plays to skip
async function addToQueue(t) {
  const src = ctx.getSource();
  await api('/me/player/queue', { method: 'POST', query: { uri: t.uri, device_id: src?.kind === 'app' ? src.deviceId : undefined } });
  ctx.toast(`Added “${t.name}” to the queue`);
  setTimeout(refreshQueue, 600);
}

export function openQueue() {
  document.querySelectorAll('.sheet.open').forEach(s => s.classList.remove('open'));
  $('#queue').classList.add('open');
  refreshQueue();
}
export function closeQueue() { $('#queue').classList.remove('open'); }
export function toggleQueue() { $('#queue').classList.contains('open') ? closeQueue() : openQueue(); }

let queueSeq = 0;
export async function refreshQueue() {
  if (!$('#queue').classList.contains('open')) return;
  const body = $('#queue-body'), seq = ++queueSeq;
  const src = ctx.getSource();
  if (!src || src.kind === 'demo') { body.innerHTML = '<p class="empty">Connect Spotify to see your queue.</p>'; return; }
  let q;
  try { q = await api('/me/player/queue'); } catch (e) { if (seq === queueSeq) body.innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  if (seq !== queueSeq) return;
  const cur = normTrack(q?.currently_playing);
  const skips = new Map(removedFromQueue);
  const upcoming = (q?.queue || []).map(t => normTrack(t)).filter(Boolean).filter(t => {
    const n = skips.get(t.uri) || 0;
    if (n > 0) { skips.set(t.uri, n - 1); return false; }
    return true;
  });
  body.innerHTML = `<div class="group-title">Now Playing</div><div id="q-now"></div>
    <div class="group-title">Up Next</div><div id="q-next"></div>
    <p class="set-hint q-note">Spotify doesn't let apps delete queue items, so songs you remove are skipped automatically while Lumen is open.</p>`;
  renderList($('#q-now'), { tracks: cur ? [cur] : [], emptyText: 'Nothing playing', playAt: () => {} });
  renderList($('#q-next'), {
    tracks: upcoming, emptyText: 'Your queue is empty. Use “Add to queue” on any song.',
    playAt: () => ctx.toast('Spotify can’t jump ahead in the queue — use Next, or remove songs before it.'),
    onRemove: i => removeFromQueue(upcoming[i]), removeLabel: 'Remove from queue',
  });
}
function removeFromQueue(t) {
  removedFromQueue.set(t.uri, (removedFromQueue.get(t.uri) || 0) + 1);
  ctx.toast(`Removed “${t.name}” from the queue`);
  refreshQueue();
}

/* called by app.js whenever the playing track changes */
export function onTrackChange(track) {
  markPlaying();
  refreshLikeButton();
  if (track && removedFromQueue.get(track.uri) > 0) {
    removedFromQueue.set(track.uri, removedFromQueue.get(track.uri) - 1);
    if (!removedFromQueue.get(track.uri)) removedFromQueue.delete(track.uri);
    run(() => ctx.getSource().next());
  }
  setTimeout(refreshQueue, 500);
}

/* ---------------- like button on Now Playing ---------------- */
let likeSeq = 0;
export async function refreshLikeButton() {
  const btn = $('#btn-like'), t = ctx.getState().track, seq = ++likeSeq;
  if (!t || t.id === 'demo' || !ctx.getSource() || ctx.getSource().kind === 'demo') { btn.classList.remove('on'); btn.innerHTML = icons.heartLine; return; }
  const [on] = await libraryContains([t.uri]).catch(() => [false]);
  if (seq !== likeSeq) return;
  btn.classList.toggle('on', !!on); btn.innerHTML = on ? icons.heart : icons.heartLine;
}
export async function toggleNowPlayingLike() {
  const t = ctx.getState().track;
  if (!t || t.id === 'demo') return ctx.toast('Connect Spotify to like songs.');
  const on = !$('#btn-like').classList.contains('on');
  await run(() => librarySave(t.uri, on).then(() => ctx.toast(on ? 'Saved to Liked Songs' : 'Removed from Liked Songs')));
  refreshLikeButton();
}

/* ---------------- detail pages ---------------- */
let page = null;            // current page { kind, id, ... }
const stack = [];           // history of { kind, id, scroll }
export const currentPage = () => page;

export function resetStack() { stack.length = 0; page = null; }

export async function openPage(kind, id, { replace = false } = {}) {
  closeMenu(); closeModal();
  const view = $('#view-detail');
  if (ctx.currentView() !== 'detail') resetStack();
  if (page && !replace && ctx.currentView() === 'detail') stack.push({ kind: page.kind, id: page.id, scroll: view.scrollTop });
  if (!page || ctx.currentView() !== 'detail') ctx.setDetailFrom(ctx.currentView());
  page = { kind, id };
  const my = page;
  ctx.showView('detail');
  if (!replace) view.scrollTop = 0;
  $('#detail-head').innerHTML = `<div class="hero"><div class="hero-art skeleton"></div><div class="hero-info"><div class="skeleton" style="height:18px;width:80px"></div><div class="skeleton" style="height:44px;width:60%;margin-top:12px"></div></div></div>`;
  $('#detail-body').innerHTML = Array(8).fill('<div class="skeleton" style="height:58px;margin-bottom:4px"></div>').join('');
  try {
    if (kind === 'album') await albumPage(my);
    else if (kind === 'playlist') await playlistPage(my);
    else if (kind === 'artist') await artistPage(my);
    else if (kind === 'liked') await likedPage(my);
  } catch (e) {
    if (page !== my) return;
    $('#detail-head').innerHTML = '';
    $('#detail-body').innerHTML = `<p class="empty">Couldn't open this: ${esc(e.message)}</p>`;
    report(e);
  }
}

export function back() {
  const prev = stack.pop();
  if (!prev) { const from = ctx.detailFrom() || 'library'; resetStack(); ctx.showView(from); return; }
  openPage(prev.kind, prev.id, { replace: true }).then(() => { $('#view-detail').scrollTop = prev.scroll || 0; });
}

function hero({ image, round, label, title, sub, desc, actions }) {
  return `<div class="hero">
    <div class="hero-art${round ? ' round' : ''}">${image ? `<img src="${esc(image)}" alt="">` : `<div class="hero-ph">${icons.note}</div>`}</div>
    <div class="hero-info">
      <div class="hero-label">${label}</div>
      <h1 class="hero-title">${esc(title)}</h1>
      ${desc ? `<div class="hero-desc">${desc}</div>` : ''}
      <div class="hero-sub">${sub}</div>
      <div class="hero-actions">${actions}</div>
    </div></div>`;
}
const actionBtns = ({ like, edit, follow } = {}) => `
  <button class="primary pill" data-act="play">${icons.play}<span>Play</span></button>
  <button class="glass pill" data-act="shuffle">${icons.shuffle}<span>Shuffle</span></button>
  ${like != null ? `<button class="glass circle-btn hero-like${like ? ' on' : ''}" data-act="like" aria-label="Save">${like ? icons.heart : icons.heartLine}</button>` : ''}
  ${follow != null ? `<button class="glass pill" data-act="follow">${follow ? 'Following' : 'Follow'}</button>` : ''}
  ${edit ? `<button class="glass circle-btn" data-act="edit" aria-label="Edit playlist">${icons.pencil}</button>` : ''}`;

function wireHero(handlers) {
  const head = $('#detail-head');
  head.querySelectorAll('[data-act]').forEach(b => b.onclick = () => run(() => handlers[b.dataset.act]?.(b)));
  head.querySelectorAll('.glass').forEach(el => window.__lumenGlass?.attach(el));
}
const totalTime = tracks => { const m = Math.round(tracks.reduce((s, t) => s + (t.durationMs || 0), 0) / 60000); return m >= 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`; };
const playThenShuffle = async (body, shuffle) => {
  const src = ctx.getSource();
  await ctx.play(body);
  if (src) await src.shuffle(shuffle).catch(() => {});
};

async function albumPage(my) {
  const a = await api(`/albums/${my.id}`);
  if (page !== my) return;
  const albumInfo = { id: a.id, uri: a.uri, name: a.name, image: pickImage(a.images, true) };
  let tracks = (a.tracks?.items || []).map(t => normTrack(t, albumInfo)).filter(Boolean);
  const [liked] = await libraryContains([a.uri]).catch(() => [null]);
  const year = (a.release_date || '').slice(0, 4);
  const artists = (a.artists || []).map(x => `<span class="link" data-artist="${esc(x.id)}">${esc(x.name)}</span>`).join(', ');
  const render = () => {
    $('#detail-head').innerHTML = hero({ image: pickImage(a.images), label: `${a.album_type === 'single' ? 'Single' : 'Album'}${year ? ' · ' + year : ''}`, title: a.name,
      sub: `${artists} · ${tracks.length} songs · ${totalTime(tracks)}`, actions: actionBtns({ like: liked }) });
    wireHero({
      play: () => playThenShuffle({ context_uri: a.uri }, false),
      shuffle: () => playThenShuffle({ context_uri: a.uri }, true),
      like: async b => { const on = !b.classList.contains('on'); await librarySave(a.uri, on); b.classList.toggle('on', on); b.innerHTML = on ? icons.heart : icons.heartLine; ctx.toast(on ? 'Album saved to your library' : 'Album removed from your library'); },
    });
    renderList($('#detail-body'), { kind: 'album', tracks, numbered: true, hideAlbumLink: true, playAt: i => ctx.play({ context_uri: a.uri, offset: { uri: tracks[i].uri } }) });
  };
  render();
  if (a.tracks?.next) { tracks = await allPages(await api(a.tracks.next), t => normTrack(t, albumInfo)).then(more => tracks.concat(more)); if (page === my) render(); }
}

async function playlistPage(my) {
  const [p, user] = await Promise.all([api(`/playlists/${my.id}`), getMe()]);
  if (page !== my) return;
  const owned = p.owner?.id === user.id, canEdit = owned || p.collaborative;
  const entryToTrack = e => normTrack(e?.item || e?.track);
  let tracks = [];
  let snapshot = p.snapshot_id;
  let following = null;
  if (!owned) following = await libraryContains([p.uri]).then(r => r[0]).catch(() => null);
  const desc = p.description ? esc(new DOMParser().parseFromString(p.description, 'text/html').body.textContent) : '';

  const render = () => {
    if (page !== my) return;
    const songs = p.items ? `${tracks.length} songs · ${totalTime(tracks)}` : '';
    $('#detail-head').innerHTML = hero({ image: pickImage(p.images), label: `Playlist${p.public === false ? ' · Private' : ''}`, title: p.name, desc,
      sub: `By ${esc(p.owner?.display_name || 'Spotify')}${songs ? ' · ' + songs : ''}`, actions: actionBtns({ edit: owned, follow: owned ? null : following }) });
    wireHero({
      play: () => playThenShuffle({ context_uri: p.uri }, false),
      shuffle: () => playThenShuffle({ context_uri: p.uri }, true),
      edit: () => editPlaylist(p),
      follow: async () => { following = !following; await librarySave(p.uri, following); ctx.toast(following ? 'Added to your library' : 'Removed from your library'); ctx.refreshLibrary(); render(); },
    });
    if (!p.items) {
      $('#detail-body').innerHTML = `<div class="notice glass">${icons.note}<div><b>Songs aren't available for this playlist</b><span>Spotify only lets personal apps list the songs in playlists you own or collaborate on. You can still play or shuffle it.</span></div></div>`;
      window.__lumenGlass?.attach($('#detail-body .notice'));
      return;
    }
    renderList($('#detail-body'), {
      kind: 'playlist', tracks, showAlbum: true, reorder: canEdit,
      emptyText: canEdit ? 'This playlist is empty. Use “Add to playlist…” on any song to add it here.' : 'This playlist is empty.',
      playAt: i => ctx.play({ context_uri: p.uri, offset: { uri: tracks[i].uri } }),
      onRemove: canEdit ? async i => {
        const t = tracks[i];
        const r = await api(`/playlists/${p.id}/items`, { method: 'DELETE', body: { items: [{ uri: t.uri }], snapshot_id: snapshot } });
        snapshot = r?.snapshot_id || snapshot;
        tracks = tracks.filter(x => x.uri !== t.uri);
        ctx.toast(`Removed “${t.name}”`); render();
      } : null,
      reorder: canEdit ? async (from, to) => {
        const r = await api(`/playlists/${p.id}/items`, { method: 'PUT', body: { range_start: from, insert_before: to, range_length: 1, snapshot_id: snapshot } });
        snapshot = r?.snapshot_id || snapshot;
        const [moved] = tracks.splice(from, 1);
        tracks.splice(to > from ? to - 1 : to, 0, moved);
        render();
      } : null,
    });
  };
  render();
  if (p.items) {
    await allPages(p.items, entryToTrack, list => { tracks = list; render(); });
  }
}

async function editPlaylist(p) {
  const f = await playlistForm({ title: 'Edit playlist', name: p.name, description: p.description ? new DOMParser().parseFromString(p.description, 'text/html').body.textContent : '',
    isPublic: !!p.public, submit: 'Save', extra: `<button class="text-btn danger-text" data-delete>${icons.trash}Delete</button>` });
  if (!f) return;
  if (f === 'delete') {
    if (!(await confirmBox('Delete playlist?', `“${p.name}” will be removed from your library.`, 'Delete'))) return;
    await api('/me/library', { method: 'DELETE', query: { uris: p.uri } });
    ownedCache = null; ctx.refreshLibrary(); ctx.toast(`Deleted “${p.name}”`);
    resetStack(); ctx.showView('library');
    return;
  }
  await api(`/playlists/${p.id}`, { method: 'PUT', body: f });
  ownedCache = null; ctx.refreshLibrary(); ctx.toast('Playlist updated');
  openPage('playlist', p.id, { replace: true });
}

async function artistPage(my) {
  const a = await api(`/artists/${my.id}`);
  if (page !== my) return;
  // "Top tracks" was removed from Spotify's API (Feb 2026), so popular songs come from search
  const [search, albums, singles] = await Promise.all([
    api('/search', { query: { q: `artist:"${a.name}"`, type: 'track', limit: 10 } }).catch(() => null),
    api(`/artists/${my.id}/albums`, { query: { include_groups: 'album', limit: 10 } }).catch(() => null),
    api(`/artists/${my.id}/albums`, { query: { include_groups: 'single', limit: 10 } }).catch(() => null),
  ]);
  if (page !== my) return;
  let top = (search?.tracks?.items || []).filter(Boolean);
  const byArtist = top.filter(t => t.artists?.some(x => x.id === a.id));
  top = (byArtist.length >= 3 ? byArtist : top).map(t => normTrack(t));
  $('#detail-head').innerHTML = hero({ image: pickImage(a.images), round: true, label: 'Artist', title: a.name,
    sub: (a.genres || []).slice(0, 3).map(esc).join(' · '), actions: actionBtns() });
  wireHero({
    play: () => playThenShuffle({ context_uri: a.uri }, false),
    shuffle: () => playThenShuffle({ context_uri: a.uri }, true),
  });
  const albumTiles = list => (list?.items || []).filter(Boolean).map(x => `<div class="tile" data-kind="album" data-id="${esc(x.id)}" data-uri="${esc(x.uri)}">
      <div class="cover"><img src="${esc(pickImage(x.images))}" loading="lazy" alt=""><button class="tile-play glass" aria-label="Play">${icons.play}</button></div>
      <div class="t">${esc(x.name)}</div><div class="s">${esc((x.release_date || '').slice(0, 4))}</div></div>`).join('');
  $('#detail-body').innerHTML = `<div class="section-title">Popular</div><div id="artist-top"></div>
    ${albums?.items?.length ? `<div class="section-title">Albums</div><div class="row-scroll">${albumTiles(albums)}</div>` : ''}
    ${singles?.items?.length ? `<div class="section-title">Singles & EPs</div><div class="row-scroll">${albumTiles(singles)}</div>` : ''}`;
  // A short bio from Wikipedia, when we can be sure it's the right artist
  info.artistAbout(a.name).then(v => {
    if (!v || page !== my) return;
    $('#artist-top').insertAdjacentHTML('afterend', `<div class="section-title">About</div>${info.aboutHtml(v)}`);
    const box = document.querySelector('#detail-body .about');
    window.__lumenGlass?.attach(box);
    box.querySelector('.about-text').onclick = () => box.classList.toggle('open');
  });
  renderList($('#artist-top'), { kind: 'artist', tracks: top, showAlbum: true, emptyText: 'No songs found.',
    playAt: i => ctx.play({ uris: [...top.slice(i), ...top.slice(0, i)].map(t => t.uri) }) });
}

async function likedPage(my) {
  const user = await getMe();
  let tracks = [];
  const collection = `spotify:user:${user.id}:collection`;
  const playFrom = async i => {
    try { await ctx.play({ context_uri: collection, offset: { uri: tracks[i].uri } }, { quiet: true }); }
    catch { await ctx.play({ uris: tracks.slice(i, i + 100).map(t => t.uri) }); }
  };
  const render = () => {
    if (page !== my) return;
    $('#detail-head').innerHTML = hero({ image: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#5b3cff"/><stop offset="1" stop-color="#ff5fa2"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><path transform="translate(26 26) scale(2)" fill="#fff" d="M12 20.3s-7.8-4.6-7.8-10.4A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 7.8 2.7c0 5.8-7.8 10.4-7.8 10.4z"/></svg>'),
      label: 'Playlist', title: 'Liked Songs', sub: `${tracks.length} songs`, actions: actionBtns() });
    wireHero({ play: () => playFrom(0).then(() => ctx.getSource()?.shuffle(false).catch(() => {})), shuffle: () => playFrom(Math.floor(Math.random() * tracks.length)).then(() => ctx.getSource()?.shuffle(true).catch(() => {})) });
    renderList($('#detail-body'), { kind: 'liked', tracks, showAlbum: true, emptyText: 'Songs you like will appear here.', playAt: playFrom,
      onRemoveLocal: i => { tracks.splice(i, 1); render(); } });
  };
  const first = await api('/me/tracks', { query: { limit: 50 } });
  await allPages(first, e => normTrack(e.track), list => { tracks = list; render(); }, 3000);
}

export function setup(c) { ctx = c; }
