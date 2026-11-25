// Synced lyrics from LRCLIB (free, open lyrics database: https://lrclib.net)
const cache = new Map();

export function parseLRC(lrc) {
  const lines = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const s of stamps) lines.push({ time: (Number(s[1]) * 60 + Number(s[2])) * 1000, text });
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
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
