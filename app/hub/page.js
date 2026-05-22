'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';

const ITENS = [
  {
    key: 'whatsapp',
    titulo: 'Entrar na Comunidade',
    descricao: 'Conecte-se com os outros mentorados e receba os avisos oficiais da equipe.',
    href: 'https://chat.whatsapp.com/ECd4L67n1McJ89amBLU0be?mode=gi_t',
    externo: true,
    label: 'Acessar Grupo',
    icone: 'M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z',
  },
  {
    key: 'plataforma',
    titulo: 'Criar conta no App Intento',
    descricao: 'Crie seu acesso para registrar sessões de estudo e acompanhar seu progresso.',
    href: 'https://intento.ap1.com.br/',
    externo: true,
    label: 'Criar Conta',
    icone: 'M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z',
  },
  {
    key: 'appstore',
    titulo: 'Baixar o app na App Store',
    descricao: 'Instale o aplicativo Intento no seu iPhone para registrar suas sessões de estudo.',
    href: 'https://apps.apple.com/br/app/intento/id6670373645?l=en-GB',
    externo: true,
    label: 'Baixar',
    icone: 'M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3',
  },
  {
    key: 'onboarding',
    titulo: 'Questionário de Onboarding',
    descricao: 'Forneça seus dados e hábitos atuais para montarmos sua estratégia inicial.',
    href: '/onboarding',
    externo: false,
    label: 'Iniciar',
    labelConcluido: 'Revisitar',
    icone: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
  },
  {
    key: 'diagnostico',
    titulo: 'Diagnóstico Teórico',
    descricao: 'Mapeamento dos seus pontos fortes e fracos nas disciplinas do ENEM.',
    href: '/diagnostico',
    externo: false,
    label: 'Iniciar',
    labelConcluido: 'Revisitar',
    icone: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  },
];

// No Android não há app nativo — a etapa 'appstore' vira "usar como webapp"
// (abre o app web e adiciona à tela inicial). iOS/desktop seguem a App Store.
const APPSTORE_ANDROID = {
  titulo: 'Instalar o app (Android)',
  descricao: 'Não há app Android nativo: abra o Intento no navegador e adicione à tela inicial para usar como app.',
  href: 'https://intento.ap1.com.br/',
  label: 'Abrir',
  dica: 'No Chrome: toque em ⋮ → "Adicionar à tela inicial".',
};

export default function HubChecklist() {
  const [progresso, setProgresso] = useState({ whatsapp: false, plataforma: false, appstore: false, onboarding: false, diagnostico: false });
  const [carregado, setCarregado] = useState(false);
  const [isAndroid, setIsAndroid] = useState(false);

  const chaveChecklist = () => {
    const email = sessionStorage.getItem('emailLogado') || 'anonimo';
    return `intento_checklist_${email}`;
  };

  useEffect(() => {
    const salvo = localStorage.getItem(chaveChecklist());
    if (salvo) setProgresso(JSON.parse(salvo));
    setIsAndroid(/android/i.test(navigator.userAgent || ''));
    setCarregado(true);
  }, []);

  const marcarConcluido = (key) => {
    if (progresso[key]) return;
    const novo = { ...progresso, [key]: true };
    setProgresso(novo);
    localStorage.setItem(chaveChecklist(), JSON.stringify(novo));
  };

  // Cada item só é acessível se o anterior estiver completo
  const isDesbloqueado = (key) => {
    const ordem = ['whatsapp', 'plataforma', 'appstore', 'onboarding', 'diagnostico'];
    const idx = ordem.indexOf(key);
    if (idx === 0) return true;
    return progresso[ordem[idx - 1]];
  };

  const total        = ITENS.length;
  const concluidos   = ITENS.filter((it) => progresso[it.key]).length;
  const porcentagem  = (concluidos / total) * 100;
  const tudoConcluido = concluidos === total;

  if (!carregado) return null;

  return (
    <div className="min-h-screen bg-slate-50 font-sans">

      {/* ── Header compacto ────────────────────────────────────────────── */}
      <header className="bg-intento-blue border-b-2 border-intento-yellow px-4 py-6">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <Image src="/simbolo-branco.png" alt="Intento" width={32} height={32} className="shrink-0" />
            <div>
              <p className="text-white font-semibold text-base leading-tight">Bem-vindo à Intento</p>
              <p className="text-slate-400 text-xs font-medium mt-0.5">Complete os passos abaixo para liberar o seu painel.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-right hidden sm:block">
              <p className="text-intento-yellow font-bold text-lg leading-none">{Math.round(porcentagem)}%</p>
              <p className="text-slate-500 text-[10px] font-medium uppercase tracking-wider mt-0.5">{concluidos} de {total} etapas</p>
            </div>
            <div className="w-24 bg-white/10 h-1.5 rounded-full overflow-hidden hidden sm:block">
              <div className="bg-intento-yellow h-full transition-all duration-700" style={{ width: `${porcentagem}%` }} />
            </div>
          </div>
        </div>
        {/* Progress bar mobile */}
        <div className="max-w-3xl mx-auto mt-4 sm:hidden">
          <div className="flex justify-between text-xs mb-1.5">
            <span className="text-slate-400 font-medium">{concluidos} de {total} concluídas</span>
            <span className="text-intento-yellow font-bold">{Math.round(porcentagem)}%</span>
          </div>
          <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
            <div className="bg-intento-yellow h-full transition-all duration-700" style={{ width: `${porcentagem}%` }} />
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-3">

        {/* ── Banner de conclusão ───────────────────────────────────────── */}
        {tudoConcluido && (
          <div className="bg-white border border-emerald-200 rounded-xl p-6 shadow-sm flex items-start gap-4">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-intento-blue">Todas as etapas concluídas!</p>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                Seu mentor já recebeu suas informações e entrará em contato pelo WhatsApp assim que o acesso for liberado.
              </p>
            </div>
          </div>
        )}

        {/* ── Lista de itens ────────────────────────────────────────────── */}
        {ITENS.map((itemBase, idx) => {
          const item = (itemBase.key === 'appstore' && isAndroid)
            ? { ...itemBase, ...APPSTORE_ANDROID }
            : itemBase;
          const desbloqueado = isDesbloqueado(item.key);
          const concluido    = progresso[item.key];

          return (
            <div key={item.key}
              className={`bg-white rounded-xl border shadow-sm transition-all ${
                concluido
                  ? 'border-emerald-200'
                  : desbloqueado
                    ? 'border-slate-200 hover:border-intento-blue/25'
                    : 'border-slate-100 opacity-50'
              }`}
            >
              <div className="p-5 flex flex-col sm:flex-row sm:items-center gap-4">

                {/* Indicador de estado */}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                  concluido    ? 'bg-emerald-500'
                  : desbloqueado ? 'bg-intento-blue'
                  : 'bg-slate-100'
                }`}>
                  {concluido ? (
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : desbloqueado ? (
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={item.icone} />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                  )}
                </div>

                {/* Texto */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">{idx + 1}</span>
                    <h3 className={`text-sm font-semibold ${concluido ? 'text-slate-400' : desbloqueado ? 'text-intento-blue' : 'text-slate-300'}`}>
                      {item.titulo}
                    </h3>
                    {concluido && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Concluído</span>
                    )}
                  </div>
                  <p className={`text-xs leading-relaxed ${desbloqueado ? 'text-slate-400' : 'text-slate-300'}`}>{item.descricao}</p>
                  {item.dica && desbloqueado && (
                    <p className="text-xs text-slate-500 font-medium mt-1.5">{item.dica}</p>
                  )}
                  {!desbloqueado && (
                    <p className="text-xs text-amber-600 font-medium mt-1.5 flex items-center gap-1">
                      <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Complete a etapa anterior primeiro.
                    </p>
                  )}
                </div>

                {/* Botão de ação */}
                {!desbloqueado ? (
                  <span className="shrink-0 px-5 py-2 bg-slate-100 text-slate-300 font-semibold rounded-lg text-sm cursor-not-allowed select-none text-center">
                    Bloqueado
                  </span>
                ) : item.externo ? (
                  <a href={item.href} target="_blank" rel="noopener noreferrer"
                    onClick={() => marcarConcluido(item.key)}
                    className={`shrink-0 text-center px-5 py-2 font-semibold rounded-lg text-sm transition-all ${
                      concluido
                        ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        : 'bg-intento-blue text-white hover:bg-blue-900'
                    }`}>
                    {concluido ? 'Acessar novamente' : item.label}
                  </a>
                ) : (
                  <Link href={item.href}
                    className={`shrink-0 text-center px-5 py-2 font-semibold rounded-lg text-sm transition-all ${
                      concluido
                        ? 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        : 'bg-intento-yellow text-white hover:bg-yellow-500'
                    }`}>
                    {concluido ? (item.labelConcluido || item.label) : item.label}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </main>
    </div>
  );
}
