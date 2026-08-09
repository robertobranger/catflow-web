const KEY = 'catflow.settings';

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s.scriptUrl || !s.token) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveSettings(settings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

export function clearSettings() {
  localStorage.removeItem(KEY);
}
