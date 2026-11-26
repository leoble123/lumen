// Spotify login using PKCE (no client secret needed, safe for a desktop app)
const REDIRECT_URI = `${location.origin}/callback`;
const SCOPES = [
  'streaming', 'user-read-email', 'user-read-private',
  'user-read-playback-state', 'user-modify-playback-state', 'user-read-currently-playing',
  'playlist-read-private', 'playlist-read-collaborative', 'user-library-read',
  'playlist-modify-public', 'playlist-modify-private', 'user-library-modify', 'user-follow-read', 'user-follow-modify',
  'user-top-read', 'user-read-recently-played',
].join(' ');

// Permissions added in newer versions of Lumen; older logins need to reconnect once to get them.
export function missingScopes() {
  const t = store.get('tokens');
  if (!t) return [];
  const granted = new Set((t.scope || '').split(' '));
  return SCOPES.split(' ').filter(s => !granted.has(s));
}

const store = {
  get: k => { try { return JSON.parse(localStorage.getItem('lumen.' + k)); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem('lumen.' + k, JSON.stringify(v)); } catch {} },
  del: k => { try { localStorage.removeItem('lumen.' + k); } catch {} },
};
export { store };

const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function login(clientId) {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(64)));
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  store.set('clientId', clientId);
  store.set('verifier', verifier);
  const params = new URLSearchParams({
    client_id: clientId, response_type: 'code', redirect_uri: REDIRECT_URI,
    scope: SCOPES, code_challenge_method: 'S256', code_challenge: challenge,
  });
  location.href = `https://accounts.spotify.com/authorize?${params}`;
}

async function tokenRequest(body) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Login failed');
  const prev = store.get('tokens') || {};
  const tokens = {
    access: data.access_token,
    refresh: data.refresh_token || prev.refresh,
    expiresAt: Date.now() + data.expires_in * 1000,
    scope: data.scope || prev.scope || '',
  };
  store.set('tokens', tokens);
  return tokens;
}

// Returns true if we just came back from Spotify's login page
export async function handleCallback() {
  if (location.pathname !== '/callback') return false;
  const q = new URLSearchParams(location.search);
  history.replaceState(null, '', '/');
  if (q.get('error')) throw new Error(`Spotify said: ${q.get('error')}`);
  const code = q.get('code');
  if (!code) return false;
  await tokenRequest({
    grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI,
    client_id: store.get('clientId'), code_verifier: store.get('verifier'),
  });
  store.del('verifier');
  return true;
}

let refreshing = null;
export async function getToken(force = false) {
  const t = store.get('tokens');
  if (!t) return null;
  if (!force && Date.now() < t.expiresAt - 60_000) return t.access;
  if (!refreshing) {
    refreshing = tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: store.get('clientId') })
      .finally(() => { refreshing = null; });
  }
  return (await refreshing).access;
}

export const isLoggedIn = () => !!store.get('tokens');
export function logout() { store.del('tokens'); }
