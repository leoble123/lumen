// Devices panel: see every Spotify Connect device, move playback between them, set their volume.
import { api } from './api.js';
import { icons } from './icons.js';

import { ANDROID } from './platform.js';
let ctx;   // { toast, getSource, getState, switchMode(mode, { resume }) }
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = { computer: 'laptop', smartphone: 'phone', tablet: 'phone', speaker: 'speaker', tv: 'tv', castvideo: 'tv', castaudio: 'speaker', avr: 'speaker', stb: 'tv', audiodongle: 'speaker', gameconsole: 'tv', automobile: 'speaker' };
let timer = null, seq = 0, devices = [];

export function setup(c) { ctx = c; }
export const isOpen = () => $('#devices').classList.contains('open');
export function open() {
  document.querySelectorAll('.sheet.open').forEach(s => s.classList.remove('open'));
  $('#devices').classList.add('open');
  refresh();
  clearInterval(timer); timer = setInterval(refresh, 3000);
}
export function close() { $('#devices').classList.remove('open'); clearInterval(timer); timer = null; }
export function toggle() { isOpen() ? close() : open(); }

export async function refresh() {
  if (!isOpen()) return;
  const body = $('#devices-body'), my = ++seq;
  const src = ctx.getSource();
  if (!src || src.kind === 'demo') { body.innerHTML = '<p class="empty">Connect Spotify to see your devices.</p>'; return; }
  let res;
  try { res = await api('/me/player/devices'); } catch (e) { if (my === seq) body.innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  if (my !== seq) return;
  devices = res?.devices || [];
  const lumenId = src.kind === 'app' ? src.deviceId : null;
  // "This computer" always appears so you can bring playback back into Lumen
  const others = devices.filter(d => d.id !== lumenId && d.name !== 'Lumen');
  const phoneOk = ANDROID && typeof window.LumenAndroid?.phoneConnect === 'function';
  const lumenDev = devices.find(d => d.id === lumenId) || { id: '__lumen', name: 'Lumen (this computer)', type: ANDROID ? 'Smartphone' : 'Computer', is_active: false, supports_volume: true, volume_percent: null };
  const row = (d, isLumen) => {
    const vol = d.supports_volume && d.volume_percent != null;
    return `<div class="device${d.is_active ? ' active' : ''}" data-id="${esc(d.id)}" data-lumen="${isLumen ? 1 : ''}">
      <span class="dev-ic">${icons[ICON[String(d.type).toLowerCase()]] || icons.speaker}</span>
      <div class="dev-main"><div class="dev-name">${esc(isLumen ? (ANDROID ? 'This phone' : 'Lumen (this computer)') : d.name)}</div>
        <div class="dev-sub">${d.is_active ? '<span class="dev-live"><i></i><i></i><i></i></span>Playing here' : esc(d.type)}${d.is_restricted ? ' · can’t be controlled' : ''}</div>
        ${vol && d.is_active ? `<div class="dev-vol">${icons.volLow}<input type="range" min="0" max="100" value="${d.volume_percent}" data-vol="${esc(d.id)}">${icons.volHigh}</div>` : ''}
      </div></div>`;
  };
  body.innerHTML = (ANDROID && !phoneOk ? '' : `<div class="group-title">${ANDROID ? 'This phone' : 'This computer'}</div><div class="group">${row(lumenDev, true)}</div>`) + `
    <div class="group-title">${ANDROID ? 'Your devices' : 'Other devices'}</div>
    <div class="group">${others.length ? others.map(d => row(d, false)).join('') : '<p class="empty dev-empty">Open Spotify on your phone, speaker or TV and it will show up here.</p>'}</div>
    <p class="set-hint q-note">${ANDROID ? 'Lumen on Android shows and controls what Spotify is playing. Bluetooth speakers and headphones are chosen in the Spotify app or your phone\'s settings.' : 'To change which speakers or headphones your computer uses, pick them in your computer\'s sound settings — Lumen plays through whatever is selected there.'}</p>`;
  body.querySelectorAll('input[data-vol]').forEach(inp => {
    const fill = () => inp.style.setProperty('--fill', inp.value + '%'); fill();
    let t; inp.oninput = () => { fill(); clearTimeout(t); t = setTimeout(() => setVolume(inp.dataset.vol, Number(inp.value)), 150); };
    inp.onclick = e => e.stopPropagation();
  });
}

async function setVolume(id, v) {
  try {
    const src = ctx.getSource();
    if (src?.kind === 'app' && id === src.deviceId) await src.setVolume(v / 100);
    else await api('/me/player/volume', { method: 'PUT', query: { volume_percent: v, device_id: id } });
  } catch (e) { ctx.toast(e.message); }
}

async function transfer(el) {
  const src = ctx.getSource();
  const playing = !ctx.getState().paused;
  try {
    if (el.dataset.lumen) {
      if (src?.kind === 'app' && el.classList.contains('active')) return;
      ctx.toast(ANDROID ? 'Moving playback to this phone…' : 'Moving playback to Lumen…');
      await ctx.switchMode('app', { resume: playing });
    } else {
      const d = devices.find(x => x.id === el.dataset.id);
      if (d?.is_restricted) return ctx.toast('Spotify doesn’t allow controlling this device.');
      if (d?.is_active) return;
      await api('/me/player', { method: 'PUT', body: { device_ids: [d.id], play: playing } });
      ctx.toast(`Now playing on ${d.name}`);
      if (src?.kind === 'app') await ctx.switchMode('remote');
    }
  } catch (e) { ctx.toast(e.message); }
  setTimeout(refresh, 700);
}

document.addEventListener('click', e => {
  const el = e.target.closest('#devices .device');
  if (el && !e.target.closest('input')) transfer(el);
});
