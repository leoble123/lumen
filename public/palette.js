// Command palette (Ctrl/Cmd+K): type to run any action, change any setting, apply a theme, or play/open anything on Spotify.
import { api } from './api.js';
import { icons } from './icons.js';
import { normTrack, pickImage } from './pages.js';

let ctx;   // { commands(): [{ title, hint, icon, keywords, run }], play, openPage, toast, isLoggedIn }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let el, input, list, items = [], sel = 0, searchSeq = 0, searchTimer, open = false;

export function setup(c) { ctx = c; }

// Fuzzy match: every typed character must appear in order; word starts and runs score higher
export function score(text, q) {
  text = text.toLowerCase(); q = q.toLowerCase().trim();
  if (!q) return 1;
  if (text.includes(q)) return 1000 - text.indexOf(q) + (text.startsWith(q) ? 200 : 0);
  let ti = 0, s = 0, run = 0;
  for (const ch of q) {
    if (ch === ' ') continue;
    const i = text.indexOf(ch, ti);
    if (i < 0) return 0;
    run = i === ti ? run + 1 : 0;
    s += 10 + run * 6 + (i === 0 || /[\s:/-]/.test(text[i - 1]) ? 15 : 0) - Math.min(8, i - ti);
    ti = i + 1;
  }
  return Math.max(1, s);
}

function build() {
  el = document.createElement('div');
  el.id = 'palette';
  el.innerHTML = `<div class="glass pal-box" data-glass-blur="20">
      <div class="pal-input">${icons.search}<input placeholder="Type a command, setting, song, artist…" spellcheck="false" autocomplete="off"><kbd>esc</kbd></div>
      <div class="pal-list"></div>
    </div>`;
  document.body.appendChild(el);
  window.__lumenGlass?.attach(el.querySelector('.pal-box'));
  input = el.querySelector('input'); list = el.querySelector('.pal-list');
  input.addEventListener('input', () => { sel = 0; render(); queueSearch(); });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); runItem(items[sel]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  });
  list.addEventListener('mousemove', e => { const r = e.target.closest('[data-i]'); if (r && Number(r.dataset.i) !== sel) { sel = Number(r.dataset.i); highlight(); } });
  list.addEventListener('click', e => { const r = e.target.closest('[data-i]'); if (r) runItem(items[Number(r.dataset.i)]); });
  el.addEventListener('pointerdown', e => { if (e.target === el) close(); });
}

let remote = [];
function render() {
  const q = input.value;
  const cmds = ctx.commands().map(c => ({ ...c, s: score(`${c.title} ${c.keywords || ''}`, q) })).filter(c => c.s > 0);
  cmds.sort((a, b) => b.s - a.s);
  items = [...cmds.slice(0, q ? 8 : 12), ...remote];
  if (!items.length) { list.innerHTML = `<div class="pal-empty">${q.length > 1 && ctx.isLoggedIn() ? 'Searching Spotify…' : 'No matches'}</div>`; return; }
  let html = '', group = null;
  items.forEach((it, i) => {
    if (it.group !== group) { group = it.group; html += `<div class="pal-group">${esc(group)}</div>`; }
    html += `<div class="pal-item" data-i="${i}">${it.img ? `<img src="${esc(it.img)}" alt=""${it.round ? ' class="round"' : ''}>` : `<span class="pal-ic">${icons[it.icon] || icons.sliders}</span>`}
      <span class="pal-t">${esc(it.title)}</span>${it.hint ? `<span class="pal-hint">${esc(it.hint)}</span>` : ''}</div>`;
  });
  list.innerHTML = html;
  highlight();
}
function highlight() {
  list.querySelectorAll('.pal-item').forEach(r => r.classList.toggle('sel', Number(r.dataset.i) === sel));
  list.querySelector('.pal-item.sel')?.scrollIntoView({ block: 'nearest' });
}
function move(d) { if (!items.length) return; sel = (sel + d + items.length) % items.length; highlight(); }

function queueSearch() {
  clearTimeout(searchTimer);
  const q = input.value.trim(), my = ++searchSeq;
  if (q.length < 2 || !ctx.isLoggedIn()) { remote = []; render(); return; }
  searchTimer = setTimeout(async () => {
    try {
      const r = await api('/search', { query: { q, type: 'track,artist,album,playlist', limit: 4 } });
      if (my !== searchSeq) return;
      const tracks = (r.tracks?.items || []).filter(Boolean).map(t => { const n = normTrack(t); return { group: 'Songs', title: n.name, hint: n.artists.map(a => a.name).join(', '), img: n.image, run: () => ctx.play(n.album?.uri ? { context_uri: n.album.uri, offset: { uri: n.uri } } : { uris: [n.uri] }) }; });
      const artists = (r.artists?.items || []).filter(Boolean).map(a => ({ group: 'Artists', title: a.name, hint: 'Artist', img: pickImage(a.images, true), round: true, run: () => ctx.openPage('artist', a.id || a.uri.split(':').pop()) }));
      const albums = (r.albums?.items || []).filter(Boolean).map(a => ({ group: 'Albums', title: a.name, hint: (a.artists || []).map(x => x.name).join(', '), img: pickImage(a.images, true), run: () => ctx.openPage('album', a.id || a.uri.split(':').pop()) }));
      const pls = (r.playlists?.items || []).filter(Boolean).map(p => ({ group: 'Playlists', title: p.name, hint: p.owner?.display_name || '', img: pickImage(p.images, true), run: () => ctx.openPage('playlist', p.id || p.uri.split(':').pop()) }));
      remote = [...tracks, ...artists, ...albums, ...pls];
      render();
    } catch { if (my === searchSeq) { remote = []; render(); } }
  }, 220);
}

async function runItem(it) {
  if (!it) return;
  close();
  try { await it.run(); } catch (e) { ctx.toast(e.message); }
}

export function openPalette(prefill = '') {
  if (!el) build();
  open = true; remote = []; sel = 0;
  input.value = prefill;
  el.classList.add('show');
  input.focus();               // focus right away so fast typing isn't lost
  render();
}
export function close() { if (!el) return; open = false; el.classList.remove('show'); }
export const isOpen = () => open;
