// Cliente único pra falar com o Google Apps Script.
// Injeta GAS_API_TOKEN em todo payload (defesa server-to-server: a URL pública
// do /exec só aceita requisições com esse token). Use SEMPRE este helper —
// chamar fetch(process.env.GOOGLE_APPSCRIPT_URL) diretamente bypassa a auth.

let avisouTokenAusente = false;

export async function chamarGAS(payload, opcoes = {}) {
  const url = process.env.GOOGLE_APPSCRIPT_URL;
  if (!url) throw new Error('GOOGLE_APPSCRIPT_URL não configurada');

  const token = process.env.GAS_API_TOKEN;
  if (!token && !avisouTokenAusente) {
    avisouTokenAusente = true;
    console.warn('[gasClient] GAS_API_TOKEN ausente — chamadas vão falhar quando o GAS validar.');
  }

  const corpo = { ...payload, token };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    redirect: 'follow',
    ...opcoes,
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`GAS HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }

  return res.json();
}
