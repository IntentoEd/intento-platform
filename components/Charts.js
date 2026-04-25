'use client';

import dynamic from 'next/dynamic';

let registrado = false;
async function registrar() {
  if (registrado) return;
  const m = await import('chart.js');
  m.Chart.register(
    m.CategoryScale, m.LinearScale, m.PointElement, m.LineElement,
    m.BarElement, m.ArcElement, m.Title, m.Tooltip, m.Legend, m.Filler
  );
  m.Chart.defaults.font.family = 'inherit';
  m.Chart.defaults.plugins.legend.position = 'bottom';
  m.Chart.defaults.plugins.legend.labels.usePointStyle = true;
  registrado = true;
}

const placeholder = () => (
  <div className="w-full h-full flex items-center justify-center text-slate-300 text-xs animate-pulse">
    Carregando gráfico…
  </div>
);

export const Bar = dynamic(
  async () => { await registrar(); const m = await import('react-chartjs-2'); return m.Bar; },
  { ssr: false, loading: placeholder }
);
export const Line = dynamic(
  async () => { await registrar(); const m = await import('react-chartjs-2'); return m.Line; },
  { ssr: false, loading: placeholder }
);
export const Doughnut = dynamic(
  async () => { await registrar(); const m = await import('react-chartjs-2'); return m.Doughnut; },
  { ssr: false, loading: placeholder }
);
