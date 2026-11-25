// Liquid glass: real refraction using SVG displacement maps in backdrop-filter.
// Each .glass element gets a lens map matching its exact size and corner radius:
// the content behind is bent inward along the curved rim (like a thick glass edge),
// with a touch of chromatic aberration. Supported in Chrome/Edge; others fall back to frosted.
const NS = 'http://www.w3.org/2000/svg';
export const refractionSupported = (() => {
  const brands = navigator.userAgentData?.brands?.map(b => b.brand).join(' ') || '';
  return /Chrom|Edge|Brave|Opera/i.test(brands) || (/Chrome\//.test(navigator.userAgent) && !/Firefox/.test(navigator.userAgent));
})();

let svg, mode = 'liquid', strength = 0.6, nextId = 0;
const els = new Map();          // element -> { id, filter, key }
const mapCache = new Map();     // "w x h x r x bezel" -> data URL

function ensureSvg() {
  if (svg) return;
  svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
  svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none';
  document.body.appendChild(svg);
}

// Build a displacement map: R = x shift, G = y shift (128 = none)
function lensMap(w, h, r, bezel) {
  const key = `${w}x${h}x${r}x${bezel}`;
  if (mapCache.has(key)) return mapCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const px = x + 0.5, py = y + 0.5;
      const cx = Math.min(Math.max(px, r), w - r), cy = Math.min(Math.max(py, r), h - r);
      let dx = px - cx, dy = py - cy, dc = Math.hypot(dx, dy), dist, nx = 0, ny = 0;
      if (dc > 0.0001) { dist = r - dc; nx = dx / dc; ny = dy / dc; }
      else {
        const l = px, rt = w - px, t = py, b = h - py, m = Math.min(l, rt, t, b);
        dist = Math.max(m, r);
        if (m === l) nx = -1; else if (m === rt) nx = 1; else if (m === t) ny = -1; else ny = 1;
      }
      const i = (y * w + x) * 4;
      let mag = 0;
      if (dist >= 0 && dist < bezel) {
        const s = dist / bezel;               // 0 at rim, 1 where the flat top starts
        mag = Math.pow(1 - s, 2.4);           // convex squircle-ish lens: strongest at the rim
      }
      d[i] = 128 - nx * mag * 127;            // pull samples inward → magnified, bent edge
      d[i + 1] = 128 - ny * mag * 127;
      d[i + 2] = 128; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = c.toDataURL();
  if (mapCache.size > 60) mapCache.clear();
  mapCache.set(key, url);
  return url;
}

function radiusOf(el, w, h) {
  const r = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
  return Math.max(1, Math.min(r, w / 2, h / 2));
}

function build(el) {
  const entry = els.get(el);
  const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
  if (!w || !h || mode !== 'liquid' || !refractionSupported) { el.style.backdropFilter = ''; return; }
  const r = Math.round(radiusOf(el, w, h));
  const bezel = Math.round(Math.min(Math.max(r * 0.9, 14), Math.min(w, h) / 2, 40));
  const scale = (el.dataset.glassStrength ? Number(el.dataset.glassStrength) : 1) * strength * Math.min(70, 22 + bezel * 1.1);
  const key = `${w}|${h}|${r}|${bezel}|${scale.toFixed(1)}`;
  if (entry.key === key && entry.filter.isConnected) return applyStyle(el, entry);
  entry.key = key;
  const map = lensMap(w, h, r, bezel);
  const f = entry.filter;
  f.setAttribute('x', '0'); f.setAttribute('y', '0'); f.setAttribute('width', w); f.setAttribute('height', h);
  f.setAttribute('filterUnits', 'userSpaceOnUse');
  f.setAttribute('primitiveUnits', 'userSpaceOnUse');
  f.setAttribute('color-interpolation-filters', 'sRGB');
  const ab = 0.025; // chromatic aberration amount
  f.innerHTML = `
    <feImage href="${map}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${scale * (1 + ab)}" xChannelSelector="R" yChannelSelector="G" result="dr"/>
    <feColorMatrix in="dr" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="dg"/>
    <feColorMatrix in="dg" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="g"/>
    <feDisplacementMap in="SourceGraphic" in2="map" scale="${scale * (1 - ab)}" xChannelSelector="R" yChannelSelector="G" result="db"/>
    <feColorMatrix in="db" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="b"/>
    <feBlend in="r" in2="g" mode="screen" result="rg"/>
    <feBlend in="rg" in2="b" mode="screen"/>`;
  applyStyle(el, entry);
}

function applyStyle(el, entry) {
  const blur = el.dataset.glassBlur ?? 3;
  el.style.backdropFilter = `url(#${entry.id}) blur(${blur}px) saturate(1.7) brightness(1.04)`;
}

let pending = new Set(), raf = 0;
function schedule(el) {
  pending.add(el);
  if (!raf) raf = requestAnimationFrame(() => { raf = 0; const p = pending; pending = new Set(); p.forEach(e => els.has(e) && build(e)); });
}
const ro = new ResizeObserver(entries => entries.forEach(e => schedule(e.target)));

export function attach(el) {
  if (els.has(el)) return;
  ensureSvg();
  const id = `lg${nextId++}`;
  const filter = document.createElementNS(NS, 'filter');
  filter.id = id;
  svg.appendChild(filter);
  els.set(el, { id, filter, key: '' });
  ro.observe(el);
  schedule(el);
}

export function attachAll(root = document) { root.querySelectorAll('.glass').forEach(attach); }

export function configure(newMode, newStrength) {
  mode = newMode; strength = newStrength;
  document.documentElement.dataset.glass = mode === 'liquid' && !refractionSupported ? 'frosted' : mode;
  els.forEach((_, el) => { els.get(el).key = ''; schedule(el); });
}
export function refresh(el) { if (els.has(el)) { els.get(el).key = ''; schedule(el); } }
