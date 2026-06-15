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

// ---- Validação de conteúdo do formulário (centralizada) ----

export const SIMULADO_TITULO_MIN = 3;   // mínimo de caracteres significativos no título
export const ENEM_AREA_MAX = 45;        // acertos máximos por área ENEM
export const ENEM_TOTAL = 180;          // total de questões ENEM

// ---- Escopo do simulado ENEM ----
// O ENEM real é aplicado em dois dias. A maioria dos simulados cobre só um dia:
//  - dia1: Linguagens + Humanas (+ Redação, que é prova do 1º dia)
//  - dia2: Natureza + Matemática
//  - completo: as 4 áreas (LEGADO — não é mais oferecido no registro, mas
//    simulados antigos foram gravados assim e seguem sendo agregados).
// O `escopo` é a fonte única de verdade sobre QUAIS áreas contam num simulado;
// área fora do escopo é "não fez" (≠ de "fez e zerou"), então não entra em
// nenhuma média nem na autópsia de erros.
// IMPORTANTE: espelhado no backend em gas/Code.gs (handleSalvarSimulado / lerSimulados).
export const ENEM_ESCOPO_DEFAULT = 'dia1';
const ENEM_AREAS_POR_ESCOPO = {
  dia1: ['lg', 'ch'],
  dia2: ['cn', 'mat'],
  completo: ['lg', 'ch', 'cn', 'mat'],
};

// Áreas objetivas (chaves lg/ch/cn/mat) presentes num escopo. Escopo
// desconhecido/ausente cai em 'completo' (compat com dados legados).
export function areasDoEscopo(escopo) {
  return ENEM_AREAS_POR_ESCOPO[escopo] || ENEM_AREAS_POR_ESCOPO.completo;
}

// Escopo efetivo de um simulado (default 'completo' p/ registros antigos sem o campo).
export function escopoDoSimulado(sim) {
  return (sim && sim.escopo) || 'completo';
}

// Redação só é prova do 1º dia (e do completo legado). No 2º dia não há redação.
export function escopoTemRedacao(escopo) {
  return escopo !== 'dia2';
}

// Título válido: após trim, ao menos SIMULADO_TITULO_MIN caracteres
// significativos (letras/números). Bloqueia 1 letra, só espaços, só símbolos.
export function tituloSimuladoValido(raw) {
  const s = String(raw || '').trim();
  if (s.length < SIMULADO_TITULO_MIN) return false;
  const signif = (s.match(/[A-Za-zÀ-ÖØ-öø-ÿ0-9]/g) || []).length;
  return signif >= SIMULADO_TITULO_MIN;
}

// Acertos por área ENEM: inteiro em [0, ENEM_AREA_MAX].
export function acertosAreaValido(v) {
  const n = parseInt(v, 10);
  return !isNaN(n) && n >= 0 && n <= ENEM_AREA_MAX && String(v).trim() !== '';
}

// Matéria Custom: questões >= 1 e acertos inteiro em [0, questões].
export function materiaCustomValida(m) {
  const q = parseInt(m && m.questoes, 10);
  const a = parseInt(m && m.acertos, 10);
  return !isNaN(q) && q >= 1 && !isNaN(a) && a >= 0 && a <= q;
}

// Métricas agregadas por modelo, a partir da lista de simulados.
// Critérios (consistentes entre TODAS as métricas):
//  - considera só concluídos do modelo com DATA VÁLIDA;
//  - "últimos 3" = os 3 mais recentes por DATA REAL (não ordem de inserção);
//  - arredondamento = Math.round (inteiro mais próximo) em todas as médias.
export function metricasSimulado(lista, modelo) {
  const sims = (lista || [])
    .filter(s => (s.modelo || 'ENEM') === modelo && s.status === 'Concluída' && isSimuladoDateValid(s.data))
    .sort((a, b) => parseSimuladoDate(a.data) - parseSimuladoDate(b.data)); // asc
  const ult3 = sims.slice(-3); // 3 mais recentes por data
  const n = ult3.length || 1;

  // Tipos de erro: contagens por simulado (s.erros existe nos dois formatos)
  let lac = 0, rec = 0, inter = 0, at = 0;
  ult3.forEach(s => {
    const er = s.erros || {};
    lac += er.lac || 0; rec += er.rec || 0; inter += er.inter || 0; at += er.atencao || 0;
  });
  const erros = { lac: Math.round(lac / n), rec: Math.round(rec / n), inter: Math.round(inter / n), atencao: Math.round(at / n) };

  const comRed = sims.filter(s => s.redacao > 0).slice(-3);
  const medRedacao = comRed.length ? Math.round(comRed.reduce((a, s) => a + s.redacao, 0) / comRed.length) : 0;
  const base = { realizados: sims.length, erros, medRedacao };

  if (modelo === 'Custom') {
    const aprovMedio = ult3.length ? Math.round(ult3.reduce((a, s) => a + (s.aproveitamento || 0), 0) / ult3.length) : 0;
    const mapM = {};
    sims.forEach(s => (s.materias || []).forEach(m => {
      const q = parseInt(m.questoes) || 0, ac = parseInt(m.acertos) || 0;
      if (q <= 0) return;
      if (!mapM[m.materia]) mapM[m.materia] = { soma: 0, n: 0 };
      mapM[m.materia].soma += (ac / q) * 100; mapM[m.materia].n++;
    }));
    const porMateria = Object.keys(mapM).map(k => ({ nome: k, pct: Math.round(mapM[k].soma / mapM[k].n) })).sort((a, b) => b.pct - a.pct);
    return { ...base, aprovMedio, porMateria };
  }

  // Média por área: cada área é a média dos 3 simulados MAIS RECENTES que a
  // incluem (segundo o escopo). Assim simulados parciais (só 1º ou 2º dia) não
  // diluem áreas que não foram feitas. Área sem nenhum simulado → null (UI "—").
  const medArea = (key) => {
    const comArea = sims.filter(s => areasDoEscopo(escopoDoSimulado(s)).includes(key)).slice(-3);
    if (!comArea.length) return null;
    return Math.round(comArea.reduce((a, s) => a + (s[key] || 0), 0) / comArea.length);
  };
  return { ...base, medLG: medArea('lg'), medCH: medArea('ch'), medCN: medArea('cn'), medMAT: medArea('mat') };
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
  // Área fora do escopo do simulado vira null → o gráfico mostra um gap em vez
  // de plotar 0 (que pareceria "zerou a área" quando na verdade não a fez).
  const val = (s, key) => areasDoEscopo(escopoDoSimulado(s)).includes(key) ? (s[key] || 0) : null;
  return {
    labels,
    lg: sims.map(s => val(s, 'lg')),
    ch: sims.map(s => val(s, 'ch')),
    cn: sims.map(s => val(s, 'cn')),
    mat: sims.map(s => val(s, 'mat')),
  };
}
