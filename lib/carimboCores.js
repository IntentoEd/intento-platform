// Fonte única de cores dos carimbos do Método Intento (Aprendiz/Veterano/Mestre).
// Reusado por CarimboBadge, BarraCarimbo, DistribDim e CarimboDimensional.
// Hexes da marca — não trocar por classes Tailwind genéricas (amber/blue/emerald),
// que era o estado antigo. `solido` = preenchimento/segmento; `bg`+`texto` = pílula.
export const CARIMBO_CORES = {
  aprendiz: { solido: '#F5D83B', bg: '#FAEEDA', texto: '#854F0B' },
  veterano: { solido: '#1307CF', bg: '#E6ECFB', texto: '#0C2C7C' },
  mestre:   { solido: '#2FA838', bg: '#E7F3DE', texto: '#27500A' },
  // null/ausente (ex.: Simulado inativo) — cinza neutro, SEM cor de marca.
  ausente:  { solido: '#CBD5E1', bg: '#F1F5F9', texto: '#94A3B8' },
};

export const CARIMBO_LABEL = { aprendiz: 'Aprendiz', veterano: 'Veterano', mestre: 'Mestre' };

// Resolve o carimbo (string) para o objeto de cores; null/desconhecido → ausente.
export const corDe = (nivel) => CARIMBO_CORES[nivel] || CARIMBO_CORES.ausente;
