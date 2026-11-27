// Phone gestures + haptics, so Lumen feels like a native app:
//  - swipe the album art left/right → next / previous song (the art follows your finger)
//  - swipe the mini player up → open Now Playing; left/right → next / previous
//  - pull a panel (Customize, Queue, Devices) down by its header → close it
//  - light haptic taps on key actions (Android app; vibration fallback elsewhere)
let ctx;   // { next, prev, openNowPlaying }

export function haptic(kind = 'tap') {
  try {
    if (window.LumenAndroid?.haptic) window.LumenAndroid.haptic(kind);
    else if (matchMedia('(hover: none)').matches && navigator.vibrate) navigator.vibrate(kind === 'heavy' ? 14 : 6);
  } catch {}
}

function swipe(el, { onMove, onEnd, axis = 'x' }) {
  let sx = 0, sy = 0, dx = 0, dy = 0, active = false, decided = false, horizontal = false, id = null;
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') return;
    id = e.pointerId; sx = e.clientX; sy = e.clientY; dx = dy = 0; active = true; decided = false;
  }, { passive: true });
  el.addEventListener('pointermove', e => {
    if (!active || e.pointerId !== id) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    if (!decided && Math.hypot(dx, dy) > 8) { decided = true; horizontal = Math.abs(dx) > Math.abs(dy); }
    if (decided && (axis === 'x' ? horizontal : !horizontal)) onMove(dx, dy);
  }, { passive: true });
  const end = e => {
    if (!active || (e && e.pointerId !== id)) return;
    active = false;
    if (decided && (axis === 'x' ? horizontal : !horizontal)) onEnd(dx, dy); else onMove(0, 0, true);
  };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', () => { active = false; onMove(0, 0, true); });
}

export function setup(c) {
  ctx = c;
  const touch = matchMedia('(hover: none)').matches;
  if (!touch) return;

  // Album art: follow the finger, then fly out and come back with the new song
  const art = document.querySelector('.art-wrap');
  art.style.touchAction = 'pan-y';
  swipe(art, {
    onMove: (dx, dy, reset) => {
      art.style.transition = reset ? '' : 'none';
      art.style.translate = reset ? '' : `${dx * 0.9}px 0`;
      art.style.opacity = reset ? '' : String(1 - Math.min(Math.abs(dx) / 500, 0.5));
    },
    onEnd: dx => {
      art.style.transition = '';
      if (Math.abs(dx) > 70) {
        haptic('tap');
        art.style.translate = `${dx > 0 ? 120 : -120}%`; art.style.opacity = '0';
        dx < 0 ? ctx.next() : ctx.prev();
        setTimeout(() => { art.style.transition = 'none'; art.style.translate = `${dx > 0 ? -40 : 40}%`; requestAnimationFrame(() => { art.style.transition = ''; art.style.translate = ''; art.style.opacity = ''; }); }, 220);
      } else { art.style.translate = ''; art.style.opacity = ''; }
    },
  });

  // Mini player: up opens Now Playing, sideways skips
  const mini = document.querySelector('#mini');
  mini.style.touchAction = 'none';
  let lastDir = null;
  swipe(mini, { axis: 'x', onMove: (dx, dy, reset) => { mini.style.translate = reset ? '' : `${dx * 0.5}px 0`; }, onEnd: dx => {
    mini.style.translate = '';
    if (Math.abs(dx) > 60) { haptic('tap'); dx < 0 ? ctx.next() : ctx.prev(); }
  } });
  swipe(mini, { axis: 'y', onMove: (dx, dy, reset) => { lastDir = dy; mini.style.translate = reset ? '' : `0 ${Math.min(0, dy) * 0.6}px`; }, onEnd: (dx, dy) => {
    mini.style.translate = '';
    if (dy < -40) { haptic('tap'); ctx.openNowPlaying(); }
  } });

  // Panels: pull down by the header to close
  for (const sheet of document.querySelectorAll('.sheet')) {
    const head = sheet.querySelector('.sheet-head');
    head.style.touchAction = 'none';
    swipe(head, { axis: 'y', onMove: (dx, dy, reset) => {
      sheet.style.transition = reset ? '' : 'none';
      sheet.style.translate = reset ? '' : `0 ${Math.max(0, dy)}px`;
    }, onEnd: (dx, dy) => {
      sheet.style.transition = ''; sheet.style.translate = '';
      if (dy > 90) { haptic('tap'); sheet.classList.remove('open'); }
    } });
  }
}
