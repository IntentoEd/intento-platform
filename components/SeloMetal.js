'use client';

// Identidade visual dos Selos da Jornada — FONTE ÚNICA do SVG do selo postal
// e dos gradientes de metal por tier. Consumido pela Jornada do aluno
// (components/painel/Jornada.js) e pelos exports do mentor (faixa "Selo da
// semana" no ig/painel e Retrato do Ciclo no ig/retrato).
//
// Anel de metal por tier (decisão 02/09/2026): bronze → prata → ouro →
// platina, por posição absoluta do degrau. Gradiente pra ler "metálico" —
// prata em tom chapado se confundiria com o slate da próxima estampa.
// A metáfora continua selo postal (navy, serrilha, rótulo poético).
export const METAL_ANEL = {
  bronze: ['#C9873E', '#8A5119'],
  prata: ['#C9D2DB', '#8593A3'],
  ouro: ['#E7C93F', '#A8821A'],
  platina: ['#9BD8E4', '#5E8CA0'],
  diamante: ['#C4B5FD', '#7C6AC8'],
};
export const METAL_DOT = { bronze: '#A5682A', prata: '#9AA7B4', ouro: '#C6A32B', platina: '#7FB5C6' };

// Gradientes compartilhados pelos SVGs dos selos (ids globais no documento —
// definir UMA vez evita id duplicado por selo). Uso: telas com VÁRIOS selos
// (Jornada). Nos cards exportados via html2canvas, preferir SeloSvg com
// `comDefs` — defs com id global FORA do nó capturado não entram no PNG.
export function MetalDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {Object.entries(METAL_ANEL).map(([m, [claro, escuro]]) => (
          <linearGradient key={m} id={`anel-metal-${m}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={claro} />
            <stop offset="100%" stopColor={escuro} />
          </linearGradient>
        ))}
      </defs>
    </svg>
  );
}

// SVG puro do selo postal (sem wrapper nem legendas): círculo navy com anel
// serrilhado na cor do metal do tier; tier em romano no centro.
// - `naoVisto`: anel no amarelo da marca (só a Jornada usa — no PNG exportado
//   não existe "não visto"; o metal comunica o nível permanente).
// - `comDefs`: embute o gradiente do próprio metal DENTRO deste svg — obriga-
//   tório nos cards capturados pelo html2canvas (defs fora do card somem).
export function SeloSvg({ tierRomano, tierMetal, naoVisto, comDefs, className, width, height, ariaLabel }) {
  const anel = naoVisto ? '#D4B726' : (tierMetal ? `url(#anel-metal-${tierMetal})` : '#060242');
  const par = tierMetal ? METAL_ANEL[tierMetal] : null;
  return (
    <svg viewBox="0 0 80 80" className={className} width={width} height={height} role="img" aria-label={ariaLabel}>
      {comDefs && par && (
        <defs>
          <linearGradient id={`anel-metal-${tierMetal}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={par[0]} />
            <stop offset="100%" stopColor={par[1]} />
          </linearGradient>
        </defs>
      )}
      <circle cx="40" cy="40" r="37" fill="none" stroke={anel} strokeWidth="2.5" strokeDasharray="4 3" />
      <circle cx="40" cy="40" r="30" fill="#060242" />
      <text x="40" y="38" textAnchor="middle" fill="#fff" fontSize="17" fontWeight="700" fontFamily="Ubuntu, sans-serif">{tierRomano}</text>
      <text x="40" y="52" textAnchor="middle" fill="#D4B726" fontSize="8" fontWeight="700" fontFamily="Ubuntu, sans-serif" letterSpacing="0.5">SELO</text>
    </svg>
  );
}
