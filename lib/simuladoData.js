// Fonte única das regras de data de simulado (frontend).
// IMPORTANTE: o range mínimo está espelhado no backend em gas/Code.gs
// (constante SIM_ANO_MIN). Se mudar aqui, mude lá também.

export const SIMULADO_ANO_MIN = 2000;

// Data mínima/máxima aceitas (máxima = hoje, dinâmico).
export function simuladoDataMinISO() {
  return `${SIMULADO_ANO_MIN}-01-01`;
}
export function simuladoDataMaxISO() {
  const h = new Date();
  const mm = String(h.getMonth() + 1).padStart(2, '0');
  const dd = String(h.getDate()).padStart(2, '0');
  return `${h.getFullYear()}-${mm}-${dd}`;
}

// Tenta parsear a data crua (aceita Date, "yyyy-mm-dd", "dd/mm/yyyy", com ou
// sem horário). Retorna um Date válido ou null. NÃO aplica o range — só parseia.
export function parseSimuladoDate(raw) {
  if (!raw) return null;
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw;
  const s = String(raw).trim().split(' ')[0].split('T')[0];
  let y, m, d;
  if (s.includes('/')) {
    const p = s.split('/');
    if (p.length !== 3) return null;
    [d, m, y] = p.map(n => parseInt(n, 10));
  } else if (s.includes('-')) {
    const p = s.split('-');
    if (p.length !== 3) return null;
    [y, m, d] = p.map(n => parseInt(n, 10));
  } else {
    return null;
  }
  if (!y || !m || !d) return null;
  const dt = new Date(y, m - 1, d);
  // round-trip rejeita datas impossíveis (ex: 31/02)
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

// Valida parse + range [2000-01-01, hoje].
export function isSimuladoDateValid(raw) {
  const dt = parseSimuladoDate(raw);
  if (!dt) return false;
  const min = new Date(SIMULADO_ANO_MIN, 0, 1);
  const max = new Date();
  max.setHours(23, 59, 59, 999);
  return dt >= min && dt <= max;
}

// Texto formatado dd/mm/yyyy se válida, senão "Data inválida".
export function formatSimuladoDate(raw) {
  if (!isSimuladoDateValid(raw)) return 'Data inválida';
  const dt = parseSimuladoDate(raw);
  const dd = String(dt.getDate()).padStart(2, '0');
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${dt.getFullYear()}`;
}

// Monta a série do gráfico "Histórico de Provas" a partir da lista de simulados:
// só concluídos do modelo, com data válida, ordenados cronologicamente (asc).
export function histSimulado(lista, modelo) {
  const sims = (lista || [])
    .filter(s => (s.modelo || 'ENEM') === modelo && s.status === 'Concluída' && isSimuladoDateValid(s.data))
    .sort((a, b) => parseSimuladoDate(a.data) - parseSimuladoDate(b.data));
  const labels = sims.map(s => formatSimuladoDate(s.data));
  if (modelo === 'Custom') {
    return { labels, aprov: sims.map(s => s.aproveitamento || 0) };
  }
  return {
    labels,
    lg: sims.map(s => s.lg || 0),
    ch: sims.map(s => s.ch || 0),
    cn: sims.map(s => s.cn || 0),
    mat: sims.map(s => s.mat || 0),
  };
}
