// Custom CSS for power users (Spicetify-style), with a CodeMirror editor and live preview.
// Saved only on this computer. Not included in shared theme codes.
import { openModal, closeModal } from './pages.js';

let ctx;   // { store, toast }
const KEY = 'customCss';
let cmLoaded = null;

export function setup(c) { ctx = c; apply(ctx.store.get(KEY) || ''); }
export const get = () => ctx.store.get(KEY) || '';

export function apply(css) {
  let el = document.getElementById('custom-css');
  if (!el) { el = document.createElement('style'); el.id = 'custom-css'; document.head.appendChild(el); }
  el.textContent = css;
}

function loadCodeMirror() {
  if (cmLoaded) return cmLoaded;
  const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = 'vendor/codemirror/codemirror.css'; document.head.appendChild(css);
  const script = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  cmLoaded = script('vendor/codemirror/codemirror.js')
    .then(() => Promise.all([script('vendor/codemirror/css-mode.js'), script('vendor/codemirror/closebrackets.js')]))
    .catch(e => { cmLoaded = null; throw e; });
  return cmLoaded;
}

const EXAMPLE = `/* Your CSS goes here — it's applied live. Some ideas: */

/* Bigger, bolder now-playing title */
/* #title { font-size: 28px; } */

/* Square-ish glass everywhere */
/* .glass { border-radius: 12px !important; } */

/* Hide the device label */
/* .device-label { display: none; } */
`;

export async function open() {
  const saved = get();
  let editor = null, textarea, timer;
  openModal(`<h3>Custom CSS</h3>
    <p class="modal-text">Style anything in Lumen. Changes apply as you type. If something breaks, press <b>Reset</b>.</p>
    <div class="css-editor"><textarea id="css-src" spellcheck="false"></textarea></div>
    <div class="modal-actions"><button class="text-btn danger-text" data-reset>Reset</button><span style="flex:1"></span><button class="text-btn" data-x>Cancel</button><button class="primary small" data-ok>Save</button></div>`, async m => {
    m.classList.add('wide');
    textarea = m.querySelector('#css-src');
    textarea.value = saved || EXAMPLE;
    const live = () => { clearTimeout(timer); timer = setTimeout(() => apply(editor ? editor.getValue() : textarea.value), 150); };
    textarea.addEventListener('input', live);
    m.querySelector('[data-x]').onclick = () => { apply(saved); closeModal(); };
    m.querySelector('[data-reset]').onclick = () => { if (editor) editor.setValue(''); else textarea.value = ''; apply(''); };
    m.querySelector('[data-ok]').onclick = () => {
      const css = editor ? editor.getValue() : textarea.value;
      ctx.store.set(KEY, css.trim() === EXAMPLE.trim() ? '' : css);
      apply(get()); closeModal(); ctx.toast('Custom CSS saved');
    };
    try {
      await loadCodeMirror();
      if (!textarea.isConnected) return;
      editor = window.CodeMirror.fromTextArea(textarea, { mode: 'css', theme: 'lumen', lineNumbers: true, autoCloseBrackets: true, tabSize: 2, lineWrapping: true });
      editor.on('change', live);
      setTimeout(() => { editor.refresh(); editor.focus(); }, 50);
    } catch { /* plain textarea still works */ }
  });
}
