// GPU backgrounds: mesh gradient, aurora, lava lamp, waves and starfield, all driven by the album colors.
// One WebGL canvas, rendered at reduced resolution (they're soft gradients) so it stays light on the GPU.
const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;
const HEAD = `precision highp float;
uniform float t; uniform vec2 res; uniform vec3 c1, c2, c3, c4; uniform float amt;
float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
vec3 dither(vec3 c){ return c + (h21(gl_FragCoord.xy + t) - 0.5) / 255.0; }
`;
const FRAG = {
  // Flowing mesh gradient: four color "pins" drift around, the space between them is warped by noise
  mesh: `void main(){
    vec2 uv = gl_FragCoord.xy / res; vec2 q = uv; q.x *= res.x / res.y;
    vec2 w = vec2(fbm(q * 1.4 + t * 0.05), fbm(q * 1.4 - t * 0.04 + 7.0)) - 0.5;
    q += w * (0.35 + amt * 0.5);
    float ar = res.x / res.y;
    vec2 p1 = vec2(0.25 * ar + 0.18 * sin(t * 0.13), 0.30 + 0.15 * cos(t * 0.11));
    vec2 p2 = vec2(0.80 * ar + 0.15 * cos(t * 0.09), 0.25 + 0.18 * sin(t * 0.12 + 1.0));
    vec2 p3 = vec2(0.70 * ar + 0.20 * sin(t * 0.07 + 2.0), 0.80 + 0.12 * cos(t * 0.10));
    vec2 p4 = vec2(0.20 * ar + 0.16 * cos(t * 0.08 + 3.0), 0.75 + 0.15 * sin(t * 0.09 + 2.0));
    float w1 = 1.0 / pow(distance(q, p1) + 0.05, 2.2), w2 = 1.0 / pow(distance(q, p2) + 0.05, 2.2);
    float w3 = 1.0 / pow(distance(q, p3) + 0.05, 2.2), w4 = 1.0 / pow(distance(q, p4) + 0.05, 2.2);
    vec3 col = (c1 * w1 + c2 * w2 + c3 * w3 + c4 * w4) / (w1 + w2 + w3 + w4);
    col *= 0.78 + 0.22 * fbm(q * 3.0 + t * 0.03);
    gl_FragColor = vec4(dither(col), 1.0); }`,
  // Aurora: soft curtains of light rising from the bottom
  aurora: `void main(){
    vec2 uv = gl_FragCoord.xy / res;
    vec3 col = mix(c4 * 0.25, c4 * 0.08, uv.y);
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float x = uv.x * (1.2 + fi * 0.4) + t * (0.03 + fi * 0.015) + fi * 3.1;
      float curtain = fbm(vec2(x * 2.0, t * 0.05 + fi));
      float center = 0.35 + 0.25 * curtain + fi * 0.08;
      float band = exp(-pow((uv.y - center) * (5.0 - fi), 2.0)) * smoothstep(0.0, 1.0, fbm(vec2(x * 6.0, uv.y * 2.0 - t * 0.1)));
      vec3 c = i == 0 ? c1 : (i == 1 ? c2 : c3);
      col += c * band * (0.55 + amt * 0.7);
    }
    gl_FragColor = vec4(dither(col), 1.0); }`,
  // Lava lamp: slow metaballs that merge and split
  lava: `void main(){
    vec2 uv = gl_FragCoord.xy / res; vec2 q = uv; q.x *= res.x / res.y; float ar = res.x / res.y;
    float f = 0.0; vec3 acc = vec3(0.0);
    for (int i = 0; i < 7; i++) {
      float fi = float(i);
      vec2 c = vec2(ar * (0.15 + 0.7 * fract(fi * 0.37 + 0.1 * sin(t * 0.07 + fi))), 0.5 + 0.42 * sin(t * (0.05 + fi * 0.013) + fi * 1.7));
      float r = 0.10 + 0.05 * sin(fi * 2.3 + t * 0.1);
      float v = r * r / dot(q - c, q - c);
      f += v; acc += v * (i < 2 ? c1 : (i < 4 ? c2 : c3));
    }
    vec3 blob = acc / max(f, 0.001);
    float edge = smoothstep(0.85, 1.25, f);
    vec3 col = mix(c4 * 0.3, blob * (0.9 + amt * 0.4), edge) + blob * 0.15 * smoothstep(0.3, 1.0, f);
    gl_FragColor = vec4(dither(col), 1.0); }`,
  // Waves: layered soft ribbons
  waves: `void main(){
    vec2 uv = gl_FragCoord.xy / res;
    vec3 col = mix(c4 * 0.35, c4 * 0.12, uv.y);
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float y = 0.12 + fi * 0.19 + 0.07 * sin(uv.x * (3.0 + fi) + t * (0.25 + fi * 0.07) + fi) + 0.03 * sin(uv.x * 9.0 - t * 0.4 + fi * 2.0);
      float d = uv.y - y;
      float ribbon = smoothstep(0.09, 0.0, abs(d)) * (0.35 + amt * 0.5);
      vec3 c = mod(fi, 3.0) < 1.0 ? c1 : (mod(fi, 3.0) < 2.0 ? c2 : c3);
      col = mix(col, c, ribbon * (1.0 - fi * 0.1));
      col += c * 0.06 * smoothstep(0.0, -0.4, d);
    }
    gl_FragColor = vec4(dither(col), 1.0); }`,
  // Starfield: stars drifting toward you over a colored nebula
  stars: `void main(){
    vec2 uv = (gl_FragCoord.xy - 0.5 * res) / res.y;
    vec3 col = c4 * 0.08 + c1 * 0.25 * fbm(uv * 1.5 + t * 0.01) * (0.6 + amt) + c2 * 0.18 * fbm(uv * 2.5 - t * 0.015 + 4.0);
    for (int L = 0; L < 4; L++) {
      float depth = fract(float(L) * 0.25 + t * 0.02);
      float scale = mix(18.0, 1.5, depth);
      vec2 g = uv * scale + float(L) * 13.7;
      vec2 id = floor(g), f = fract(g) - 0.5;
      float rnd = h21(id + float(L));
      vec2 o = vec2(h21(id + 3.1), h21(id + 7.3)) - 0.5;
      float d = length(f - o * 0.8);
      float star = smoothstep(0.08 * (0.3 + depth), 0.0, d) * step(0.72, rnd);
      float fade = smoothstep(0.0, 0.3, depth) * smoothstep(1.0, 0.85, depth);
      col += mix(vec3(1.0), c3, 0.3) * star * fade * (1.0 + rnd);
    }
    gl_FragColor = vec4(dither(col), 1.0); }`,
};
export const STYLES = Object.keys(FRAG);

let canvas, gl, buf, programs = {}, current = null, raf = 0, clock = 0, last = 0;
let speed = 1, amount = 0.5, scale = 0.5;
let colors = [[0.3, 0.1, 0.5], [0.8, 0.3, 0.4], [0.9, 0.6, 0.4], [0.1, 0.15, 0.4]], target = colors.map(c => c.slice());

function compile(type, src) {
  const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
function program(name) {
  if (programs[name]) return programs[name];
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, HEAD + FRAG[name]));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = n => gl.getUniformLocation(p, n);
  return (programs[name] = { p, loc: gl.getAttribLocation(p, 'p'), t: u('t'), res: u('res'), amt: u('amt'), c: [u('c1'), u('c2'), u('c3'), u('c4')] });
}

function init() {
  if (gl) return true;
  canvas = document.getElementById('bg-gl');
  gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
  if (!gl) return false;
  buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); programs = {}; gl = null; });
  return true;
}

function resize() {
  const w = Math.max(1, Math.round(innerWidth * scale)), h = Math.max(1, Math.round(innerHeight * scale));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
}

function draw(now) {
  raf = 0;
  if (!current || !gl) return;
  const dt = Math.min(100, now - (last || now)); last = now;
  if (!document.hidden) {
    clock += dt * 0.001 * speed;
    colors = colors.map((c, i) => c.map((v, k) => v + (target[i][k] - v) * Math.min(1, dt / 600)));
    resize();
    const P = program(current);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(P.p);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(P.loc);
    gl.vertexAttribPointer(P.loc, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1f(P.t, clock + 20);
    gl.uniform2f(P.res, canvas.width, canvas.height);
    gl.uniform1f(P.amt, amount);
    P.c.forEach((loc, i) => gl.uniform3fv(loc, colors[i]));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  raf = requestAnimationFrame(draw);
}

/** Show a style ('mesh', 'aurora', …) or pass null to stop. Returns false if WebGL isn't available. */
export function set(style, { motion = 1, intensity = 50 } = {}) {
  speed = motion; amount = intensity / 100;
  scale = style === 'stars' ? 0.75 : 0.5;
  if (!style) { current = null; if (canvas) canvas.style.opacity = 0; return true; }
  if (!init()) return false;
  try { program(style); } catch (e) { console.warn('Background shader failed:', e); return false; }
  current = style;
  canvas.style.opacity = 1;
  if (!raf) { last = 0; raf = requestAnimationFrame(draw); }
  return true;
}

const hexToRgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
export function setColors(hexes) {
  const list = (hexes || []).filter(h => /^#[0-9a-f]{6}$/i.test(h));
  if (!list.length) return;
  target = [0, 1, 2, 3].map(i => hexToRgb(list[i] || list[i % list.length]));   // always 4 colors
}
export const isRunning = () => !!current;
