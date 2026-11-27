// Listening stats, counted on this device only: minutes per day, top artists and songs, streaks.
import * as kv from './kv.js';

let data = null, cur = null, lastAt = 0, playing = false, dirty = false, countedPlay = false;
const day = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export async function load() {
  if (!data) data = (await kv.get('stats').catch(() => null)) || { days: {}, artists: {}, tracks: {} };
  return data;
}
async function save() {
  if (!dirty || !data) return;
  dirty = false;
  // keep the 400 most-listened songs so the file stays small
  const t = Object.entries(data.tracks);
  if (t.length > 450) data.tracks = Object.fromEntries(t.sort((a, b) => b[1].ms - a[1].ms).slice(0, 400));
  await kv.set('stats', data).catch(() => {});
}
setInterval(save, 20000);
addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => { if (document.hidden) { tick(); save(); } });

function tick() {
  const now = Date.now();
  if (playing && cur && data && lastAt) {
    const ms = Math.min(now - lastAt, 60000);   // gaps (sleep, app closed) don't count
    if (ms > 0) {
      const d = day();
      data.days[d] = (data.days[d] || 0) + ms;
      const tr = data.tracks[cur.uri] ||= { n: cur.name, a: cur.artist, img: cur.image, aid: cur.artistId, album: cur.albumUri, ms: 0, plays: 0 };
      tr.ms += ms; tr.img = cur.image || tr.img;
      for (const a of cur.artists) { const e = data.artists[a.name] ||= { ms: 0, id: a.id, img: '' }; e.ms += ms; e.id = a.id || e.id; e.img = cur.image || e.img; }
      cur.listened += ms;
      if (!countedPlay && cur.listened >= 30000) { tr.plays++; countedPlay = true; }
      dirty = true;
    }
  }
  lastAt = now;
}
setInterval(tick, 15000);

/** Feed every player update in here. */
export async function onState(s) {
  await load();
  tick();
  const t = s.track;
  if (!t || t.id === 'demo') { cur = null; playing = false; return; }
  if (!cur || cur.uri !== t.uri) {
    cur = { uri: t.uri, name: t.name, artist: t.artist, image: t.image, artists: t.artistList || [{ name: t.artist }], artistId: t.artistList?.[0]?.id, albumUri: t.albumId ? `spotify:album:${t.albumId}` : '', listened: 0 };
    countedPlay = false;
  }
  playing = !s.paused;
}

export async function summary() {
  await load(); tick();
  const today = data.days[day()] || 0;
  let week = 0, streak = 0;
  for (let i = 0; i < 7; i++) { const d = new Date(); d.setDate(d.getDate() - i); week += data.days[day(d)] || 0; }
  for (let i = 0; ; i++) { const d = new Date(); d.setDate(d.getDate() - i); if ((data.days[day(d)] || 0) >= 60000) streak++; else if (i > 0) break; if (i > 3650) break; }
  const total = Object.values(data.days).reduce((a, b) => a + b, 0);
  const topArtists = Object.entries(data.artists).sort((a, b) => b[1].ms - a[1].ms).slice(0, 6).map(([name, v]) => ({ name, ...v }));
  const topTracks = Object.entries(data.tracks).sort((a, b) => b[1].ms - a[1].ms).slice(0, 5).map(([uri, v]) => ({ uri, ...v }));
  return { today, week, streak, total, topArtists, topTracks };
}
export async function reset() { data = { days: {}, artists: {}, tracks: {} }; dirty = true; await save(); }
