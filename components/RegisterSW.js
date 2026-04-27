'use client';

import { useEffect, useState } from 'react';

export default function RegisterSW() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (process.env.NODE_ENV !== 'production') return;

    let mounted = true;

    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => {
          // Força check de update sempre que a aba volta a ficar visível
          const checkUpdate = () => reg.update().catch(() => {});
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') checkUpdate();
          });

          // Quando SW novo é detectado e instalado mas o controller atual ainda é o velho,
          // mostra banner pedindo reload
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller && mounted) {
                setUpdateReady(true);
              }
            });
          });

          // Caso a página tenha aberto com SW novo já em waiting (refresh durante deploy)
          if (reg.waiting && navigator.serviceWorker.controller && mounted) {
            setUpdateReady(true);
          }
        })
        .catch((err) => console.warn('SW register failed:', err));
    };

    window.addEventListener('load', onLoad);
    return () => { mounted = false; window.removeEventListener('load', onLoad); };
  }, []);

  if (!updateReady) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 right-4 left-4 sm:left-auto sm:max-w-sm bg-intento-blue text-white shadow-2xl rounded-xl p-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300"
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-intento-yellow/20 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 text-intento-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">Nova versão disponível</p>
          <p className="text-xs text-white/70 mt-0.5">Recarregue a página pra usar a versão mais recente.</p>
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-3">
        <button
          onClick={() => setUpdateReady(false)}
          className="text-xs font-semibold text-white/70 hover:text-white px-2 py-1.5 transition"
        >
          Depois
        </button>
        <button
          onClick={() => window.location.reload()}
          className="text-xs font-semibold bg-intento-yellow text-intento-blue hover:bg-yellow-400 px-3 py-1.5 rounded-lg transition"
        >
          Recarregar
        </button>
      </div>
    </div>
  );
}
