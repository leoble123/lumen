// Floating particles drawn on a 2D canvas: dust, bokeh, snow, fireflies. Tinted with the album colors.
let canvas, ctx2d, parts = [], type = 'none', amount = 50, colors = ['#ffffff'], raf = 0, last = 0, speedMul = 1;
const rnd = (a, b) => a + Math.random() * (b - a);

const KINDS = {
  dust:      { n: 120, make: () => ({ r: rnd(0.6, 1.8), vx: rnd(-6, 6), vy: rnd(-14, -4), a: rnd(0.15, 0.6), tw: rnd(0, 6) }) },
  bokeh:     { n: 26,  make: () => ({ r: rnd(18, 70), vx: rnd(-6, 6), vy: rnd(-8, 8), a: rnd(0.05, 0.16), tw: rnd(0, 6) }) },
  snow:      { n: 160, make: () => ({ r: rnd(1, 3.2), vx: rnd(-10, 10), vy: rnd(18, 55), a: rnd(0.35, 0.9), tw: rnd(0, 6) }) },
  fireflies: { n: 45,  make: () => ({ r: rnd(1.4, 2.8), vx: rnd(-18, 18), vy: rnd(-18, 18), a: 1, tw: rnd(0, 6) }) },
};

function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = innerWidth * dpr; canvas.height = innerHeight * dpr;
  ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function seed() {
  const k = KINDS[type]; if (!k) { parts = []; return; }
  const n = Math.round(k.n * (amount / 50));
  parts = Array.from({ length: n }, () => ({ ...k.make(), x: rnd(0, innerWidth), y: rnd(0, innerHeight), c: colors[Math.floor(Math.random() * colors.length)] }));
}

function frame(now) {
  raf = 0;
  if (type === 'none') return;
  const dt = Math.min(0.1, (now - (last || now)) / 1000); last = now;
  if (!document.hidden) {
    const W = innerWidth, H = innerHeight;
    ctx2d.clearRect(0, 0, W, H);
    ctx2d.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      p.tw += dt;
      if (type === 'fireflies') { p.vx += rnd(-30, 30) * dt; p.vy += rnd(-30, 30) * dt; p.vx *= 0.98; p.vy *= 0.98; }
      if (type === 'snow') p.vx += Math.sin(p.tw * 0.8) * 4 * dt;
      p.x += p.vx * dt * speedMul; p.y += p.vy * dt * speedMul;
      const m = p.r * 3;
      if (p.x < -m) p.x = W + m; if (p.x > W + m) p.x = -m;
      if (p.y < -m) p.y = H + m; if (p.y > H + m) p.y = -m;
      let a = p.a;
      if (type === 'fireflies') a = Math.max(0, Math.sin(p.tw * 1.6)) ** 2;
      if (type === 'dust') a *= 0.6 + 0.4 * Math.sin(p.tw * 2);
      if (type === 'bokeh' || type === 'fireflies') {
        const g = ctx2d.createRadialGradient(p.x, p.y, 0, p.x, p.y, type === 'fireflies' ? p.r * 6 : p.r);
        g.addColorStop(0, hexA(p.c, a)); g.addColorStop(type === 'fireflies' ? 0.25 : 0.7, hexA(p.c, a * 0.6)); g.addColorStop(1, hexA(p.c, 0));
        ctx2d.fillStyle = g; ctx2d.beginPath(); ctx2d.arc(p.x, p.y, type === 'fireflies' ? p.r * 6 : p.r, 0, 7); ctx2d.fill();
      } else {
        ctx2d.fillStyle = type === 'snow' ? `rgba(255,255,255,${a})` : hexA(p.c, a);
        ctx2d.beginPath(); ctx2d.arc(p.x, p.y, p.r, 0, 7); ctx2d.fill();
      }
    }
  }
  raf = requestAnimationFrame(frame);
}
function hexA(h, a) { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a.toFixed(3)})`; }

export function set(newType, newAmount = 50, speed = 1) {
  canvas ||= document.getElementById('particles');
  ctx2d ||= canvas.getContext('2d');
  const changed = newType !== type || newAmount !== amount;
  type = newType; amount = newAmount; speedMul = speed;
  canvas.style.opacity = type === 'none' ? 0 : 1;
  if (type === 'none') { ctx2d.clearRect(0, 0, canvas.width, canvas.height); return; }
  resize();
  if (changed || !parts.length) seed();
  if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
}
export function setColors(list) {
  colors = list.filter(h => /^#[0-9a-f]{6}$/i.test(h)).map(h => {
    // brighten so particles glow on dark backgrounds
    const n = parseInt(h.slice(1), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => Math.round(v + (255 - v) * 0.45));
    return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  });
  if (!colors.length) colors = ['#ffffff'];
  parts.forEach(p => { p.c = colors[Math.floor(Math.random() * colors.length)]; });
}
window.addEventListener('resize', () => { if (canvas && type !== 'none') resize(); });
export const count = () => parts.length;
