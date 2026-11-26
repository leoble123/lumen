// Font choices: built-in system stacks plus a curated set of Google Fonts, loaded only when picked.
export const BUILTIN = {
  system: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI Variable Display", "Segoe UI", Inter, Roboto, sans-serif',
  rounded: '"SF Pro Rounded", ui-rounded, "Nunito", "Varela Round", "Segoe UI", sans-serif',
  serif: '"New York", ui-serif, "Iowan Old Style", Georgia, "Times New Roman", serif',
  mono: 'ui-monospace, "SF Mono", "Cascadia Code", Menlo, Consolas, monospace',
};
// [family, fallback, weights]
const GOOGLE = [
  ['Inter', 'sans-serif'], ['Manrope', 'sans-serif'], ['Plus Jakarta Sans', 'sans-serif'], ['DM Sans', 'sans-serif'], ['Outfit', 'sans-serif'],
  ['Sora', 'sans-serif'], ['Figtree', 'sans-serif'], ['Lexend', 'sans-serif'], ['Urbanist', 'sans-serif'], ['Space Grotesk', 'sans-serif'],
  ['Poppins', 'sans-serif'], ['Montserrat', 'sans-serif'], ['Nunito', 'sans-serif'], ['Quicksand', 'sans-serif'], ['Rubik', 'sans-serif'],
  ['Work Sans', 'sans-serif'], ['Syne', 'sans-serif'], ['Bricolage Grotesque', 'sans-serif'], ['Unbounded', 'sans-serif'],
  ['Playfair Display', 'serif'], ['DM Serif Display', 'serif'], ['Fraunces', 'serif'], ['Lora', 'serif'], ['Cormorant Garamond', 'serif'], ['Instrument Serif', 'serif'],
  ['Bebas Neue', 'sans-serif'], ['Anton', 'sans-serif'], ['Righteous', 'sans-serif'], ['Pacifico', 'cursive'], ['Caveat', 'cursive'], ['Permanent Marker', 'cursive'],
  ['Press Start 2P', 'monospace'], ['VT323', 'monospace'], ['JetBrains Mono', 'monospace'], ['Space Mono', 'monospace'], ['IBM Plex Mono', 'monospace'],
];
const slug = f => f.toLowerCase().replace(/[^a-z0-9]+/g, '-');
export const OPTIONS = [
  ['system', 'System'], ['rounded', 'Rounded'], ['serif', 'Serif'], ['mono', 'Mono'],
  ...GOOGLE.map(([f]) => [slug(f), f]),
];
const byKey = Object.fromEntries(GOOGLE.map(g => [slug(g[0]), g]));
const loaded = new Set();

export function stack(key) {
  if (BUILTIN[key]) return BUILTIN[key];
  const g = byKey[key];
  if (!g) return BUILTIN.system;
  load(g[0]);
  return `"${g[0]}", ${g[1]}`;
}
function load(family) {
  if (loaded.has(family)) return;
  loaded.add(family);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  // single-weight display fonts only ship 400; the browser picks the closest available weight
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;500;600;700;800&display=swap`;
  link.onerror = () => {
    const l2 = document.createElement('link'); l2.rel = 'stylesheet';
    l2.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}&display=swap`;
    document.head.appendChild(l2);
  };
  document.head.appendChild(link);
}
