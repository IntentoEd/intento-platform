// Rótulo curto da semana p/ eixo X dos gráficos do painel.
// A fonte é a coluna SEMANA ("dd/mm/aaaa a dd/mm/aaaa"); aqui só formatamos.

export const MESES_ABBR = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// Extrai {dia,mes,ano} da data de início (aceita "dd/mm/aaaa" ou o range
// "dd/mm/aaaa a dd/mm/aaaa"). Retorna null se não parsear.
function parseInicio(raw) {
  if (!raw) return null;
  const ini = String(raw).split(' a ')[0].trim();
  const p = ini.split('/');
  if (p.length !== 3) return null;
  const dia = parseInt(p[0], 10), mes = parseInt(p[1], 10), ano = parseInt(p[2], 10);
  if (!dia || !mes || !ano || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return { dia, mes, ano };
}

// Rótulo "{Mês} S{semana}" (ex.: "Abr S2").
// Critério da semana do mês = teto(dia_de_início / 7):
//   dias 1–7 = S1, 8–14 = S2, 15–21 = S3, 22–28 = S4, 29–31 = S5.
// Determinístico a partir do dia de início; não depende de calendário/locale.
export function formatSemanaLabel(dataInicio) {
  const d = parseInicio(dataInicio);
  if (!d) return String(dataInicio || '');
  const semana = Math.ceil(d.dia / 7);
  return `${MESES_ABBR[d.mes - 1]} S${semana}`;
}

// Ciclo do método a partir do mês: C1 jan–mar, C2 abr–jun, C3 jul–set, C4 out–dez.
export function cicloMetodo(mes) {
  return 'C' + Math.ceil(mes / 3);
}

// Linha extra do tooltip: "Ciclo C2 (abr–jun)". Vazio se não parsear.
export function cicloLabelFromRange(range) {
  const d = parseInicio(range);
  if (!d) return '';
  const c = cicloMetodo(d.mes);
  const faixa = { C1: 'jan–mar', C2: 'abr–jun', C3: 'jul–set', C4: 'out–dez' }[c] || '';
  return `Ciclo ${c} (${faixa})`;
}
