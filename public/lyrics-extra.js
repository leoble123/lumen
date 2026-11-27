// Lyrics translation + romanization. Results are saved per song, so it's instant (and offline) next time.
//  - Korean → offline (hangul-romanization, MIT)      - Chinese → offline pinyin (pinyin-pro, MIT)
//  - Japanese → Google's romaji when reachable, else an offline kana → romaji fallback (kanji kept)
//  - Translation → Google Translate's free endpoint, with MyMemory (official free API) as backup
import * as kv from './kv.js';

const HANGUL = /[가-힯ᄀ-ᇿ]/, KANA = /[぀-ヿ]/, HAN = /[一-鿿]/;
export function scriptOf(lines) {
  const text = lines.map(l => l.text || '').join(' ');
  if (KANA.test(text)) return 'ja';
  if (HANGUL.test(text)) return 'ko';
  if (HAN.test(text)) return 'zh';
  return 'latin';
}
export const canRomanize = lines => scriptOf(lines) !== 'latin';

const loaded = {};
function loadScript(src) {
  return loaded[src] ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
}

// ---- Japanese kana → romaji (fallback; kanji stay as they are) ----
const KANA_MAP = (() => {
  const h = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ';
  const r = 'a i u e o ka ki ku ke ko sa shi su se so ta chi tsu te to na ni nu ne no ha hi fu he ho ma mi mu me mo ya yu yo ra ri ru re ro wa o n ga gi gu ge go za ji zu ze zo da ji zu de do ba bi bu be bo pa pi pu pe po'.split(' ');
  const m = {}; [...h].forEach((c, i) => { m[c] = r[i]; m[String.fromCharCode(c.charCodeAt(0) + 0x60)] = r[i]; });
  Object.assign(m, { 'ゃ': 'ya', 'ゅ': 'yu', 'ょ': 'yo', 'ャ': 'ya', 'ュ': 'yu', 'ョ': 'yo', 'ー': '-', 'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o', 'ァ': 'a', 'ィ': 'i', 'ゥ': 'u', 'ェ': 'e', 'ォ': 'o', 'ヴ': 'vu', '　': ' ', '、': ', ', '。': '. ' });
  return m;
})();
function kanaToRomaji(text) {
  let out = '';
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i], next = chars[i + 1];
    if (c === 'っ' || c === 'ッ') { const n = KANA_MAP[next]; if (n) out += n[0]; continue; }
    let r = KANA_MAP[c];
    if (r && next && 'ゃゅょャュョ'.includes(next)) { r = (r.endsWith('i') ? r.slice(0, -1) : r) + KANA_MAP[next].slice(r === 'shi' || r === 'chi' || r === 'ji' ? 1 : 0); i++; if (/^(sh|ch|j)/.test(r)) r = r.replace(/^(sh|ch|j)y/, '$1'); }
    out += r ?? c;
  }
  return out.replace(/\s+/g, ' ').trim();
}

// ---- Google (unofficial free endpoint) ----
async function google(text, target, withRoman) {
  const q = new URLSearchParams({ client: 'gtx', sl: 'auto', tl: target, dt: 't', q: text });
  if (withRoman) q.append('dt', 'rm');
  const r = await fetch(`https://translate.googleapis.com/translate_a/single?${q}`);
  if (!r.ok) throw new Error('translator unavailable');
  const d = await r.json();
  const segs = d[0] || [];
  const translated = segs.filter(s => typeof s[0] === 'string').map(s => s[0]).join('');
  const last = segs[segs.length - 1];
  const roman = last && last[0] == null && typeof last[3] === 'string' ? last[3] : null;
  return { translated, roman, lang: d[2] };
}
// ---- MyMemory (official free API, small quota) ----
async function mymemory(text, source, target) {
  const r = await fetch(`https://api.mymemory.translated.net/get?${new URLSearchParams({ q: text, langpair: `${source}|${target}` })}`);
  const d = await r.json();
  if (d.responseStatus !== 200) throw new Error(d.responseDetails || 'translator unavailable');
  return d.responseData.translatedText;
}

// Translate many lines in as few requests as possible, keeping the line breaks lined up
function chunks(lines, max = 1500) {
  const out = []; let cur = [];
  for (const l of lines) {
    if (cur.join('\n').length + l.length > max && cur.length) { out.push(cur); cur = []; }
    cur.push(l);
  }
  if (cur.length) out.push(cur);
  return out;
}

async function translateLines(texts, target, script) {
  const result = [];
  for (const part of chunks(texts)) {
    let lines = null;
    try {
      const g = await google(part.join('\n'), target, false);
      lines = g.translated.split('\n');
    } catch {}
    if (!lines || lines.length !== part.length) {
      // MyMemory takes at most 500 characters per request, so send smaller pieces
      const src = script === 'latin' ? 'en' : script === 'zh' ? 'zh-CN' : script;
      try {
        const got = [];
        for (const small of chunks(part, 450)) {
          const r = (await mymemory(small.join('\n'), src, target)).split('\n');
          if (r.length !== small.length) throw new Error('lines lost');
          got.push(...r);
        }
        lines = got;
      } catch { lines = null; }
    }
    if (!lines || lines.length !== part.length) {
      // line breaks got lost: translate each line on its own (slower, but lines stay matched)
      lines = [];
      for (const t of part) {
        if (!t.trim()) { lines.push(''); continue; }
        try { lines.push((await google(t, target, false)).translated); } catch { lines.push(''); }
      }
    }
    result.push(...lines.map(s => s.trim()));
  }
  return result;
}

async function romanizeLines(texts, script) {
  if (script === 'ko') {
    await loadScript('vendor/hangul-romanization.min.js');
    return texts.map(t => window.hangulRomanization.convert(t));
  }
  if (script === 'zh') {
    await loadScript('vendor/pinyin-pro.min.js');
    return texts.map(t => t.trim() ? window.pinyinPro.pinyin(t, { toneType: 'symbol', nonZh: 'consecutive' }) : '');
  }
  // Japanese: Google gives real romaji (kanji included); fall back to kana-only offline conversion
  const out = [];
  for (const part of chunks(texts)) {
    let lines = null;
    try { const g = await google(part.join('\n'), 'en', true); lines = g.roman?.split('\n'); } catch {}
    out.push(...(lines && lines.length === part.length ? lines : part.map(kanaToRomaji)));
  }
  return out.map(s => s.trim());
}

/** mode: 'translate' | 'romanize'. Returns one string per line (same order). */
export async function extraLines(trackId, lines, mode, target) {
  const key = `lx:${trackId}:${mode}:${mode === 'translate' ? target : ''}`;
  const saved = await kv.get(key).catch(() => null);
  if (saved && saved.length === lines.length) return saved;
  const texts = lines.map(l => l.text || '');
  const script = scriptOf(lines);
  const res = mode === 'romanize' ? await romanizeLines(texts, script) : await translateLines(texts, target, script);
  // don't show a "translation" that's identical to the original
  const cleaned = res.map((r, i) => (r && r.toLowerCase() !== texts[i].toLowerCase() ? r : ''));
  kv.set(key, cleaned).catch(() => {});
  return cleaned;
}

export const LANGS = [['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'], ['nl', 'Dutch'],
  ['pl', 'Polish'], ['tr', 'Turkish'], ['ru', 'Russian'], ['uk', 'Ukrainian'], ['ar', 'Arabic'], ['hi', 'Hindi'], ['id', 'Indonesian'], ['vi', 'Vietnamese'],
  ['th', 'Thai'], ['ja', 'Japanese'], ['ko', 'Korean'], ['zh-CN', 'Chinese'], ['sv', 'Swedish']];
export const defaultLang = () => { const l = (navigator.language || 'en').split('-')[0]; return LANGS.some(x => x[0] === l) ? l : 'en'; };
