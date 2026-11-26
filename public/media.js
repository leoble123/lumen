// Media keys + system media controls (Windows media flyout, macOS Now Playing, Chrome's media hub).
// Browsers only hand media keys to a page that is playing audio, so Lumen plays a silent loop
// to "own" the media session, then reports what Spotify is actually playing.
let ctx;   // { toggle, next, prev, seek, getState, position }
let anchor = null, lastTrack = null, lastPos = 0, armed = false;

function silentWav(seconds = 2) {
  const rate = 8000, n = rate * seconds, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);   // 8-bit silence
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

export function setup(c) {
  ctx = c;
  if (!('mediaSession' in navigator)) return;
  const ms = navigator.mediaSession;
  const safe = fn => () => { try { fn(); } catch {} };
  ms.setActionHandler('play', safe(() => ctx.getState().paused && ctx.toggle()));
  ms.setActionHandler('pause', safe(() => !ctx.getState().paused && ctx.toggle()));
  ms.setActionHandler('nexttrack', safe(ctx.next));
  ms.setActionHandler('previoustrack', safe(ctx.prev));
  try { ms.setActionHandler('seekto', d => ctx.seek(d.seekTime * 1000)); } catch {}
  try { ms.setActionHandler('seekforward', d => ctx.seek(ctx.position() + (d.seekOffset || 10) * 1000)); } catch {}
  try { ms.setActionHandler('seekbackward', d => ctx.seek(ctx.position() - (d.seekOffset || 10) * 1000)); } catch {}
  // Audio can only start after the user interacts with the page
  const arm = () => { armed = true; ensureAnchor(); };
  window.addEventListener('pointerdown', arm, { once: true, capture: true });
  window.addEventListener('keydown', arm, { once: true, capture: true });
}

function ensureAnchor() {
  if (!armed || !ctx.getState().track) return;
  if (!anchor) {
    anchor = new Audio(silentWav());
    anchor.loop = true; anchor.volume = 1;
    anchor.setAttribute('data-lumen', 'media-anchor');
  }
  if (anchor.paused) anchor.play().catch(() => {});
}

export function update() {
  if (!ctx || !('mediaSession' in navigator)) return;
  const s = ctx.getState(), t = s.track, ms = navigator.mediaSession;
  if (!t) { ms.metadata = null; ms.playbackState = 'none'; return; }
  ensureAnchor();
  if (t.id !== lastTrack) {
    lastTrack = t.id;
    ms.metadata = new MediaMetadata({ title: t.name, artist: t.artist, album: t.album || '',
      artwork: t.image ? [{ src: t.image, sizes: '640x640', type: 'image/jpeg' }] : [] });
  }
  ms.playbackState = s.paused ? 'paused' : 'playing';
  const pos = ctx.position();
  if (Math.abs(pos - lastPos) > 1500 || s.paused) {
    lastPos = pos;
    try { ms.setPositionState({ duration: Math.max(0.1, (t.durationMs || 0) / 1000), position: Math.max(0, Math.min(pos, t.durationMs || 0) / 1000), playbackRate: 1 }); } catch {}
  }
}
