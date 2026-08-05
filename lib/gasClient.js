// Cliente único pra falar com o Google Apps Script.
// Injeta GAS_API_TOKEN em todo payload (defesa server-to-server: a URL pública
// do /exec só aceita requisições com esse token). Use SEMPRE este helper —
// chamar fetch(process.env.GOOGLE_APPSCRIPT_URL) diretamente bypassa a auth.

let avisouTokenAusente = false;

// O /exec do GAS falha de forma intermitente (HTML de erro no lugar do JSON,
// 404/500 transientes — pior em horário de pico). Leituras são idempotentes,
// então ganham retry com backoff. Escritas NÃO: retry cego pode duplicar
// diário/registro se a primeira tentativa tiver gravado antes de falhar.
// Prefixos cobrem todas as ações de leitura atuais (buscar*, lista*/listar*,
// ler*, dashboard*, verificar*, carga*).
const ACAO_LEITURA_RE = /^(buscar|lista|ler|dashboard|verificar|carga)/;
const TENTATIVAS_LEITURA = 3;
const BACKOFF_MS = [500, 1500];

export async function chamarGAS(payload, opcoes = {}) {
  const url = process.env.GOOGLE_APPSCRIPT_URL;
  if (!url) throw new Error('GOOGLE_APPSCRIPT_URL não configurada');

  const token = process.env.GAS_API_TOKEN;
  if (!token && !avisouTokenAusente) {
    avisouTokenAusente = true;
    console.warn('[gasClient] GAS_API_TOKEN ausente — chamadas vão falhar quando o GAS validar.');
  }

  const corpo = { ...payload, token };
  const acao = payload.acao || payload.tipo || '';
  const tentativas = ACAO_LEITURA_RE.test(acao) ? TENTATIVAS_LEITURA : 1;

  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    if (i > 0) {
      console.warn(`[gasClient] ${acao}: tentativa ${i + 1}/${tentativas} após falha: ${ultimoErro.message}`);
      await new Promise(r => setTimeout(r, BACKOFF_MS[i - 1] || 1500));
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
        redirect: 'follow',
        ...opcoes,
      });

      const texto = await res.text();
      if (!res.ok) throw new Error(`GAS HTTP ${res.status}: ${texto.slice(0, 200)}`);
      try {
        return JSON.parse(texto);
      } catch {
        // Página "Erro" do Apps Script vem como HTML com HTTP 200.
        throw new Error(`GAS respondeu não-JSON (página de erro do Apps Script): ${texto.slice(0, 120)}`);
      }
    } catch (e) {
      ultimoErro = e;
    }
  }
  throw ultimoErro;
}
