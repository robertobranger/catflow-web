import { loadSettings } from './settings.js';

/**
 * POST to the Apps Script web app.
 * Content-Type text/plain avoids the CORS preflight, which Apps Script
 * cannot answer (no OPTIONS support).
 */
async function call(action, payload = {}) {
  const settings = loadSettings();
  if (!settings) throw new Error('App is not configured');

  const res = await fetch(settings.scriptUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, token: settings.token, ...payload }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'Request failed');
  return data;
}

export function addTransaction(tx) {
  return call('add', { tx });
}

export function fetchMeta() {
  return call('meta');
}
