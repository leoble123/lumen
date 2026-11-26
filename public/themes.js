// Themes: built-in presets, your own saved looks, and shareable theme codes.
import { icons } from './icons.js';
import { openModal, closeModal } from './pages.js';

let ctx;   // { settings, ITEMS, validate, applyAll(newValues), toast, store }
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NOT_THEME = new Set(['playbackMode', 'autoUpdate', 'startView']);
const PREFIX = 'LUMEN-THEME:';

export const PRESETS = [
  { name: 'Lumen', swatch: ['#3a1c71', '#b24a6b', '#e08a5f'], s: {} },
  { name: 'Midnight', swatch: ['#05070f', '#2b3a8f', '#5b7cff'], s: { glass: 'tinted', bgStyle: 'stars', accentMode: 'custom', accent: '#5b7cff', bgIntensity: 60, grain: 20, lyricGlow: 55 } },
  { name: 'Sunset', swatch: ['#3a0f2e', '#ff7a45', '#ffc36b'], s: { bgStyle: 'waves', accentMode: 'custom', accent: '#ff7a45', bgIntensity: 65, font: 'rounded', lyricGlow: 60 } },
  { name: 'Vapor', swatch: ['#1b0b3a', '#ff4fd8', '#33e1ff'], s: { bgStyle: 'aurora', accentMode: 'custom', accent: '#ff4fd8', font: 'mono', lyricStyle: 'karaoke', grain: 30, refraction: 85, letterSpacing: 0 } },
  { name: 'Mono', swatch: ['#0c0c0c', '#4a4a4a', '#bdbdbd'], s: { bgStyle: 'solid', accentMode: 'custom', accent: '#8a8a8a', glass: 'frosted', lyricStyle: 'minimal', grain: 25 } },
  { name: 'Crystal', swatch: ['#132a4a', '#6aa8ff', '#e6f0ff'], s: { glass: 'liquid', refraction: 100, bgStyle: 'mesh', bgIntensity: 80, lyricGlow: 70 } },
  { name: 'Lava', swatch: ['#2a0a05', '#ff5a1f', '#ffb347'], s: { bgStyle: 'lava', bgMotion: 0.6, grain: 18, accentMode: 'auto' } },
  { name: 'Spotlight', swatch: ['#111', '#7a5cff', '#ff5fa2'], s: { lyricStyle: 'single', bgStyle: 'mesh', lyricSize: 56, font: 'rounded', lyricGlow: 65 } },
];

export function setup(c) { ctx = c; }
const themeKeys = () => ctx.ITEMS.map(i => i.key).filter(k => !NOT_THEME.has(k));
const defaults = () => Object.fromEntries(ctx.ITEMS.filter(i => !NOT_THEME.has(i.key)).map(i => [i.key, i.def]));
const current = () => Object.fromEntries(themeKeys().map(k => [k, ctx.settings[k]]));
const full = s => ({ ...defaults(), ...s });
const sanitize = s => {
  const out = {};
  for (const item of ctx.ITEMS) if (!NOT_THEME.has(item.key) && s && item.key in s) out[item.key] = ctx.validate(item, s[item.key]);
  return out;
};
const mine = () => (ctx.store.get('themes') || []).filter(t => t && t.name && t.s);
const isActive = s => { const f = full(s); return themeKeys().every(k => ctx.settings[k] === f[k]); };

export function apply(theme) {
  ctx.applyAll(full(sanitize(theme.s)));
  ctx.toast(`Theme: ${theme.name}`);
}

export const encode = (name, s) => PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify({ v: 1, n: name, s }))));
export function decode(code) {
  const raw = String(code || '').trim();
  if (!raw.startsWith(PREFIX)) throw new Error('That isn’t a Lumen theme code.');
  let obj;
  try { obj = JSON.parse(decodeURIComponent(escape(atob(raw.slice(PREFIX.length))))); } catch { throw new Error('That theme code is damaged.'); }
  const s = sanitize(obj.s);
  if (!Object.keys(s).length) throw new Error('That theme code has no settings in it.');
  return { name: String(obj.n || 'Shared theme').slice(0, 40), s };
}

export function list() {
  return [...PRESETS.map(p => ({ ...p, preset: true })), ...mine().map(t => ({ ...t, swatch: swatchFor(full(t.s)) }))];
}
function swatchFor(s) {
  if (s.accentMode === 'custom') return [s.accent + '55', s.accent, '#ffffff33'];
  return ['#2b2b40', '#6b4fa0', '#c06090'];
}

export function renderInto(el) {
  const all = list();
  el.innerHTML = `<div class="theme-grid">${all.map((t, i) => `<button class="theme-card${isActive(t.s) ? ' active' : ''}" data-ti="${i}" title="${esc(t.name)}">
      <span class="theme-sw" style="background:linear-gradient(135deg, ${t.swatch.map(esc).join(', ')})"></span>
      <span class="theme-name">${esc(t.name)}</span>
      ${t.preset ? '' : `<span class="theme-del" data-del="${esc(t.name)}" title="Delete theme">${icons.close}</span>`}
    </button>`).join('')}</div>
    <div class="theme-actions">
      <button class="pill-btn" data-act="save">${icons.plus} Save current</button>
      <button class="pill-btn" data-act="share">${icons.copy} Share code</button>
      <button class="pill-btn" data-act="import">${icons.download} Import</button>
    </div>`;
  el.onclick = e => {
    const del = e.target.closest('[data-del]');
    if (del) { e.stopPropagation(); ctx.store.set('themes', mine().filter(t => t.name !== del.dataset.del)); renderInto(el); ctx.toast('Theme deleted'); return; }
    const card = e.target.closest('[data-ti]');
    if (card) { apply(all[Number(card.dataset.ti)]); renderInto(el); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'save') saveDialog(el);
    if (act === 'share') shareDialog();
    if (act === 'import') importDialog(el);
  };
}

function saveDialog(el) {
  openModal(`<h3>Save theme</h3><label class="field"><span>Name</span><input id="th-name" maxlength="40" placeholder="My theme"></label>
    <div class="modal-actions"><span style="flex:1"></span><button class="text-btn" data-x>Cancel</button><button class="primary small" data-ok>Save</button></div>`, m => {
    const ok = () => {
      const name = m.querySelector('#th-name').value.trim();
      if (!name) return m.querySelector('#th-name').focus();
      if (PRESETS.some(p => p.name.toLowerCase() === name.toLowerCase())) { ctx.toast('Pick a name that isn’t a built-in theme.'); return; }
      ctx.store.set('themes', [...mine().filter(t => t.name !== name), { name, s: current() }]);
      closeModal(); renderInto(el); ctx.toast(`Saved “${name}”`);
    };
    m.querySelector('[data-ok]').onclick = ok;
    m.querySelector('[data-x]').onclick = closeModal;
    m.querySelector('#th-name').addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
  });
}

function shareDialog() {
  const code = encode('My Lumen theme', current());
  openModal(`<h3>Share your theme</h3><p class="modal-text">Send this code to a friend — they paste it in Customize → Themes → Import.</p>
    <label class="field"><textarea id="th-code" rows="4" readonly>${esc(code)}</textarea></label>
    <div class="modal-actions"><span style="flex:1"></span><button class="text-btn" data-x>Close</button><button class="primary small" data-ok>Copy code</button></div>`, m => {
    m.querySelector('#th-code').select();
    m.querySelector('[data-x]').onclick = closeModal;
    m.querySelector('[data-ok]').onclick = () => navigator.clipboard?.writeText(code).then(() => { ctx.toast('Theme code copied'); closeModal(); }, () => ctx.toast('Select the code and copy it manually.'));
  });
}

function importDialog(el) {
  openModal(`<h3>Import a theme</h3><label class="field"><span>Theme code</span><textarea id="th-code" rows="4" placeholder="${PREFIX}…"></textarea></label>
    <p class="error" id="th-err"></p>
    <div class="modal-actions"><span style="flex:1"></span><button class="text-btn" data-x>Cancel</button><button class="primary small" data-ok>Import & apply</button></div>`, m => {
    m.querySelector('[data-x]').onclick = closeModal;
    m.querySelector('[data-ok]').onclick = () => {
      try {
        const t = decode(m.querySelector('#th-code').value);
        let name = t.name, n = 2;
        while (PRESETS.some(p => p.name === name) || mine().some(x => x.name === name)) name = `${t.name} ${n++}`;
        ctx.store.set('themes', [...mine(), { name, s: t.s }]);
        closeModal(); apply({ name, s: t.s }); renderInto(el);
      } catch (e) { m.querySelector('#th-err').textContent = e.message; }
    };
  });
}
