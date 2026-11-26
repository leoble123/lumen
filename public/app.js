import { login, handleCallback, isLoggedIn, logout, store } from './auth.js';
import { api } from './api.js';
import { getLyrics, parseLRC, withGaps, timeWords } from './lyrics.js';
import { sdkSource, remoteSource, demoSource } from './playback.js';
import { icons, hydrateIcons } from './icons.js';
import * as glass from './glass.js';
import * as pages from './pages.js';
import * as devices from './devices.js';
import * as bgGl from './bg-gl.js';
import * as home from './home.js';
import * as palette from './palette.js';
import * as media from './media.js';
import * as themes from './themes.js';
import * as wallpaper from './wallpaper.js';
import * as particles from './particles.js';
import * as fonts from './fonts.js';
import * as cssedit from './cssedit.js';
import { ANDROID, call as nativeCall, info as nativeInfo } from './platform.js';
if (ANDROID) document.body.classList.add('android');
import { missingScopes } from './auth.js';
window.__lumenGlass = glass;

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const setIcon = (el, name) => { if (el.dataset.icon !== name) { el.dataset.icon = name; el.innerHTML = icons[name]; } };

/* =====================================================================
   SETTINGS — one schema drives the UI, validation, defaults and apply()
   ===================================================================== */
const GL_STYLES = ['mesh', 'aurora', 'lava', 'waves', 'stars'];
const SCHEMA = [
  { group: 'General', items: [
    { key: 'startView', type: 'seg', label: 'Open Lumen on', def: 'home', options: [['home', 'Home'], ['nowplaying', 'Now Playing']] },
    { key: 'appearance', type: 'seg', label: 'Appearance', def: 'dark', options: [['dark', 'Dark'], ['oled', 'OLED black'], ['light', 'Light']] },
  ]},
  { group: 'Layout', items: [
    { key: 'layout', type: 'chips', label: 'Now Playing layout', def: 'classic', options: [['classic', 'Classic'], ['centered', 'Big art'], ['zen', 'Lyrics only'], ['compact', 'Compact']] },
    { key: 'artStyle', type: 'chips', label: 'Album art', def: 'rounded', options: [['rounded', 'Rounded'], ['square', 'Square'], ['circle', 'Circle'], ['vinyl', 'Vinyl'], ['cd', 'CD']] },
    { key: 'tabbarPos', type: 'seg', label: 'Tab bar', def: 'bottom', options: [['bottom', 'Bottom'], ['top', 'Top'], ['side', 'Side']] },
    { key: 'autoHideTabbar', type: 'switch', label: 'Hide tab bar until I point at it', def: false },
    { key: 'showVolume', type: 'switch', label: 'Show volume', def: true },
    { key: 'showTimes', type: 'switch', label: 'Show song times', def: true },
    { key: 'showDeviceLabel', type: 'switch', label: 'Show “Playing on”', def: true },
    { key: 'showTopButtons', type: 'switch', label: 'Always show top buttons', def: true, hint: 'When off, they appear when you point at the top-right corner.' },
  ]},
  { group: 'Playback', items: [
    { key: 'playbackMode', type: 'seg', label: 'Play audio in', def: ANDROID ? 'remote' : 'app', options: [['app', 'Lumen'], ['remote', 'Spotify app']], showIf: () => !ANDROID,
      hint: '“Spotify app” lets the normal Spotify app (or your phone) play the music while Lumen shows lyrics & controls.' },
  ]},
  { group: 'Glass', items: [
    { key: 'glass', type: 'seg', label: 'Style', def: 'liquid', options: [['liquid', 'Liquid'], ['frosted', 'Frosted'], ['tinted', 'Tinted']] },
    { key: 'refraction', type: 'range', label: 'Refraction', def: 60, min: 0, max: 100, step: 1, unit: '%', showIf: s => s.glass === 'liquid' },
    { key: 'glassThickness', type: 'range', label: 'Thickness', def: 1, min: 0.5, max: 2, step: 0.1, unit: '×', showIf: s => s.glass === 'liquid' },
    { key: 'glassFringe', type: 'range', label: 'Color fringe', def: 40, min: 0, max: 100, step: 1, unit: '%', showIf: s => s.glass === 'liquid' },
    { key: 'glassShine', type: 'range', label: 'Edge shine', def: 60, min: 0, max: 100, step: 1, unit: '%' },
    { key: 'glassTintAmount', type: 'range', label: 'Tint', def: 0, min: 0, max: 60, step: 1, unit: '%' },
    { key: 'glassTint', type: 'color', label: 'Tint color', def: '#7a5cff', showIf: s => s.glassTintAmount > 0 },
    { key: 'roundness', type: 'range', label: 'Corner roundness', def: 1, min: 0.2, max: 1.6, step: 0.1, unit: '×' },
  ]},
  { group: 'Background', items: [
    { key: 'bgStyle', type: 'chips', label: 'Style', def: 'mesh', options: [['mesh', 'Mesh'], ['fluid', 'Fluid'], ['aurora', 'Aurora'], ['lava', 'Lava lamp'], ['waves', 'Waves'], ['stars', 'Starfield'], ['album', 'Album art'], ['wallpaper', 'My wallpaper'], ['solid', 'Solid']] },
    { key: '_wallpaper', type: 'wallpaper', label: 'Wallpaper', showIf: s => s.bgStyle === 'wallpaper' },
    { key: 'wpDim', type: 'range', label: 'Dim', def: 25, min: 0, max: 85, step: 1, unit: '%', showIf: s => s.bgStyle === 'wallpaper' },
    { key: 'wpBlur', type: 'range', label: 'Blur', def: 0, min: 0, max: 60, step: 1, unit: 'px', showIf: s => s.bgStyle === 'wallpaper' },
    { key: 'bgMotion', type: 'range', label: 'Motion', def: 1, min: 0, max: 3, step: 0.1, unit: '×', showIf: s => s.bgStyle === 'fluid' || GL_STYLES.includes(s.bgStyle) },
    { key: 'bgIntensity', type: 'range', label: 'Intensity', def: 50, min: 0, max: 100, step: 1, unit: '%', showIf: s => GL_STYLES.includes(s.bgStyle) },
    { key: 'bgBlur', type: 'range', label: 'Softness', def: 90, min: 30, max: 160, step: 1, unit: 'px', showIf: s => s.bgStyle === 'fluid' || s.bgStyle === 'album' },
    { key: 'grain', type: 'range', label: 'Film grain', def: 12, min: 0, max: 100, step: 1, unit: '%' },
    { key: 'particles', type: 'chips', label: 'Particles', def: 'none', options: [['none', 'None'], ['dust', 'Dust'], ['bokeh', 'Bokeh'], ['snow', 'Snow'], ['fireflies', 'Fireflies']] },
    { key: 'particleAmount', type: 'range', label: 'Particle amount', def: 50, min: 10, max: 100, step: 1, unit: '%', showIf: s => s.particles !== 'none' },
    { key: 'accentMode', type: 'chips', label: 'Colors from album', def: 'auto', options: [['auto', 'Vibrant'], ['muted', 'Muted'], ['dark', 'Dark'], ['light', 'Light'], ['custom', 'Custom']] },
    { key: 'accent', type: 'color', label: 'Custom color', def: '#7a5cff', showIf: s => s.accentMode === 'custom' },
  ]},
  { group: 'Lyrics', items: [
    { key: 'lyricStyle', type: 'chips', label: 'Style', def: 'apple', options: [['apple', 'Word by word'], ['karaoke', 'Line sweep'], ['minimal', 'Minimal'], ['single', 'One line']] },
    { key: 'lyricAlign', type: 'seg', label: 'Alignment', def: 'left', options: [['left', 'Left'], ['center', 'Center']] },
    { key: 'lyricSize', type: 'range', label: 'Size', def: 40, min: 24, max: 68, step: 1, unit: 'px' },
    { key: 'lyricGlow', type: 'range', label: 'Glow', def: 40, min: 0, max: 100, step: 1, unit: '%' },
    { key: 'letterSpacing', type: 'range', label: 'Letter spacing', def: -2.5, min: -6, max: 10, step: 0.5, unit: '' },
    { key: 'lineSpacing', type: 'range', label: 'Line spacing', def: 1, min: 0.5, max: 2.5, step: 0.1, unit: '×' },
    { key: 'lyricSpeed', type: 'range', label: 'Scroll speed', def: 1, min: 0.5, max: 2, step: 0.1, unit: '×' },

    { key: 'blurInactive', type: 'switch', label: 'Blur other lines', def: true, showIf: s => s.lyricStyle === 'apple' || s.lyricStyle === 'karaoke' },
    { key: 'showGaps', type: 'switch', label: 'Dots during instrumentals', def: true },
  ]},
  { group: 'Fonts', items: [
    { key: 'font', type: 'select', label: 'Lyrics font', def: 'system', options: fonts.OPTIONS },
    { key: 'uiFont', type: 'select', label: 'App font', def: 'system', options: fonts.OPTIONS },
  ]},
  { group: 'Advanced', items: [
    { key: '_css', type: 'button', label: 'Edit custom CSS…', action: () => cssedit.open(), hint: 'Style anything with your own CSS (like Spicetify). Saved on this computer only.' },
  ]},
  { group: 'Updates', items: [
    { key: 'autoUpdate', type: 'switch', label: 'Automatic updates', def: true },
  ]},
];
const ALL_ITEMS = SCHEMA.flatMap(g => g.items);
const ITEMS = ALL_ITEMS.filter(i => !i.key.startsWith('_'));
const DEFAULTS = Object.fromEntries(ITEMS.map(i => [i.key, i.def]));

function validate(item, v) {
  switch (item.type) {
    case 'seg': case 'select': case 'chips': return item.options.some(o => o[0] === v) ? v : item.def;
    case 'range': { const n = Number(v); return Number.isFinite(n) ? Math.min(item.max, Math.max(item.min, n)) : item.def; }
    case 'switch': return typeof v === 'boolean' ? v : item.def;
    case 'color': return /^#[0-9a-f]{6}$/i.test(v) ? v : item.def;
  }
  return item.def;
}
function loadSettings() {
  const saved = store.get('settings2') || {};
  return Object.fromEntries(ITEMS.map(i => [i.key, validate(i, saved[i.key] ?? i.def)]));
}
const settings = loadSettings();
let volume = store.get('volume') ?? 70;

function setSetting(key, value) {
  const item = ITEMS.find(i => i.key === key);
  const v = validate(item, value);
  if (settings[key] === v) return;
  const old = settings[key];
  settings[key] = v;
  store.set('settings2', settings);
  applySettings();
  syncSettingsUI();
  // side effects that need more than CSS
  if ((key === 'showGaps' || key === 'lyricStyle') && lyricsTrack) reloadLyrics();
  if (key === 'playbackMode' && old !== v && source && source.kind !== 'demo') startSource(v);
}

function applyAll(values) {
  for (const item of ITEMS) if (item.key in values) settings[item.key] = validate(item, values[item.key]);
  store.set('settings2', settings);
  applySettings(); syncSettingsUI();
  if (lyricsTrack) reloadLyrics();
}

function resetSettings() {
  Object.assign(settings, DEFAULTS);
  store.set('settings2', settings);
  applySettings(); syncSettingsUI();
  if (lyricsTrack) reloadLyrics();
  toast('Settings reset');
}

// Everything visual is derived from `settings` + current album colors, so any change is fully reversible
function setBodyFlag(prefix, value) {
  const keep = [...document.body.classList].filter(c => !c.startsWith(prefix + '-'));
  document.body.className = [...keep, `${prefix}-${value}`].join(' ');
}

function applySettings() {
  const r = document.documentElement.style;
  r.setProperty('--lyric-size', settings.lyricSize + 'px');
  r.setProperty('--lyric-speed', settings.lyricSpeed);
  r.setProperty('--bg-blur', settings.bgBlur + 'px');
  r.setProperty('--font', fonts.stack(settings.font));
  r.setProperty('--ui-font', fonts.stack(settings.uiFont));
  r.setProperty('--glass-shine', settings.glassShine / 100);
  r.setProperty('--glass-tint', settings.glassTint);
  r.setProperty('--glass-tint-a', settings.glassTintAmount / 100);
  r.setProperty('--round', settings.roundness);
  r.setProperty('--wp-dim', settings.wpDim / 100);
  r.setProperty('--wp-blur', settings.wpBlur + 'px');
  const flags = { appearance: settings.appearance, layout: settings.layout, art: settings.artStyle, tabbar: settings.tabbarPos };
  for (const [k, v] of Object.entries(flags)) setBodyFlag(k, v);
  const toggles = { 'autohide-tabbar': settings.autoHideTabbar, 'hide-volume': !settings.showVolume, 'hide-times': !settings.showTimes, 'hide-device': !settings.showDeviceLabel, 'hide-topbtns': !settings.showTopButtons };
  for (const [c, on] of Object.entries(toggles)) document.body.classList.toggle(c, on);
  particles.set(settings.particles, settings.particleAmount);
  r.setProperty('--lyric-glow', settings.lyricGlow / 100);
  r.setProperty('--lyric-ls', settings.letterSpacing);
  r.setProperty('--grain', settings.grain / 100);
  document.body.classList.toggle('align-center', settings.lyricAlign === 'center');
  setBodyFlag('lyric', settings.lyricStyle);
  glass.configure(settings.glass, settings.refraction / 100, { thickness: settings.glassThickness, fringe: settings.glassFringe / 100 * 0.06 });
  applyColors();
  applyBackground();
  requestAnimationFrame(() => { layoutLyrics(); moveTabThumb(); updateMini(); });
}

/* ---------- Settings UI (built from the schema) ---------- */
const controls = new Map(); // key -> { row, update() }
function buildSettingsUI() {
  const body = $('#settings-body');
  body.innerHTML = '<div class="group-title">Themes</div><div class="group theme-group" id="themes-box"></div>';
  for (const g of SCHEMA) {
    body.insertAdjacentHTML('beforeend', `<div class="group-title">${g.group}</div>`);
    const group = document.createElement('div'); group.className = 'group';
    for (const item of g.items) group.appendChild(buildControl(item));
    body.appendChild(group);
  }
  body.insertAdjacentHTML('beforeend', `<div class="group-title">App</div>
    <div class="group">
      <div class="set-info">Version<span id="set-version">—</span></div>
      <button class="set-btn" id="set-check">Check for updates</button>
      <button class="set-btn" id="set-install" hidden>Install Lumen as an app</button>
      <button class="set-btn" id="set-connect" hidden>Connect Spotify</button>
      <button class="set-btn" id="set-reset">Reset all settings</button>
      <button class="set-btn danger" id="set-logout" hidden>Log out of Spotify</button>
    </div>`);
  $('#set-reset').onclick = resetSettings;
  $('#set-logout').onclick = () => { logout(); location.reload(); };
  $('#set-connect').onclick = () => { closeSettings(); source?.stop(); source = null; showWelcome(true); };
  $('#set-install').onclick = promptInstall;
  $('#set-check').onclick = () => checkUpdates(true);
}

function buildControl(item) {
  const row = document.createElement('div');
  row.className = 'set-row' + (item.type === 'switch' || item.type === 'color' || item.type === 'select' ? ' inline' : '');
  const fmt = v => item.unit === '×' ? `${Number(v).toFixed(1)}×` : item.unit === '' ? (v > 0 ? `+${v}` : `${v}`) : `${v}${item.unit}`;
  let update;
  if (item.type === 'button') {
    row.className = 'set-row';
    row.innerHTML = `<button class="set-btn inline-btn">${item.label}</button>${item.hint ? `<div class="set-hint">${item.hint}</div>` : ''}`;
    row.querySelector('button').onclick = item.action;
    update = () => {};
  } else if (item.type === 'wallpaper') {
    row.innerHTML = `<div class="set-label">${item.label}<span class="val wp-name"></span></div>
      <div class="wp-btns"><label class="pill-btn wp-pick">Choose image or video…<input type="file" accept="image/*,video/*" hidden></label><button class="pill-btn wp-clear">Remove</button></div>`;
    const name = row.querySelector('.wp-name');
    row.querySelector('input').onchange = async e => {
      const f = e.target.files[0]; if (!f) return;
      try { await wallpaper.save(f); toast('Wallpaper set'); applyBackground(); update(); } catch (err) { toast(err.message); }
      e.target.value = '';
    };
    row.querySelector('.wp-clear').onclick = async () => { await wallpaper.clear(); applyBackground(); update(); };
    update = () => { wallpaper.info().then(i => { name.textContent = i ? i.name : 'none yet'; }); };
  } else if (item.type === 'chips') {
    row.innerHTML = `<div class="set-label">${item.label}</div><div class="chips">${item.options.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div>`;
    const box = row.querySelector('.chips');
    box.onclick = e => { const b = e.target.closest('button'); if (b) setSetting(item.key, b.dataset.v); };
    update = () => box.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.v === settings[item.key]));
  } else if (item.type === 'seg') {
    row.innerHTML = `<div class="set-label">${item.label}</div><div class="seg"><div class="seg-thumb"></div>${item.options.map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div>${item.hint ? `<div class="set-hint">${item.hint}</div>` : ''}`;
    const seg = row.querySelector('.seg'), thumb = row.querySelector('.seg-thumb');
    seg.onclick = e => { const b = e.target.closest('button'); if (b) setSetting(item.key, b.dataset.v); };
    update = () => {
      let active;
      seg.querySelectorAll('button').forEach(b => { const on = b.dataset.v === settings[item.key]; b.classList.toggle('active', on); if (on) active = b; });
      if (active && active.offsetWidth) { thumb.style.left = active.offsetLeft + 'px'; thumb.style.width = active.offsetWidth + 'px'; }
    };
  } else if (item.type === 'range') {
    row.innerHTML = `<div class="set-label">${item.label}<span class="val"></span></div><input type="range" min="${item.min}" max="${item.max}" step="${item.step}">`;
    const input = row.querySelector('input'), val = row.querySelector('.val');
    input.oninput = () => setSetting(item.key, Number(input.value));
    update = () => {
      if (document.activeElement !== input) input.value = settings[item.key];
      setFill(input); val.textContent = fmt(settings[item.key]);
    };
  } else if (item.type === 'switch') {
    row.innerHTML = `<div class="set-label">${item.label}</div><button class="switch" role="switch" aria-label="${item.label}"></button>`;
    const sw = row.querySelector('.switch');
    sw.onclick = () => setSetting(item.key, !settings[item.key]);
    update = () => { sw.classList.toggle('on', settings[item.key]); sw.setAttribute('aria-checked', settings[item.key]); };
  } else if (item.type === 'select') {
    row.innerHTML = `<div class="set-label">${item.label}</div><select class="set-select">${item.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`;
    const sel = row.querySelector('select');
    sel.onchange = () => setSetting(item.key, sel.value);
    update = () => { sel.value = settings[item.key]; };
  } else if (item.type === 'color') {
    row.innerHTML = `<div class="set-label">${item.label}</div><input type="color">`;
    const c = row.querySelector('input');
    c.oninput = () => setSetting(item.key, c.value);
    update = () => { if (document.activeElement !== c) c.value = settings[item.key]; };
  }
  if (item.hint && item.type === 'switch') row.insertAdjacentHTML('beforeend', `<div class="set-hint full">${item.hint}</div>`);
  controls.set(item.key, { row, update, item });
  return row;
}

function syncSettingsUI() {
  if ($('#themes-box') && $('#settings').classList.contains('open')) themes.renderInto($('#themes-box'));
  controls.forEach(({ row, update, item }) => {
    row.classList.toggle('collapsed', !!item.showIf && !item.showIf(settings));
    update();
  });
  const loggedIn = isLoggedIn();
  $('#set-logout').hidden = !loggedIn;
  $('#set-connect').hidden = loggedIn;
  $('#set-install').hidden = !installPrompt || isStandalone();
  $('#set-version').textContent = runningVersion ? (readyVersion ? `${runningVersion} → ${readyVersion} (restart)` : runningVersion) : 'dev';
}
const setFill = input => input.style.setProperty('--fill', `${((input.value - input.min) / (input.max - input.min)) * 100}%`);

function openSettings() { pages.closeQueue(); devices.close(); $('#settings').classList.add('open'); requestAnimationFrame(syncSettingsUI); }
function closeSettings() { $('#settings').classList.remove('open'); }
$('#open-settings').onclick = () => $('#settings').classList.contains('open') ? closeSettings() : openSettings();
$('#close-settings').onclick = closeSettings;

/* =====================================================================
   COLORS & BACKGROUND
   ===================================================================== */
let artColors = null;     // colors extracted from the current album art (never mutated)
let currentArt = '';
const DEFAULT_COLORS = { bg: ['#3a1c71', '#b24a6b', '#e08a5f', '#1d2b64'], accent: '#fa2d48' };
const toHex = c => '#' + c.map(x => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
const fromHex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

function extractColors(img) {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 48;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 48, 48);
    const d = ctx.getImageData(0, 0, 48, 48).data;
    const buckets = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const key = (d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4);
      const b = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
      b.n++; b.r += d[i]; b.g += d[i + 1]; b.b += d[i + 2]; buckets.set(key, b);
    }
    const cols = [...buckets.values()].map(b => {
      const rgb = [b.r / b.n, b.g / b.n, b.b / b.n];
      const mx = Math.max(...rgb), mn = Math.min(...rgb);
      const sat = mx ? (mx - mn) / mx : 0;
      return { rgb, sat, score: b.n * (0.3 + sat) * (mx > 35 ? 1 : 0.25) };
    }).sort((a, b) => b.score - a.score);
    const picked = [];
    for (const c of cols) {
      if (picked.every(p => Math.hypot(...p.rgb.map((v, i) => v - c.rgb[i])) > 60)) picked.push(c);
      if (picked.length === 4) break;
    }
    while (picked.length < 4) picked.push({ rgb: mix(picked[0]?.rgb || [60, 60, 60], [0, 0, 0], 0.4 * picked.length), sat: 0 });
    const accent = [...picked].sort((a, b) => b.sat * (lum(b.rgb) > .15) - a.sat * (lum(a.rgb) > .15))[0].rgb;
    return { bg: picked.map(p => toHex(p.rgb.map(v => v * 0.85))), accent: toHex(accent) };
  } catch { return null; }
}

// Album palettes from node-vibrant (MIT): Vibrant / Muted / Dark / Light, each a background set + accent
let artPalettes = null;
async function vibrantPalettes(img) {
  if (!window.Vibrant) return null;
  try {
    const p = await window.Vibrant.from(img).quality(3).getPalette();
    const hex = k => p[k] ? (p[k].getHex ? p[k].getHex() : p[k].hex) : null;
    const pick = (...ks) => ks.map(hex).find(Boolean);
    const V = pick('Vibrant', 'LightVibrant', 'Muted', 'DarkVibrant'), M = pick('Muted', 'DarkMuted', 'Vibrant'), DV = pick('DarkVibrant', 'DarkMuted', 'Vibrant'),
      DM = pick('DarkMuted', 'DarkVibrant', 'Muted'), LV = pick('LightVibrant', 'Vibrant', 'LightMuted'), LM = pick('LightMuted', 'Muted', 'LightVibrant');
    if (!V) return null;
    const dim = h => toHex(mix(fromHex(h), [0, 0, 0], 0.15));
    return {
      auto: { bg: [V, DV, LV, DM].map(dim), accent: V },
      muted: { bg: [M, DM, LM, DV].map(dim), accent: LM || M },
      dark: { bg: [DV, DM, toHex(mix(fromHex(V), [0, 0, 0], 0.5)), '#0b0b12'], accent: V },
      light: { bg: [LV, LM, V, M], accent: DV },
    };
  } catch { return null; }
}

function applyColors() {
  const r = document.documentElement.style;
  let bg, accent;
  if (settings.accentMode === 'custom') {
    const a = fromHex(settings.accent);
    accent = settings.accent;
    bg = [mix(a, [0, 0, 0], .25), mix(a, [255, 255, 255], .15), mix(a, [0, 0, 40], .55), mix(a, [0, 0, 0], .7)].map(toHex);
  } else {
    const src = artPalettes?.[settings.accentMode] || artColors || DEFAULT_COLORS;
    bg = src.bg; accent = src.accent;
  }
  if (settings.appearance === 'light') bg = bg.map(h => toHex(mix(fromHex(h), [255, 255, 255], 0.55)));
  r.setProperty('--accent', accent);
  r.setProperty('--accent-text', lum(fromHex(accent)) > 0.62 ? '#000' : '#fff');
  ['--c1', '--c2', '--c3', '--c4'].forEach((v, i) => r.setProperty(v, bg[i]));
  r.setProperty('--solid', toHex(mix(fromHex(bg[0]), [0, 0, 0], .35)));
  bgGl.setColors(bg);
  particles.setColors([accent, ...bg]);
}

function applyBackground() {
  let style = settings.bgStyle;
  if (settings.appearance === 'oled') style = 'oled';
  wallpaper.setActive(style === 'wallpaper');
  if (style === 'wallpaper') wallpaper.load().then(has => { if (!has && settings.bgStyle === 'wallpaper') $('#bg').dataset.style = 'wallpaper-empty'; });
  if (GL_STYLES.includes(style)) {
    if (!bgGl.set(style, { motion: settings.bgMotion, intensity: settings.bgIntensity })) style = 'fluid';   // no WebGL: fall back
  } else bgGl.set(null);
  $('#bg').dataset.style = GL_STYLES.includes(style) ? 'gl' : style;
  $('#bg-art').style.backgroundImage = currentArt ? `url("${currentArt}")` : 'none';
}

// Smooth, organic blob motion (JS so speed changes never make it jump)
const blobs = ['#blob1', '#blob2', '#blob3', '#blob4'].map(s => $(s));
const BLOB_PATHS = [[0.13, 0.17, -0.18, -0.22, 0], [0.11, 0.09, 0.22, 0.2, 2], [0.07, 0.12, 0.05, -0.05, 4], [0.09, 0.06, -0.2, 0.25, 1]];
let bgClock = 0, lastFrame = performance.now();
function animateBg(dt) {
  if (settings.bgStyle !== 'fluid') return;
  bgClock += dt * settings.bgMotion * 0.001;
  blobs.forEach((b, i) => {
    const [fx, fy, ox, oy, ph] = BLOB_PATHS[i];
    const x = (ox + Math.sin(bgClock * fx * 2 + ph) * 0.22) * 100;
    const y = (oy + Math.cos(bgClock * fy * 2 + ph * 1.3) * 0.2) * 100;
    const s = 1 + Math.sin(bgClock * 0.15 + ph) * 0.15;
    b.style.transform = `translate(${x.toFixed(2)}vw, ${y.toFixed(2)}vh) scale(${s.toFixed(3)})`;
  });
}

/* =====================================================================
   PLAYER STATE
   ===================================================================== */
let source = null;
let state = { track: null, positionMs: 0, paused: true, at: 0 };
let currentTrackId;
let seekingUntil = 0;
const position = () => state.paused ? state.positionMs : Math.min(state.positionMs + performance.now() - state.at, state.track?.durationMs || 0);
const fmt = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

function onState(s) {
  if (seekingUntil > performance.now()) { s = { ...s, positionMs: state.positionMs, at: state.at, paused: s.paused }; }
  state = s;
  const t = s.track;
  setIcon($('#btn-play'), s.paused ? 'play' : 'pause');
  setIcon($('#mini-play'), s.paused ? 'play' : 'pause');
  $('.art-wrap').classList.toggle('paused', s.paused || !t);
  $('#btn-shuffle').classList.toggle('on', !!s.shuffle);
  $('#btn-repeat').classList.toggle('on', !!s.repeat && s.repeat !== 'off');
  setIcon($('#btn-repeat'), s.repeat === 'track' ? 'repeatOne' : 'repeat');
  if (s.volume != null && document.activeElement !== $('#vol')) { $('#vol').value = s.volume; setFill($('#vol')); }
  updateMini();
  media.update();
  const dev = s.deviceName && s.deviceName !== 'this computer' ? s.deviceName : 'this computer';
  $('#device-label b').textContent = `Playing on ${dev}`;
  $('#device-label').classList.toggle('remote', dev !== 'this computer');
  if ((t?.id ?? null) === currentTrackId) return;
  currentTrackId = t?.id ?? null;
  $('#title').textContent = t ? t.name : 'Nothing playing';
  if (t?.artistList?.length) $('#artist').innerHTML = t.artistList.map(a => a.id ? `<span class="link" data-artist="${esc(a.id)}">${esc(a.name)}</span>` : esc(a.name)).join(', ') +
    (t.albumId && t.album ? ` <span class="sep">—</span> <span class="link" data-album="${esc(t.albumId)}">${esc(t.album)}</span>` : '');
  else $('#artist').textContent = t ? t.artist : (source?.kind === 'remote' ? 'Play something in Spotify on any device' : 'Pick something from Library or Search');
  pages.onTrackChange(t);
  media.update();
  setArt(t);
  loadLyrics(t);
}

function setArt(t) {
  const img = $('#art');
  if (!t?.image) { img.removeAttribute('src'); $('#mini-art').removeAttribute('src'); currentArt = ''; artColors = null; artPalettes = null; applyColors(); applyBackground(); return; }
  img.style.opacity = 0;
  const loader = new Image();
  loader.crossOrigin = 'anonymous';
  loader.onload = () => {
    if (state.track?.id !== t.id) return;
    img.src = t.image; img.style.opacity = 1; $('#mini-art').src = t.image;
    artColors = t.demoColors ? { bg: t.demoColors, accent: t.demoColors[1] } : extractColors(loader);
    artPalettes = null;
    currentArt = t.image;
    applyColors(); applyBackground();
    // richer palettes arrive a moment later (node-vibrant)
    if (!t.demoColors) vibrantPalettes(loader).then(p => { if (p && state.track?.id === t.id) { artPalettes = p; applyColors(); } });
  };
  loader.onerror = () => { img.src = t.image; img.style.opacity = 1; currentArt = t.image; applyBackground(); };
  loader.src = t.image;
}

function updateMini() {
  const t = state.track;
  $('#mini-title').textContent = t?.name || 'Nothing playing';
  if (t?.artistList?.length) $('#mini-artist').innerHTML = t.artistList.map(a => a.id ? `<span class="link" data-artist="${esc(a.id)}">${esc(a.name)}</span>` : esc(a.name)).join(', ');
  else $('#mini-artist').textContent = t?.artist || '';
  $('#mini').classList.toggle('show', !!t && (currentView !== 'nowplaying' || settings.layout === 'zen'));
}

/* =====================================================================
   LYRICS ENGINE
   ===================================================================== */
const inner = $('#lyrics-inner'), box = $('#lyrics');
let lines = [], lineEls = [], tops = [], activeIdx = -1, synced = false, lyricsTrack = null, rawLyrics = null;
let manualOffset = 0, manualTimer = null;

function lyricsMessage(title, sub = '') {
  lines = []; lineEls = []; activeIdx = -1; synced = false;
  inner.innerHTML = title ? `<div class="lyrics-msg">${esc(title)}${sub ? `<small>${esc(sub)}</small>` : ''}</div>` : '';
}

async function loadLyrics(t) {
  lyricsTrack = t; rawLyrics = null;
  if (!t) return lyricsMessage('');
  lyricsMessage('');
  let res;
  if (t.id === 'demo') res = { type: 'synced', lines: parseLRC(source.demoLyrics) };
  else res = await getLyrics({ id: t.id, name: t.name, artist: t.artist.split(', ')[0], album: t.album, durationMs: t.durationMs }).catch(() => ({ type: 'none' }));
  if (lyricsTrack !== t) return;
  rawLyrics = res;
  renderLyrics();
}
function reloadLyrics() { if (rawLyrics) renderLyrics(); }

function renderLyrics() {
  const res = rawLyrics, t = lyricsTrack;
  if (res.type === 'none') return lyricsMessage('No lyrics for this song', 'Lyrics come from lrclib.net, a free community database.');
  if (res.type === 'instrumental') return lyricsMessage('♪ Instrumental');
  synced = res.type === 'synced';
  lines = synced ? withGaps(res.lines.map(l => ({ ...l })), t.durationMs, settings.showGaps) : res.lines.filter(l => l.text);
  const byWord = synced && settings.lyricStyle === 'apple';
  inner.innerHTML = '';
  lineEls = lines.map(l => {
    const el = document.createElement('div');
    el.className = 'line' + (l.gap ? ' gap' : '') + (synced ? '' : ' plain');
    if (l.gap) el.innerHTML = '<span class="dots"><i></i><i></i><i></i></span>';
    else if (byWord) {
      // one span per word so each can light up and lift on its own
      l.timed = timeWords(l);
      const wrap = document.createElement('span'); wrap.className = 'words';
      l.timed.forEach((w, i) => {
        if (i) wrap.appendChild(document.createTextNode(' '));
        const span = document.createElement('span'); span.className = 'w'; span.textContent = w.text; wrap.appendChild(span);
      });
      el.appendChild(wrap);
      l.wordEls = [...wrap.children];
    } else { const s = document.createElement('span'); s.className = 'fill'; s.textContent = l.text; el.appendChild(s); }
    if (synced) el.onclick = () => seekTo(l.time + 10);
    inner.appendChild(el);
    return el;
  });
  activeIdx = -2; manualOffset = 0;
  layoutLyrics();
}

function layoutLyrics() {
  if (!lineEls.length) return;
  const gapPx = settings.lyricSize * 0.5 * settings.lineSpacing;
  let y = 0;
  tops = lineEls.map(el => { const top = y; y += el.offsetHeight + gapPx; return top; });
  lineEls.forEach(el => { el.style.transition = 'none'; });
  positionLines(true);
  void inner.offsetHeight;
  lineEls.forEach(el => { el.style.transition = ''; });
}

function positionLines(instant = false) {
  if (!lineEls.length) return;
  const style = settings.lyricStyle;
  const a = Math.max(0, activeIdx);
  if (synced && style === 'single') {
    // one big line at a time, rising into place
    const mid = box.clientHeight * 0.42;
    lineEls.forEach((el, i) => {
      const off = i < activeIdx ? -60 : i > activeIdx ? 60 : 0;
      el.style.transitionDelay = '0ms';
      el.style.transform = `translate3d(0, ${(mid - el.offsetHeight / 2 + off).toFixed(1)}px, 0) scale(${i === activeIdx ? 1 : 0.92})`;
      el.style.filter = i === activeIdx ? 'none' : 'blur(6px)';
      el.classList.toggle('active', i === activeIdx);
      el.classList.toggle('past', i < activeIdx);
    });
    return;
  }
  const anchor = box.clientHeight * (synced ? 0.3 : 0.18);
  const base = synced ? anchor - tops[a] : anchor;
  const minimal = style === 'minimal';
  lineEls.forEach((el, i) => {
    const dist = synced ? Math.abs(i - activeIdx) : 0;
    const isActive = synced && i === activeIdx;
    // Apple-style "wave": lines below the active one follow a beat later
    const delay = instant || manualOffset || minimal ? 0 : Math.min(Math.max(i - a + 1, 0), 9) * 50 / settings.lyricSpeed;
    el.style.transitionDelay = `${delay}ms`;
    el.style.transform = `translate3d(0, ${(base + tops[i] + manualOffset).toFixed(1)}px, 0) scale(${isActive || !synced || minimal ? 1 : 0.95})`;
    el.style.filter = settings.blurInactive && !minimal && synced && !isActive && !manualOffset ? `blur(${(Math.min(dist, 5) * 0.75).toFixed(2)}px)` : 'none';
    el.classList.toggle('active', isActive);
    el.classList.toggle('past', synced && i < activeIdx);
  });
}

box.addEventListener('wheel', e => {
  if (!lineEls.length || (synced && settings.lyricStyle === 'single')) return;
  e.preventDefault();
  manualOffset -= e.deltaY;
  manualOffset = Math.max(-(tops.at(-1) || 0), Math.min(box.clientHeight * 0.5, manualOffset));
  positionLines(true);
  clearTimeout(manualTimer);
  if (synced) manualTimer = setTimeout(() => { manualOffset = 0; positionLines(); }, 2500);
}, { passive: false });
new ResizeObserver(() => layoutLyrics()).observe(box);
// Touch: drag the lyrics to look ahead, like the scroll wheel on a computer
let touchY = null;
box.addEventListener('touchstart', e => { if (e.touches.length === 1) { touchY = e.touches[0].clientY; inner.classList.add('dragging'); } }, { passive: true });
box.addEventListener('touchmove', e => {
  if (touchY == null || !lineEls.length || (synced && settings.lyricStyle === 'single')) return;
  const y = e.touches[0].clientY; manualOffset += y - touchY; touchY = y;
  manualOffset = Math.max(-(tops.at(-1) || 0), Math.min(box.clientHeight * 0.5, manualOffset));
  positionLines(true); e.preventDefault();
}, { passive: false });
box.addEventListener('touchend', () => {
  touchY = null; clearTimeout(manualTimer); inner.classList.remove('dragging');
  if (synced && manualOffset) manualTimer = setTimeout(() => { manualOffset = 0; positionLines(); }, 2500);
});

let lastWordLine = null;
function tickLyrics(pos) {
  if (!synced || !lines.length) return;
  let idx = -1;
  for (let i = 0; i < lines.length; i++) { if (lines[i].time <= pos + 150) idx = i; else break; }
  if (idx !== activeIdx) {
    // finish the words of the line we're leaving
    if (lastWordLine?.wordEls) lastWordLine.wordEls.forEach(w => { w.style.setProperty('--wp', '115%'); w.classList.add('on'); });
    activeIdx = idx; positionLines();
  }
  const l = lines[idx], el = lineEls[idx];
  if (!l || !el || l.gap) return;
  if (l.wordEls) {
    lastWordLine = l;
    const t = pos + 60;
    l.timed.forEach((w, i) => {
      const p = Math.max(0, Math.min(1, (t - w.t) / w.d));
      const we = l.wordEls[i];
      we.style.setProperty('--wp', `${(p * 125 - 15).toFixed(1)}%`);
      we.classList.toggle('on', p > 0);
    });
  } else if (el.firstChild?.style) {
    if (settings.lyricStyle === 'minimal') { el.firstChild.style.setProperty('--p', '110%'); return; }
    const len = Math.min(l.end - l.time, Math.max(1400, l.text.length * 85));
    const p = Math.max(0, Math.min(1, (pos - l.time) / len));
    el.firstChild.style.setProperty('--p', `${(p * 112 - 10).toFixed(1)}%`);
  }
}

/* =====================================================================
   RENDER LOOP
   ===================================================================== */
function frame(now) {
  const dt = Math.min(100, now - lastFrame); lastFrame = now;
  animateBg(dt);
  const pos = position(), dur = state.track?.durationMs || 0;
  const pct = dur ? pos / dur : 0;
  $('#bar-fill').style.width = `${pct * 100}%`;
  $('#mini-bar').style.transform = `scaleX(${pct})`;
  $('#t-cur').textContent = fmt(pos);
  $('#t-left').textContent = '-' + fmt(dur - pos);
  tickLyrics(pos);
  requestAnimationFrame(frame);
}

/* =====================================================================
   CONTROLS
   ===================================================================== */
function seekTo(ms) {
  if (!source || !state.track) return;
  ms = Math.max(0, Math.min(ms, state.track.durationMs - 500));
  state = { ...state, positionMs: ms, at: performance.now() };
  seekingUntil = performance.now() + 1200;
  manualOffset = 0;
  run(() => source.seek(ms));
}
async function run(fn) { try { await fn(); } catch (e) { toast(e.message || String(e)); } }
const needSource = fn => () => source ? run(fn) : toast('Connect Spotify or try the demo first.');

$('#btn-play').onclick = needSource(() => source.toggle());
$('#mini-play').onclick = e => { e.stopPropagation(); $('#btn-play').click(); };
$('#btn-next').onclick = needSource(() => source.next());
$('#mini-next').onclick = e => { e.stopPropagation(); $('#btn-next').click(); };
$('#btn-prev').onclick = needSource(() => position() > 3000 ? seekTo(0) : source.prev());
$('#btn-shuffle').onclick = needSource(() => source.shuffle(!state.shuffle));
$('#btn-repeat').onclick = needSource(() => source.repeat({ off: 'context', context: 'track', track: 'off' }[state.repeat || 'off']));
$('#mini').onclick = e => { if (!e.target.closest('.link')) showView('nowplaying'); };
$('.art-wrap').onclick = () => state.track?.albumId && state.track.id !== 'demo' && pages.openPage('album', state.track.albumId);
$('#open-devices').onclick = () => devices.toggle();
$('#close-devices').onclick = () => devices.close();
$('#device-label').onclick = () => devices.open();
$('#open-queue').onclick = () => pages.toggleQueue();
$('#btn-lyrics').onclick = () => { document.body.classList.toggle('np-lyrics'); $('#btn-lyrics').classList.toggle('on', document.body.classList.contains('np-lyrics')); requestAnimationFrame(layoutLyrics); };
$('#close-queue').onclick = () => pages.closeQueue();
$('#btn-like').onclick = () => pages.toggleNowPlayingLike();
$('#title').onclick = () => state.track?.albumId && state.track.id !== 'demo' && pages.openPage('album', state.track.albumId);
$('#bar').onclick = e => { const r = e.currentTarget.getBoundingClientRect(); seekTo(((e.clientX - r.left) / r.width) * (state.track?.durationMs || 0)); };
let volTimer;
$('#vol').oninput = e => {
  volume = Number(e.target.value); setFill(e.target); store.set('volume', volume);
  clearTimeout(volTimer); volTimer = setTimeout(() => source && run(() => source.setVolume(volume / 100)), 120);
};
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette.isOpen() ? palette.close() : palette.openPalette(); return; }
  if (e.target.matches('input, select, textarea')) return;
  if (e.code === 'Space') { e.preventDefault(); $('#btn-play').click(); }
  else if (e.code === 'ArrowRight') { e.preventDefault(); e.shiftKey ? $('#btn-next').click() : seekTo(position() + 5000); }
  else if (e.code === 'ArrowLeft') { e.preventDefault(); e.shiftKey ? $('#btn-prev').click() : seekTo(position() - 5000); }
  else if (e.key === 'Escape') { closeSettings(); pages.closeQueue(); devices.close(); }
  else if ((e.ctrlKey || e.metaKey) && e.key === 'f') { e.preventDefault(); showView('search'); }
  else if ((e.ctrlKey || e.metaKey) && e.key === ',') { e.preventDefault(); openSettings(); }
});

/* =====================================================================
   VIEWS
   ===================================================================== */
let currentView = 'nowplaying';
let detailFrom = 'library';
function showView(name) {
  currentView = name;
  document.body.classList.toggle('in-detail', name === 'detail');
  const tab = name === 'detail' ? detailFrom : name;
  $$('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.view === tab));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  moveTabThumb(true);
  updateMini();
  if (name === 'library') loadLibrary();
  if (name === 'home') home.load();
  if (name === 'search') setTimeout(() => $('#search-input').focus(), 80);
}
function moveTabThumb(animate) {
  const b = $('#tabbar button.active'), th = $('#tab-thumb');
  if (!b) return;
  if (settings.tabbarPos === 'side') { th.style.left = ''; th.style.width = ''; th.style.top = b.offsetTop + 'px'; th.style.height = b.offsetHeight + 'px'; }
  else { th.style.top = ''; th.style.height = ''; th.style.left = b.offsetLeft + 'px'; th.style.width = b.offsetWidth + 'px'; }
  if (animate) { th.classList.add('moving'); setTimeout(() => th.classList.remove('moving'), 220); }
}
$$('#tabbar button').forEach(b => b.onclick = () => { pages.resetStack(); showView(b.dataset.view); });
$('#btn-back').onclick = () => pages.back();
window.addEventListener('mouseup', e => { if (e.button === 3 && currentView === 'detail') { e.preventDefault(); pages.back(); } });

// Start playback of a context or list of songs (throws on failure so callers can react)
async function play(body) {
  if (!source || source.kind === 'demo') throw new Error('Connect Spotify to play real music.');
  await source.play(body);
}
const playItem = body => play(body).catch(e => toast(e.message));

/* ---------- Library ---------- */
let libState = 'idle';
const likedCover = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#5b3cff"/><stop offset="1" stop-color="#ff5fa2"/></linearGradient></defs><rect width="100" height="100" fill="url(#g)"/><path transform="translate(26 26) scale(2)" fill="#fff" d="M12 20.3s-7.8-4.6-7.8-10.4A4.4 4.4 0 0 1 12 7.2a4.4 4.4 0 0 1 7.8 2.7c0 5.8-7.8 10.4-7.8 10.4z"/></svg>');
const tile = (o, cls = '') => `<div class="tile ${cls}" data-uri="${esc(o.uri)}" data-kind="${esc(o.kind || '')}" data-id="${esc(o.id || String(o.uri || '').split(':').pop())}"><div class="cover"><img src="${esc(o.img || '')}" loading="lazy" alt="">${o.uri ? `<button class="tile-play glass" aria-label="Play">${icons.play}</button>` : ''}</div><div class="t">${esc(o.title)}</div>${o.sub ? `<div class="s">${esc(o.sub)}</div>` : ''}</div>`;
const newTile = `<div class="tile new" data-kind="new"><div class="cover">${icons.plus}</div><div class="t">New playlist</div><div class="s">Create your own</div></div>`;
// Clicking a tile opens its page; the round play button plays it right away
function onTileClick(e) {
  const t = e.target.closest('.tile'); if (!t) return false;
  if (t.dataset.kind === 'new') { pages.createPlaylist().then(pl => pl && pages.openPage('playlist', pl.id)).catch(err => toast(err.message)); return true; }
  if (e.target.closest('.tile-play')) {
    if (t.dataset.kind === 'liked') pages.openPage('liked').then(() => $('#detail-head [data-act=play]')?.click());
    else playItem({ context_uri: t.dataset.uri });
    return true;
  }
  if (t.dataset.kind) pages.openPage(t.dataset.kind, t.dataset.id);
  return true;
}
document.addEventListener('click', e => { if (e.target.closest('#view-detail .tile, #view-home .tile')) onTileClick(e); });

async function loadLibrary(force) {
  const el = $('#playlists');
  if (!isLoggedIn()) { el.innerHTML = '<p class="empty">Connect Spotify to see your playlists. (Customize → Connect Spotify)</p>'; return; }
  if ((libState === 'done' || libState === 'loading') && !force) return;
  libState = 'loading';
  el.innerHTML = Array(8).fill('<div><div class="skeleton" style="height:auto;aspect-ratio:1"></div></div>').join('');
  try {
    let items = [], url = '/me/playlists?limit=50';
    while (url && items.length < 300) {
      const page = await api(url);
      items = items.concat(page.items.filter(Boolean));
      url = page.next;
    }
    el.innerHTML = tile({ uri: 'liked', kind: 'liked', img: likedCover, title: 'Liked Songs', sub: 'Your saved tracks' }) + newTile +
      items.map(p => tile({ uri: p.uri, kind: 'playlist', id: p.id, img: pages.pickImage(p.images), title: p.name, sub: p.owner?.display_name ? `By ${p.owner.display_name}` : '' })).join('');
    libState = 'done';
  } catch (e) {
    libState = 'idle';
    el.innerHTML = `<p class="empty">Couldn't load playlists: ${esc(e.message)}</p>`;
  }
}
$('#playlists').onclick = onTileClick;

/* ---------- Search ----------
   Spotify (Feb 2026) caps search at 10 results per type, so we page with offset. */
let searchSeq = 0, searchTimer, songOffset = 0, lastQuery = '';
let searchTracks = [];
function renderSongs() {
  pages.renderList($('#song-list'), { kind: 'search', tracks: searchTracks, showAlbum: true,
    playAt: i => { const t = searchTracks[i]; return play(t.album?.uri ? { context_uri: t.album.uri, offset: { uri: t.uri } } : { uris: [t.uri] }); } });
}

$('#search-input').addEventListener('input', e => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  if (!q) { searchSeq++; $('#search-results').innerHTML = ''; return; }
  searchTimer = setTimeout(() => runSearch(q), 280);
});
$('#search-input').addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(searchTimer); const q = e.target.value.trim(); if (q) runSearch(q); } });

async function runSearch(q) {
  const out = $('#search-results');
  if (!isLoggedIn()) { out.innerHTML = '<p class="empty">Connect Spotify to search. (Customize → Connect Spotify)</p>'; return; }
  const seq = ++searchSeq;
  lastQuery = q; songOffset = 0;
  out.innerHTML = '<div class="section-title">Songs</div><div class="songs">' + Array(6).fill('<div class="skeleton"></div>').join('') + '</div>';
  try {
    const r = await api('/search', { query: { q, type: 'track,album,artist,playlist', limit: 10 } });
    if (seq !== searchSeq) return;
    const tracks = r.tracks?.items?.filter(Boolean) || [];
    const albums = r.albums?.items?.filter(Boolean) || [];
    const artists = r.artists?.items?.filter(Boolean) || [];
    const playlists = r.playlists?.items?.filter(Boolean) || [];
    if (!tracks.length && !albums.length && !artists.length && !playlists.length) { out.innerHTML = `<p class="empty">No results for “${esc(q)}”.</p>`; return; }
    let html = '';
    searchTracks = tracks.map(t => pages.normTrack(t)).filter(Boolean);
    if (tracks.length) html += `<div class="section-title">Songs</div><div class="songs" id="song-list"></div>` +
      (r.tracks.next ? '<button class="pill-btn more-btn" id="more-songs">Show more songs</button>' : '');
    if (artists.length) html += `<div class="section-title">Artists</div><div class="row-scroll">${artists.map(a => tile({ uri: a.uri, kind: 'artist', id: a.id, img: pages.pickImage(a.images), title: a.name, sub: 'Artist' }, 'round')).join('')}</div>`;
    if (albums.length) html += `<div class="section-title">Albums</div><div class="row-scroll">${albums.map(a => tile({ uri: a.uri, kind: 'album', id: a.id, img: pages.pickImage(a.images), title: a.name, sub: a.artists?.map(x => x.name).join(', ') })).join('')}</div>`;
    if (playlists.length) html += `<div class="section-title">Playlists</div><div class="row-scroll">${playlists.map(p => tile({ uri: p.uri, kind: 'playlist', id: p.id, img: pages.pickImage(p.images), title: p.name, sub: p.owner?.display_name })).join('')}</div>`;
    out.innerHTML = html;
    if (searchTracks.length) renderSongs();
  } catch (e) {
    if (seq !== searchSeq) return;
    out.innerHTML = `<p class="empty">Search failed: ${esc(e.message)}</p>`;
  }
}

$('#search-results').addEventListener('click', async e => {
  if (e.target.id === 'more-songs') {
    const btn = e.target, seq = searchSeq;
    btn.textContent = 'Loading…';
    try {
      songOffset += 10;
      const r = await api('/search', { query: { q: lastQuery, type: 'track', limit: 10, offset: songOffset } });
      if (seq !== searchSeq) return;
      searchTracks = searchTracks.concat((r.tracks?.items || []).map(t => pages.normTrack(t)).filter(Boolean)); renderSongs();
      if (r.tracks?.next && songOffset < 90) btn.textContent = 'Show more songs'; else btn.remove();
    } catch (err) { btn.textContent = 'Show more songs'; toast(err.message); }
    return;
  }
  onTileClick(e);
});

/* =====================================================================
   TOAST
   ===================================================================== */
let toastTimer;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 4200);
}

/* =====================================================================
   INSTALL AS APP (PWA)
   ===================================================================== */
let installPrompt = null;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches || matchMedia('(display-mode: minimal-ui)').matches;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); installPrompt = e;
  if (!isStandalone() && !store.get('installDismissed')) $('#install').classList.add('show');
  syncSettingsUI();
});
window.addEventListener('appinstalled', () => { installPrompt = null; $('#install').classList.remove('show'); toast('Lumen is installed — open it from your Start menu or Dock.'); syncSettingsUI(); });
async function promptInstall() {
  if (!installPrompt) return toast('Use your browser menu → “Install Lumen” (or “Apps → Install this site as an app”).');
  installPrompt.prompt();
  await installPrompt.userChoice.catch(() => {});
  installPrompt = null; $('#install').classList.remove('show'); syncSettingsUI();
}
$('#install-btn').onclick = promptInstall;
$('#install-close').onclick = () => { $('#install').classList.remove('show'); store.set('installDismissed', true); };

/* =====================================================================
   OVER-THE-AIR UPDATES
   New versions are published to GitHub. Lumen downloads them in the background, verifies every
   file, and switches over on the next restart (see update-core.js / sw.js).
   ===================================================================== */
const UPDATE_SOURCES = [
  `${location.origin}/__net/`,                                          // the launcher folder, if it's running
  'https://raw.githubusercontent.com/leoble123/lumen/main/public/',     // published releases
];
const CHECK_EVERY = 4 * 60 * 60 * 1000;
let runningVersion = '', readyVersion = '';
const U = window.LumenUpdate;

async function setupUpdates() {
  if (ANDROID) return setupNativeUpdates();
  if (!U || !navigator.serviceWorker?.controller) return;
  const meta = await U.getMeta();
  runningVersion = meta.version || '';
  if (meta.rolledBack) {
    toast(`Update ${meta.rolledBack} didn't start correctly, so Lumen went back to ${meta.version}.`);
    delete meta.rolledBack; await U.setMeta(meta);
  }
  await U.markHealthy();                       // we booted fine: this version is good
  syncSettingsUI();
  if (settings.autoUpdate) setTimeout(() => checkUpdates(false), 4000);
  setInterval(() => settings.autoUpdate && checkUpdates(false), CHECK_EVERY);
}

// In the Android app, the app itself downloads + verifies updates (same version.json, same SHA-256 checks)
function setupNativeUpdates() {
  const i = nativeInfo() || {};
  runningVersion = i.webVersion || '';
  if (i.rolledBack) toast(`Update ${i.rolledBack} didn't start correctly, so Lumen went back to ${runningVersion}.`);
  window.LumenAndroid.markHealthy();
  syncSettingsUI();
  if (settings.autoUpdate) setTimeout(() => checkUpdates(false), 4000);
  setInterval(() => settings.autoUpdate && checkUpdates(false), CHECK_EVERY);
  setTimeout(checkApkUpdate, 8000);
}

// Rarely, the Android app itself (not just Lumen inside it) gets an update
async function checkApkUpdate() {
  try {
    const r = await nativeCall('checkApkUpdate');
    if (!r.available) return;
    $('#update-title').textContent = `Lumen app ${r.versionName} is available`;
    $('#update-notes').textContent = r.notes || 'A new version of the Android app.';
    $('#update-restart').textContent = 'Install';
    $('#update-restart').onclick = async () => {
      $('#update-restart').textContent = 'Downloading…';
      try { await nativeCall('installApk'); } catch (e) { toast(e.message); }
      $('#update-restart').textContent = 'Install';
    };
    $('#update').classList.add('show');
  } catch { /* offline: try again next launch */ }
}

let updateRun = null;
function checkUpdates(manual) {
  if (ANDROID) {
    const btn = $('#set-check');
    if (!updateRun) {
      btn.textContent = 'Checking…';
      updateRun = nativeCall('checkForUpdates')
        .then(res => { if (res.updated) { readyVersion = res.version; showUpdateReady(res); } return res; })
        .finally(() => { updateRun = null; btn.textContent = 'Check for updates'; syncSettingsUI(); });
    }
    return updateRun.then(res => {
      if (manual && !res.updated) toast(readyVersion ? `Version ${readyVersion} is ready — restart Lumen to use it.` : `You're up to date (version ${res.version}).`);
    }, e => { if (manual) toast(`Couldn't update: ${e.message}`); });
  }
  if (!U || !navigator.serviceWorker?.controller) {
    if (manual) toast('Updates work once Lumen is opened from the launcher or installed app.');
    return Promise.resolve();
  }
  const btn = $('#set-check');
  if (!updateRun) {
    btn.textContent = 'Checking…';
    updateRun = U.check({ sources: UPDATE_SOURCES, onProgress: p => { btn.textContent = `Downloading update… ${Math.round(p * 100)}%`; } })
      .then(res => { if (res.updated) { readyVersion = res.version; showUpdateReady(res); } return res; })
      .finally(() => { updateRun = null; btn.textContent = 'Check for updates'; syncSettingsUI(); });
  }
  // A manual check joins any check already running and reports its result
  return updateRun.then(res => {
    if (manual && !res.updated) toast(readyVersion ? `Version ${readyVersion} is ready — restart Lumen to use it.` : `You're up to date (version ${res.version}).`);
  }, e => { if (manual) toast(`Couldn't update: ${e.message}`); });
}

function showUpdateReady({ version, notes }) {
  $('#update-title').textContent = `Lumen ${version} is ready`;
  $('#update-notes').textContent = notes || 'Restart to get the latest version.';
  $('#update').classList.add('show');
}
$('#update-restart').onclick = () => ANDROID ? window.LumenAndroid.restart() : location.reload();
$('#update-later').onclick = () => { $('#update').classList.remove('show'); toast('The update will be used next time you open Lumen.'); };

/* =====================================================================
   START-UP
   ===================================================================== */
async function startSource(kind) {
  if (ANDROID && kind === 'app') kind = 'remote';   // Spotify's web player doesn't run on phones
  source?.stop();
  source = null;
  currentTrackId = undefined;
  const onError = (type, msg) => {
    if (type === 'init' && source?.kind === 'app') {
      toast('This window can’t play Spotify audio, so Lumen will control the Spotify app instead.');
      startSource('remote'); return;
    }
    if (type !== 'poll') toast(msg);
  };
  const s = kind === 'demo' ? demoSource({ onState })
    : kind === 'remote' ? remoteSource({ onState, onError })
    : sdkSource({ onState, onError, volume: volume / 100 });
  s.kind = kind;
  source = s;
  try { await s.start(); }
  catch (e) {
    if (source !== s) return;
    if (kind === 'app') { toast(`${e.message} — controlling the Spotify app instead.`); return startSource('remote'); }
    toast(e.message);
  }
}

// Android back button: close whatever is open, then go back a page, then back to Home
window.__lumenBack = () => {
  if (palette.isOpen()) { palette.close(); return true; }
  if (document.querySelector('#menu.show')) { pages.closeMenu(); return true; }
  if (document.querySelector('.modal-wrap.show')) { pages.closeModal(); return true; }
  for (const id of ['#settings', '#queue', '#devices']) if ($(id).classList.contains('open')) { $(id).classList.remove('open'); return true; }
  if (document.body.classList.contains('np-lyrics')) { document.body.classList.remove('np-lyrics'); return true; }
  if (currentView === 'detail') { pages.back(); return true; }
  if (currentView !== 'home' && !document.body.classList.contains('welcome')) { pages.resetStack(); showView('home'); return true; }
  return false;
};

// Reveal the auto-hidden tab bar when the pointer gets near it
window.addEventListener('pointermove', e => {
  if (!settings.autoHideTabbar) return;
  const near = settings.tabbarPos === 'bottom' ? e.clientY > innerHeight - 120 : settings.tabbarPos === 'top' ? e.clientY < 120 : e.clientX < 140;
  document.body.classList.toggle('peek-tabbar', near || !!e.target.closest?.('#tabbar'));
}, { passive: true });

// Film grain texture, generated once
function makeGrain() {
  const c = document.createElement('canvas'); c.width = c.height = 160;
  const g = c.getContext('2d'), img = g.createImageData(160, 160);
  for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  document.documentElement.style.setProperty('--grain-img', `url(${c.toDataURL()})`);
}

function showWelcome(on) { $('#welcome').classList.toggle('show', on); document.body.classList.toggle('welcome', on); }

// Move audio between Lumen and other devices (used by the Devices panel)
async function switchMode(mode, { resume = false } = {}) {
  if (mode === 'app' && source?.kind === 'app' && source.deviceId) {
    await api('/me/player', { method: 'PUT', body: { device_ids: [source.deviceId], play: resume } });
    return;
  }
  settings.playbackMode = mode; store.set('settings2', settings); syncSettingsUI();
  await startSource(mode);
  if (mode === 'app' && source?.deviceId) await api('/me/player', { method: 'PUT', body: { device_ids: [source.deviceId], play: resume } });
}

// Everything the command palette can do
function paletteCommands() {
  const go = (v, label, icon) => ({ group: 'Go to', title: label, icon, run: () => { pages.resetStack(); showView(v); } });
  const cmds = [
    go('home', 'Home', 'home'), go('nowplaying', 'Now Playing', 'note'), go('library', 'Library', 'library'), go('search', 'Search', 'search'),
    { group: 'Playback', title: state.paused ? 'Play' : 'Pause', icon: state.paused ? 'play' : 'pause', hint: 'Space', run: () => $('#btn-play').click() },
    { group: 'Playback', title: 'Next song', icon: 'next', hint: 'Shift →', run: () => $('#btn-next').click() },
    { group: 'Playback', title: 'Previous song', icon: 'prev', hint: 'Shift ←', run: () => $('#btn-prev').click() },
    { group: 'Playback', title: state.shuffle ? 'Turn shuffle off' : 'Turn shuffle on', icon: 'shuffle', run: () => $('#btn-shuffle').click() },
    { group: 'Playback', title: 'Change repeat mode', icon: 'repeat', run: () => $('#btn-repeat').click() },
    { group: 'Playback', title: 'Like / unlike this song', icon: 'heart', keywords: 'save favorite', run: () => pages.toggleNowPlayingLike() },
    { group: 'Playback', title: 'Show queue', icon: 'queue', run: () => pages.openQueue() },
    { group: 'Playback', title: 'Devices', icon: 'devices', keywords: 'speaker phone transfer output', run: () => devices.open() },
    { group: 'App', title: 'Customize', icon: 'sliders', keywords: 'settings preferences', hint: 'Ctrl ,', run: () => openSettings() },
    { group: 'App', title: 'New playlist', icon: 'plus', run: () => pages.createPlaylist().then(pl => pl && pages.openPage('playlist', pl.id)) },
    { group: 'App', title: 'Check for updates', icon: 'download', run: () => checkUpdates(true) },
    { group: 'App', title: 'Reset all settings', icon: 'sliders', run: resetSettings },
  ];
  for (const t of themes.list()) cmds.push({ group: 'Themes', title: `Theme: ${t.name}`, icon: 'sparkle', run: () => { themes.apply(t); syncSettingsUI(); } });
  for (const g of SCHEMA) for (const item of g.items) {
    if (item.options) for (const [v, label] of item.options) cmds.push({ group: 'Settings', title: `${g.group === 'General' ? '' : g.group + ' '}${item.label.toLowerCase() === 'style' ? 'style' : item.label}: ${label}`.trim(), icon: 'sliders', hint: settings[item.key] === v ? 'current' : '', run: () => setSetting(item.key, v) });
    if (item.type === 'switch') cmds.push({ group: 'Settings', title: `${settings[item.key] ? 'Turn off' : 'Turn on'}: ${item.label}`, icon: 'sliders', run: () => setSetting(item.key, !settings[item.key]) });
  }
  return cmds;
}

function needReconnect() { if (isLoggedIn()) $('#reconnect').classList.add('show'); }
$('#reconnect-btn').onclick = () => login(store.get('clientId'));
$('#reconnect-close').onclick = () => $('#reconnect').classList.remove('show');

async function boot() {
  pages.setup({
    toast, play, showView, needReconnect,
    getState: () => state, getSource: () => source,
    currentView: () => currentView, detailFrom: () => detailFrom, setDetailFrom: v => { if (v !== 'detail') detailFrom = v; },
    refreshLibrary: () => { libState = 'idle'; if (currentView === 'library') loadLibrary(true); },
  });
  devices.setup({ toast, switchMode, getSource: () => source, getState: () => state });
  home.setup({ play, toast, needReconnect, isLoggedIn });
  palette.setup({ commands: paletteCommands, play, openPage: (k, id) => pages.openPage(k, id), toast, isLoggedIn });
  themes.setup({ settings, ITEMS, validate, applyAll, toast, store });
  media.setup({ disabled: ANDROID, getState: () => state, position, toggle: () => $('#btn-play').click(), next: () => $('#btn-next').click(), prev: () => $('#btn-prev').click(), seek: ms => seekTo(ms) });
  $('#open-palette').onclick = () => palette.openPalette();
  makeGrain();
  cssedit.setup({ store, toast });
  hydrateIcons();
  buildSettingsUI();
  applySettings();
  syncSettingsUI();
  glass.attachAll();
  $('#vol').value = volume; setFill($('#vol'));
  $('#client-id').value = store.get('clientId') || '';
  const redirect = ANDROID ? 'lumen://callback' : 'http://127.0.0.1:8888/callback';
  $('#copy-redirect code').textContent = redirect;
  $('#copy-redirect').onclick = () => navigator.clipboard?.writeText(redirect).then(() => toast('Copied!'), () => toast('Select the text and copy it manually.'));
  $('#btn-login').onclick = () => {
    const id = $('#client-id').value.trim();
    if (!/^[0-9a-f]{32}$/i.test(id)) { $('#login-error').textContent = 'That doesn’t look like a Client ID — it’s 32 letters and numbers.'; return; }
    login(id);
  };
  $('#client-id').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-login').click(); });
  $('#btn-demo').onclick = () => { showWelcome(false); startSource('demo'); };
  requestAnimationFrame(t => { lastFrame = t; frame(t); });
  if (!ANDROID && 'serviceWorker' in navigator && location.protocol === 'http:' && location.hostname === '127.0.0.1') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  try { await handleCallback(); }
  catch (e) { $('#login-error').textContent = e.message; }

  syncSettingsUI();
  if (isLoggedIn()) { startSource(settings.playbackMode); if (missingScopes().length) needReconnect(); showView(settings.startView); }
  else showWelcome(true);
  setupUpdates().catch(() => {});
}
boot();

// For automated tests
window.__lumen = { ANDROID, pages, devices, home, palette, themes, bgGl, applyAll, wallpaper, particles, cssedit, get artPalettes() { return artPalettes; }, settings, setSetting, resetSettings, checkUpdates, get readyVersion() { return readyVersion; }, get runningVersion() { return runningVersion; }, get state() { return state; }, get source() { return source; } };
