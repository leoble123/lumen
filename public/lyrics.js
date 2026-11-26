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

export async function getLyrics({ id, name, artist, album, durationMs }) {
  if (cache.has(id)) return cache.get(id);
  const p = (async () => {
    const q = new URLSearchParams({ track_name: name, artist_name: artist, album_name: album, duration: Math.round(durationMs / 1000) });
    let hit = null;
    try {
      const r = await fetch(`https://lrclib.net/api/get?${q}`);
      if (r.ok) hit = await r.json();
    } catch {}
    if (!hit?.syncedLyrics) {
      try {
        const r = await fetch(`https://lrclib.net/api/search?${new URLSearchParams({ track_name: name, artist_name: artist })}`);
        if (r.ok) {
          const list = await r.json();
          hit = list.filter(x => x.syncedLyrics)
            .sort((a, b) => Math.abs(a.duration * 1000 - durationMs) - Math.abs(b.duration * 1000 - durationMs))[0]
            || list.find(x => x.plainLyrics) || hit;
        }
      } catch {}
    }
    if (hit?.instrumental) return { type: 'instrumental' };
    if (hit?.syncedLyrics) return { type: 'synced', lines: parseLRC(hit.syncedLyrics) };
    if (hit?.plainLyrics) return { type: 'plain', lines: hit.plainLyrics.split('\n').map(text => ({ time: -1, text })) };
    return { type: 'none' };
  })();
  cache.set(id, p);
  p.catch(() => cache.delete(id));
  return p;
}
