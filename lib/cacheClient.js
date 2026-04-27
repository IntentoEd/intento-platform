// Cache client-side em localStorage pra exibir último estado conhecido
// imediatamente, mesmo com rede lenta ou offline.
// Ciclo: chega na tela → getCache (instantâneo) → fetch real em background
// → quando volta, atualiza state.

const PREFIX = 'intento_cache_v1_';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias — depois disso descarta

function safe() {
  try { return typeof window !== 'undefined' && !!window.localStorage; } catch { return false; }
}

export function getCache(key) {
  if (!safe()) return null;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.ts) return null;
    if (Date.now() - obj.ts > MAX_AGE_MS) {
      localStorage.removeItem(PREFIX + key);
      return null;
    }
    return obj; // { ts, data }
  } catch { return null; }
}

export function setCache(key, data) {
  if (!safe()) return;
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
  } catch (e) {
    // Pode estourar quota — limpa caches antigos e tenta de novo
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(PREFIX))
        .forEach(k => localStorage.removeItem(k));
      localStorage.setItem(PREFIX + key, JSON.stringify({ ts: Date.now(), data }));
    } catch {}
  }
}

export function clearCache(key) {
  if (!safe()) return;
  try {
    if (key) localStorage.removeItem(PREFIX + key);
    else Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k));
  } catch {}
}

// Formata "atualizado há X" pra exibir
export function tempoRelativo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'agora';
  const m = Math.floor(s / 60);
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}
