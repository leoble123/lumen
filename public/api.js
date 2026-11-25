import { getToken } from './auth.js';

// Small wrapper around the Spotify Web API
export async function api(path, { method = 'GET', body, query } = {}, retry = true) {
  const url = new URL(path.startsWith('http') ? path : `https://api.spotify.com/v1${path}`);
  if (query) Object.entries(query).forEach(([k, v]) => v != null && url.searchParams.set(k, v));
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${await getToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && retry) { await getToken(true); return api(path, { method, body, query }, false); }
  if (res.status === 429 && retry) {
    const wait = Number(res.headers.get('Retry-After') || 1) * 1000;
    await new Promise(r => setTimeout(r, wait));
    return api(path, { method, body, query }, false);
  }
  if (res.status === 204 || res.status === 202) return null;
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) {
    const err = new Error(data?.error?.message || `Spotify error ${res.status}`);
    err.status = res.status; err.reason = data?.error?.reason;
    throw err;
  }
  return data;
}
