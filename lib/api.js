// Wrapper de fetch que adiciona automaticamente o Firebase ID token
// no header Authorization. Usar nos componentes pra chamar APIs protegidas.

import { auth } from './firebase';

async function getIdToken() {
  try {
    const user = auth.currentUser;
    if (!user) return null;
    return await user.getIdToken(/* forceRefresh */ false);
  } catch (e) {
    console.warn('[api] getIdToken falhou:', e.message);
    return null;
  }
}

export async function apiFetch(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = await getIdToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...options, headers });
}

// Helper conveniente pra POST em /api/mentor com uma `acao`.
// Auto-adiciona Content-Type e o token. Retorna o JSON parseado.
export async function callMentor(acao, body = {}) {
  const res = await apiFetch('/api/mentor', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao, ...body }),
  });
  return res.json();
}
