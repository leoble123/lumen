// Floating mini player for computers (Chrome/Edge "Document Picture-in-Picture"): stays on top of other apps.
import { icons } from './icons.js';

let ctx, win = null, shown = {};
export function setup(c) { ctx = c; }
export const supported = () => 'documentPictureInPicture' in window;
export const isOpen = () => !!win;

const CSS = `
*{box-sizing:border-box;margin:0}html,body{height:100%}
body{font-family:var(--ui-font,-apple-system,system-ui,"Segoe UI",sans-serif);color:#fff;background:#111;overflow:hidden;user-select:none;-webkit-font-smoothing:antialiased}
#bg{position:fixed;inset:-20%;background-size:cover;background-position:center;filter:blur(40px) saturate(1.6) brightness(.55);transition:background-image .6s}
.wrap{position:relative;display:flex;gap:12px;align-items:center;height:100%;padding:12px}
img{width:min(96px,32vw);aspect-ratio:1;border-radius:12px;object-fit:cover;flex:none;box-shadow:0 8px 24px rgba(0,0,0,.45);background:#222}
.m{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.t{font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.a{font-size:13px;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.l{font-size:14px;font-weight:650;line-height:1.25;min-height:1.25em;opacity:.95;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;transition:opacity .25s}
.c{display:flex;gap:4px;margin-top:2px}
button{all:unset;cursor:pointer;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:18px;transition:background .2s,transform .3s}
button:hover{background:rgba(255,255,255,.14)}button:active{transform:scale(.88)}
svg{width:1em;height:1em;display:block}`;

export async function open() {
  if (!supported()) { ctx.toast('The floating player needs Chrome or Edge.'); return; }
  if (win) { win.focus(); return; }
  win = await documentPictureInPicture.requestWindow({ width: 420, height: 150 });
  const d = win.document;
  d.head.innerHTML = `<style>${CSS}</style>`;
  d.body.innerHTML = `<div id="bg"></div><div class="wrap"><img id="art" alt=""><div class="m">
    <div class="t" id="t"></div><div class="a" id="a"></div><div class="l" id="l"></div>
    <div class="c"><button id="prev">${icons.prev}</button><button id="play">${icons.play}</button><button id="next">${icons.next}</button></div></div></div>`;
  d.getElementById('prev').onclick = ctx.prev;
  d.getElementById('play').onclick = ctx.toggle;
  d.getElementById('next').onclick = ctx.next;
  d.getElementById('art').onclick = () => window.focus();
  shown = {};
  win.addEventListener('pagehide', () => { win = null; });
  update(ctx.getState(), ctx.currentLine());
}
export function close() { win?.close(); win = null; }

// Called from the render loop; only touches the window when something actually changed
export function update(state, line) {
  if (!win) return;
  const d = win.document, t = state.track;
  const want = { id: t?.id, paused: state.paused, line: line || '' };
  if (want.id !== shown.id) {
    d.getElementById('t').textContent = t?.name || 'Nothing playing';
    d.getElementById('a').textContent = t?.artist || '';
    if (t?.image) { d.getElementById('art').src = t.image; d.getElementById('bg').style.backgroundImage = `url("${t.image}")`; }
  }
  if (want.paused !== shown.paused) d.getElementById('play').innerHTML = state.paused ? icons.play : icons.pause;
  if (want.line !== shown.line) d.getElementById('l').textContent = want.line;
  shown = want;
}
