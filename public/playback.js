// Three interchangeable ways to drive playback. They all report the same state shape:
// { track: {id,name,artist,album,image,durationMs,uri}, positionMs, paused, at, shuffle, repeat }
import { api } from './api.js';
import { getToken } from './auth.js';

const REPEAT = ['off', 'context', 'track'];

const idFromUri = uri => uri ? uri.split(':').pop() : null;

function fromApiItem(item) {
  if (!item) return null;
  return {
    id: item.id, uri: item.uri, name: item.name,
    artistList: (item.artists || []).map(a => ({ id: a.id || idFromUri(a.uri), name: a.name })),
    albumId: item.album?.id || idFromUri(item.album?.uri),
    artist: (item.artists || item.show && [item.show] || []).map(a => a.name).join(', '),
    album: item.album?.name || '',
    image: (item.album?.images || item.images || [])[0]?.url || '',
    durationMs: item.duration_ms,
  };
}

/* 1) Play inside Lumen with the Spotify Web Playback SDK */
export function sdkSource({ onState, onError, volume }) {
  let player, deviceId, last = null;
  const self = {
    name: 'Playing in Lumen',
    get deviceId() { return deviceId; },
    async start() {
      await new Promise((resolve, reject) => {
        window.onSpotifyWebPlaybackSDKReady = resolve;
        const s = document.createElement('script');
        s.src = 'https://sdk.scdn.co/spotify-player.js';
        s.onerror = () => reject(new Error('Could not load the Spotify player'));
        document.head.appendChild(s);
      });
      player = new window.Spotify.Player({ name: 'Lumen', getOAuthToken: cb => getToken().then(cb), volume });
      player.addListener('initialization_error', e => onError('init', e.message));
      player.addListener('authentication_error', e => onError('auth', e.message));
      player.addListener('account_error', () => onError('account', 'Spotify Premium is required to play music in Lumen.'));
      player.addListener('playback_error', e => onError('playback', e.message));
      player.addListener('player_state_changed', s => {
        if (!s) return;
        const t = s.track_window.current_track;
        last = {
          track: t && { id: t.id, uri: t.uri, name: t.name, artist: t.artists.map(a => a.name).join(', '),
            artistList: t.artists.map(a => ({ id: idFromUri(a.uri), name: a.name })), albumId: idFromUri(t.album.uri),
            album: t.album.name, image: t.album.images.sort((a, b) => b.width - a.width)[0]?.url, durationMs: s.duration },
          positionMs: s.position, paused: s.paused, at: performance.now(), deviceName: 'this computer',
          shuffle: s.shuffle, repeat: REPEAT[s.repeat_mode] || 'off',
        };
        onState(last);
      });
      const ready = new Promise((resolve, reject) => {
        player.addListener('ready', ({ device_id }) => { deviceId = device_id; resolve(); });
        setTimeout(() => reject(new Error('Spotify player timed out')), 15000);
      });
      const ok = await player.connect();
      if (!ok) throw new Error('Spotify player could not connect');
      await ready;
      // Move playback to Lumen
      await api('/me/player', { method: 'PUT', body: { device_ids: [deviceId], play: false } }).catch(() => {});
    },
    toggle: () => { player.activateElement?.(); return player.togglePlay(); },
    next: () => player.nextTrack(),
    prev: () => player.previousTrack(),
    seek: ms => player.seek(Math.round(ms)),
    setVolume: v => player.setVolume(v),
    shuffle: on => api('/me/player/shuffle', { method: 'PUT', query: { state: on, device_id: deviceId } }),
    repeat: mode => api('/me/player/repeat', { method: 'PUT', query: { state: mode, device_id: deviceId } }),
    play: body => { player.activateElement?.(); return api('/me/player/play', { method: 'PUT', query: { device_id: deviceId }, body }); },
    stop: () => player?.disconnect(),
  };
  return self;
}

/* 2) Remote-control the official Spotify app (or your phone/speaker) */
export function remoteSource({ onState, onError }) {
  let timer, stopped = false;
  async function poll() {
    if (stopped) return;
    try {
      const s = await api('/me/player', { query: { additional_types: 'track,episode' } });
      onState(s ? {
        track: fromApiItem(s.item), positionMs: s.progress_ms || 0, paused: !s.is_playing,
        at: performance.now(), shuffle: s.shuffle_state, repeat: s.repeat_state, volume: s.device?.volume_percent, deviceName: s.device?.name,
      } : { track: null, positionMs: 0, paused: true, at: performance.now() });
    } catch (e) { onError('poll', e.message); }
    timer = setTimeout(poll, document.hidden ? 5000 : 1500);
  }
  const refresh = () => { clearTimeout(timer); setTimeout(poll, 300); };
  const call = (p, opts) => api(p, opts).then(refresh).catch(e => {
    const err = new Error(e.reason === 'NO_ACTIVE_DEVICE' || (e.status === 404 && p.startsWith('/me/player'))
      ? 'Open Spotify on any device and play something first.'
      : e.status === 403 && !/scope/i.test(e.message) ? 'Spotify Premium is required for playback controls.' : e.message);
    err.status = e.status;
    throw err;
  });
  let paused = true;
  const wrapState = onState;
  onState = s => { paused = s.paused; wrapState(s); };
  return {
    name: 'Controlling Spotify',
    start: async () => { poll(); },
    toggle: () => call(paused ? '/me/player/play' : '/me/player/pause', { method: 'PUT' }),
    next: () => call('/me/player/next', { method: 'POST' }),
    prev: () => call('/me/player/previous', { method: 'POST' }),
    seek: ms => call('/me/player/seek', { method: 'PUT', query: { position_ms: Math.round(ms) } }),
    setVolume: v => call('/me/player/volume', { method: 'PUT', query: { volume_percent: Math.round(v * 100) } }),
    shuffle: on => call('/me/player/shuffle', { method: 'PUT', query: { state: on } }),
    repeat: mode => call('/me/player/repeat', { method: 'PUT', query: { state: mode } }),
    play: body => call('/me/player/play', { method: 'PUT', body }),
    stop: () => { stopped = true; clearTimeout(timer); },
  };
}

/* 3) Demo: no account needed, shows off the lyrics view */
export const DEMO_LRC = `[00:00.00]
[00:04.20]Neon rivers running through the city
[00:08.10]Every window humming like a choir
[00:12.30]I've been counting headlights on the ceiling
[00:16.40]Waiting for the static to catch fire
[00:20.60]
[00:26.00]So turn it up, let the night roll over
[00:29.80]We're glowing brighter than the screens
[00:33.60]Hold on tight, it's a little bit closer
[00:37.50]To everything we never said we mean
[00:41.80]
[00:47.20]Paper planes across the satellite
[00:51.00]Writing all our names in borrowed light
[00:55.20]And if the morning comes too soon
[00:59.00]We'll dance across the dark side of the moon
[01:04.50]`;

export function demoSource({ onState }) {
  const DUR = 70000;
  let pos = 0, paused = false, at = performance.now(), timer;
  const art = 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff3d77"/><stop offset=".55" stop-color="#7a2cff"/><stop offset="1" stop-color="#0d1b6e"/></linearGradient></defs>
    <rect width="400" height="400" fill="url(#g)"/><circle cx="290" cy="120" r="70" fill="#ffd36e" opacity=".9"/>
    <path d="M0 300 Q100 240 200 290 T400 270 V400 H0Z" fill="#000" opacity=".35"/>
    <text x="28" y="370" font-family="Helvetica, Arial" font-weight="800" font-size="34" fill="#fff">NEON RIVERS</text></svg>`);
  const track = { id: 'demo', uri: 'demo', name: 'Neon Rivers', artist: 'Lumen Demo', album: 'Night Signals', image: art, durationMs: DUR,
    demoColors: ['#7a2cff', '#ff3d77', '#0d1b6e'] };
  const cur = () => paused ? pos : (pos + performance.now() - at) % DUR;
  const emit = () => { pos = cur(); at = performance.now(); onState({ track, positionMs: pos, paused, at, shuffle: false, repeat: 'context' }); };
  return {
    name: 'Demo',
    demoLyrics: DEMO_LRC,
    start: async () => { emit(); timer = setInterval(() => { if (!paused && cur() < 400) emit(); }, 300); },
    toggle: () => { pos = cur(); paused = !paused; at = performance.now(); emit(); },
    next: () => { pos = 0; at = performance.now(); emit(); },
    prev: () => { pos = 0; at = performance.now(); emit(); },
    seek: ms => { pos = ms; at = performance.now(); emit(); },
    setVolume: () => {}, shuffle: () => {}, repeat: () => {}, play: () => {},
    stop: () => clearInterval(timer),
  };
}
