// Synced lyrics from LRCLIB (free, open lyrics database: https://lrclib.net)
const cache = new Map();

const WORD_TAG = /<(\d+):(\d+(?:\.\d+)?)>/g;
const toMs = (m, s) => (Number(m) * 60 + Number(s)) * 1000;

// Parses LRC, including "enhanced" LRC with per-word timestamps: [00:12.30]<00:12.30>I've <00:12.80>been
export function parseLRC(lrc) {
  const lines = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const body = raw.replace(/\[[^\]]*\]/g, '');
    let words = null;
    if (WORD_TAG.test(body)) {
      WORD_TAG.lastIndex = 0;
      words = [];
      const parts = body.split(/(<\d+:\d+(?:\.\d+)?>)/);
      let at = null;
      for (const part of parts) {
        const m = part.match(/^<(\d+):(\d+(?:\.\d+)?)>$/);
        if (m) { at = toMs(m[1], m[2]); continue; }
        if (!part.trim() || at == null) continue;
        for (const w of part.trim().split(/\s+/)) words.push({ t: at, text: w });
      }
      if (!words.length) words = null;
    }
    const text = body.replace(WORD_TAG, '').replace(/\s+/g, ' ').trim();
    for (const s of stamps) lines.push({ time: toMs(s[1], s[2]), text, words: words && words.map(w => ({ ...w })) });
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

// Give every word a start time and duration. Real word timings are used when the LRC has them;
// otherwise the line's singing time is shared out by word length (vowel-heavy words take longer).
export function timeWords(line) {
  const sungFor = Math.min(line.end - line.time, Math.max(1200, line.text.length * 80 + 300));
  if (line.words?.length) {
    return line.words.map((w, i) => {
      const next = line.words[i + 1]?.t ?? Math.min(line.end, line.time + sungFor + 400);
      return { text: w.text, t: w.t, d: Math.max(120, next - w.t) };
    });
  }
  const words = line.text.split(/\s+/).filter(Boolean);
  const weight = w => 1 + w.replace(/[^a-z\u00C0-\uFFFF]/gi, '').length + (w.match(/[aeiouy]/gi)?.length || 0) * 0.5;
  const total = words.reduce((s, w) => s + weight(w), 0) || 1;
  let at = line.time;
  return words.map(w => { const d = sungFor * weight(w) / total; const o = { text: w, t: at, d }; at += d; return o; });
}

// Turn empty lines / long silences into "• • •" breathing dots, like Apple Music
export function withGaps(lines, durationMs, showGaps = true) {
  const out = [];
  const GAP = 5000;
  if (showGaps && lines.length && lines[0].time > GAP) out.push({ time: 0, text: '', gap: true });
  lines.forEach((l, i) => {
    const next = lines[i + 1]?.time ?? durationMs;
    if (!l.text) { if (showGaps && next - l.time > 2500) out.push({ ...l, gap: true }); return; }
    out.push(l);
  });
  // Every line knows when it ends (used for the left-to-right fill)
  out.forEach((l, i) => { l.end = out[i + 1]?.time ?? durationMs; });
  return out;
}

// Song names often carry extras that lyric sites don't use: "- Remastered 2011", "(feat. X)", "- Radio Edit"…
export function cleanTitle(name) {
  return String(name || '')
    .replace(/\s*[([](feat\.?|ft\.?|with)\s[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+(\d{4}\s+)?(remaster(ed)?|radio edit|single version|album version|mono|stereo|bonus track|original mix|edit)(\s+\d{4})?.*$/i, '')
    .replace(/\s*[([](\d{4}\s+)?remaster(ed)?(\s+\d{4})?[)\]]/gi, '')
    .trim();
}
const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9\u3040-\u30ff\u4e00-\u9fff\uac00-\ud7af]+/g, '');

async function fetchJson(url) {
  const r = await fetch(url);
  return r.ok ? r.json() : null;
}

function toResult(hit) {
  if (!hit) return null;
  if (hit.instrumental) return { type: 'instrumental' };
  if (hit.syncedLyrics) return { type: 'synced', lines: parseLRC(hit.syncedLyrics) };
  if (hit.plainLyrics) return { type: 'plain', lines: hit.plainLyrics.split('\n').map(text => ({ time: -1, text })) };
  return null;
}

async function lookup({ name, artist, album, durationMs }) {
  const dur = Math.round(durationMs / 1000);
  const clean = cleanTitle(name);
  const tries = [
    { track_name: name, artist_name: artist, album_name: album, duration: dur },
    clean !== name && { track_name: clean, artist_name: artist, album_name: album, duration: dur },
    { track_name: clean, artist_name: artist, duration: dur },
  ].filter(Boolean);
  let plain = null;
  for (const q of tries) {
    const hit = await fetchJson(`https://lrclib.net/api/get?${new URLSearchParams(q)}`).catch(() => null);
    const r = toResult(hit);
    if (r?.type === 'synced' || r?.type === 'instrumental') return r;
    plain ||= r;
  }
  // Search, then pick the closest match: same artist, similar length, synced lyrics preferred
  const list = await fetchJson(`https://lrclib.net/api/search?${new URLSearchParams({ track_name: clean, artist_name: artist })}`).catch(() => null) || [];
  const a = norm(artist), t = norm(clean);
  const scored = list.map(x => {
    let sc = 0;
    if (norm(x.artistName).includes(a) || a.includes(norm(x.artistName))) sc += 4;
    if (norm(x.trackName) === t) sc += 3; else if (norm(cleanTitle(x.trackName)) === t) sc += 2;
    const dd = Math.abs((x.duration || 0) - dur);
    sc += dd <= 2 ? 3 : dd <= 5 ? 2 : dd <= 10 ? 1 : -2;
    if (x.syncedLyrics) sc += 2;
    return { x, sc };
  }).filter(o => o.sc >= 5).sort((p, q) => q.sc - p.sc);
  return toResult(scored[0]?.x) || plain || { type: 'none' };
}

// Lyrics are saved on this device, so songs you've played before show lyrics instantly (and offline)
export async function getLyrics(track) {
  const { id } = track;
  if (cache.has(id)) return cache.get(id);
  const p = (async () => {
    const kv = await import('./kv.js');
    const saved = await kv.get('lyr:' + id).catch(() => null);
    if (saved && (saved.res.type !== 'none' || Date.now() - saved.at < 3 * 864e5)) return saved.res;   // retry "not found" after 3 days
    const res = await lookup(track);
    kv.set('lyr:' + id, { at: Date.now(), res }).catch(() => {});
    return res;
  })();
  cache.set(id, p);
  p.catch(() => cache.delete(id));
  return p;
}
