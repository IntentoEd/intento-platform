'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'intento_install_dismissed_until';
const DISMISS_DAYS = 14; // 2 semanas até reaparecer após dispensar

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Já dispensou recentemente?
    try {
      const ate = parseInt(localStorage.getItem(STORAGE_KEY) || '0', 10);
      if (Date.now() < ate) return;
    } catch {}

    // App já instalado? (display: standalone)
    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches
      || window.navigator.standalone;
    if (isStandalone) return;

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisivel(true);
    };
    window.addEventListener('beforeinstallprompt', handler);

    // iOS não dispara beforeinstallprompt — vai precisar instruir manualmente.
    // Detecta iOS Safari fora de standalone pra mostrar instruções.
    const ua = window.navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) && !window.MSStream;
    const isSafari = isIOS && /Safari/.test(ua) && !/CriOS|FxiOS/.test(ua);
    if (isSafari) setVisivel(true);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dispensar = () => {
    try {
      localStorage.setItem(STORAGE_KEY, String(Date.now() + DISMISS_DAYS * 86400 * 1000));
    } catch {}
    setVisivel(false);
  };

  const instalar = async () => {
    if (!deferredPrompt) {
      // iOS — só instrução
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice.catch(() => {});
    setDeferredPrompt(null);
    setVisivel(false);
  };

  if (!visivel) return null;

  const isIOS = typeof window !== 'undefined' && /iPhone|iPad|iPod/.test(window.navigator.userAgent);

  return (
    <div
      className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-sm bg-white border border-slate-200 shadow-2xl rounded-xl p-4 z-40 animate-in slide-in-from-bottom-4 fade-in duration-300"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-intento-blue flex items-center justify-center">
          <img src="/icons/icon-192.png" alt="" className="w-full h-full" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-intento-blue">Instalar Intento</p>
          <p className="text-xs text-slate-500 mt-0.5 leading-snug">
            {isIOS
              ? <>No Safari, toque em <b>Compartilhar</b> e depois em <b>"Adicionar à Tela de Início"</b>.</>
              : <>Tenha o app na sua tela inicial — abre mais rápido e funciona offline.</>}
          </p>
        </div>
        <button
          onClick={dispensar}
          aria-label="Dispensar"
          className="text-slate-300 hover:text-slate-500 shrink-0 -mt-1 -mr-1 p-1 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      {!isIOS && (
        <div className="flex justify-end gap-2 mt-3">
          <button
            onClick={dispensar}
            className="text-xs font-semibold text-slate-400 hover:text-slate-600 px-2 py-1.5 transition"
          >
            Agora não
          </button>
          <button
            onClick={instalar}
            className="text-xs font-semibold bg-intento-blue text-white hover:bg-blue-900 px-3 py-1.5 rounded-lg transition"
          >
            Instalar
          </button>
        </div>
      )}
    </div>
  );
}
