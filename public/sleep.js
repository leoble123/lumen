// Sleep timer: pause after a while, or when the current song ends.
let ctx;            // { getState, pause, toast, openMenu, onChange }
let timer = null, endsAt = 0, untilTrack = null, ticker = null;

export function setup(c) { ctx = c; }
export const active = () => !!(timer || untilTrack);

export function label() {
  if (untilTrack) return 'End of song';
  if (!timer) return '';
  const m = Math.max(1, Math.ceil((endsAt - Date.now()) / 60000));
  return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`;
}

function clear() {
  clearTimeout(timer); clearInterval(ticker);
  timer = null; untilTrack = null; ticker = null; endsAt = 0;
}

export function set(what) {
  clear();
  if (what === 'song') {
    untilTrack = ctx.getState().track?.id || '__none';
    ctx.toast('Lumen will pause when this song ends');
  } else if (what > 0) {
    endsAt = Date.now() + what * 60000;
    timer = setTimeout(fire, what * 60000);
    ctx.toast(`Sleep timer: ${what >= 60 ? `${what / 60} h` : `${what} min`}`);
  } else ctx.toast('Sleep timer off');
  if (timer) ticker = setInterval(() => ctx.onChange(), 30000);
  ctx.onChange();
}

function fire() {
  clear();
  if (!ctx.getState().paused) ctx.pause();
  ctx.toast('Sleep timer: paused. Good night 🌙');
  ctx.onChange();
}

// called whenever the playing song changes
export function onTrackChange(id) {
  if (untilTrack && id !== untilTrack) fire();
}

export function menu(anchor) {
  const on = active();
  ctx.openMenu(anchor, [
    ...[15, 30, 45, 60, 90].map(m => ({ label: m >= 60 ? `${m / 60 === 1 ? '1 hour' : '1½ hours'}` : `${m} minutes`, icon: 'moon', action: () => set(m) })),
    { label: 'End of this song', icon: 'note', action: () => set('song') },
    on && '-',
    on && { label: `Turn off (${label()} left)`, icon: 'close', danger: true, action: () => set(0) },
  ]);
}
