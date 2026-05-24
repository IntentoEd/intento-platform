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

const FAIXA_CICLO = { C1: 'jan–mar', C2: 'abr–jun', C3: 'jul–set', C4: 'out–dez' };

// Linha do tooltip a partir do mês: "Ciclo C2 (abr–jun)".
export function cicloLabelFromMes(mes) {
  const c = cicloMetodo(mes);
  return `Ciclo ${c} (${FAIXA_CICLO[c] || ''})`;
}

// Idem, a partir de um range/início "dd/mm/aaaa...". Vazio se não parsear.
export function cicloLabelFromRange(range) {
  const d = parseInicio(range);
  return d ? cicloLabelFromMes(d.mes) : '';
}

export const MESES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Rótulo curto do mês: "Abr/26".
export function formatMesLabel(mes, ano) {
  return `${MESES_ABBR[mes - 1]}/${String(ano).slice(-2)}`;
}

// Agrega os registros semanais (estrutura `mensal` do painel) em meses.
// Mês de cada semana = mês do ÚLTIMO dia da semana (fim do range).
// Critérios de agregação:
//   - horas, meta: SOMA do mês (fluxo);
//   - domTot, progTot: ÚLTIMO valor do mês (estado cumulativo de fim de mês);
//   - estresse, ansiedade, motivacao, sono: MÉDIA do mês (humor).
// Retorna a mesma forma de `mensal` + labels curtos, nomes completos e ciclos
// (estes dois últimos p/ o tooltip). Não altera os dados de origem.
export function agregarMensalPorMes(mensal) {
  const m = mensal || {};
  const labels = m.labels || [];
  const out = {
    labels: [], nomesCompletos: [], ciclos: [],
    meta: [], horas: [], domTot: [], progTot: [],
    estresse: [], ansiedade: [], motivacao: [], sono: [],
  };
  const grupos = {};
  const ordem = [];
  labels.forEach((lab, i) => {
    const partes = String(lab).split(' a ');
    const fim = (partes[1] || partes[0] || '').trim();
    const p = fim.split('/');
    if (p.length !== 3) return;
    const mes = parseInt(p[1], 10), ano = parseInt(p[2], 10);
    if (!mes || !ano || mes < 1 || mes > 12) return;
    const chave = `${ano}-${String(mes).padStart(2, '0')}`;
    if (!grupos[chave]) { grupos[chave] = []; ordem.push({ chave, mes, ano }); }
    grupos[chave].push(i);
  });
  ordem.sort((a, b) => a.chave.localeCompare(b.chave));

  const num = v => parseFloat(v) || 0;
  const soma1 = (arr, idxs) => Math.round(idxs.reduce((s, i) => s + num((arr || [])[i]), 0) * 10) / 10;
  const media = (arr, idxs) => idxs.length ? Math.round(idxs.reduce((s, i) => s + num((arr || [])[i]), 0) / idxs.length) : 0;
  const ultimo = (arr, idxs) => idxs.length ? num((arr || [])[idxs[idxs.length - 1]]) : 0;

  ordem.forEach(({ mes, ano, chave }) => {
    const idxs = grupos[chave];
    out.labels.push(formatMesLabel(mes, ano));
    out.nomesCompletos.push(`${MESES_FULL[mes - 1]}/${ano}`);
    out.ciclos.push(cicloLabelFromMes(mes));
    out.meta.push(soma1(m.meta, idxs));
    out.horas.push(soma1(m.horas, idxs));
    out.domTot.push(ultimo(m.domTot, idxs));
    out.progTot.push(ultimo(m.progTot, idxs));
    out.estresse.push(media(m.estresse, idxs));
    out.ansiedade.push(media(m.ansiedade, idxs));
    out.motivacao.push(media(m.motivacao, idxs));
    out.sono.push(media(m.sono, idxs));
  });
  return out;
}
