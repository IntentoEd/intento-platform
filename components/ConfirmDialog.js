'use client';

import { useEffect, useRef } from 'react';

// Modal de confirmação reutilizável. Substitui window.confirm() nativo:
// - bloqueia o scroll do body, fecha em ESC e em clique no backdrop
// - botão de ação tem foco automático e estilo (destrutivo: vermelho)
// - aceita `tom` 'danger' (default em deletes) ou 'primary'
//
// Uso:
//   <ConfirmDialog
//     aberto={confirmAberto}
//     titulo="Apagar lead?"
//     descricao="Essa ação não pode ser desfeita."
//     textoConfirmar="Apagar"
//     tom="danger"
//     onConfirmar={async () => { ... ; setConfirmAberto(false); }}
//     onCancelar={() => setConfirmAberto(false)}
//   />
export default function ConfirmDialog({
  aberto,
  titulo,
  descricao,
  textoConfirmar = 'Confirmar',
  textoCancelar = 'Cancelar',
  tom = 'danger',
  carregando = false,
  onConfirmar,
  onCancelar,
}) {
  const botaoConfirmarRef = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && !carregando) onCancelar?.();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    botaoConfirmarRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [aberto, carregando, onCancelar]);

  if (!aberto) return null;

  // Classes reais de Tailwind (as antigas btn-* não existiam no globals.css e
  // os botões renderizavam sem estilo nenhum).
  const btnConfirmar = tom === 'danger'
    ? 'bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-sm px-4 py-2 transition-all disabled:opacity-60'
    : 'bg-intento-blue hover:bg-blue-900 text-white font-semibold rounded-lg text-sm px-4 py-2 transition-all disabled:opacity-60';

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-titulo"
      onClick={() => !carregando && onCancelar?.()}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="confirm-titulo" className="text-base font-bold text-intento-blue">
          {titulo}
        </h2>
        {descricao && (
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">{descricao}</p>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            className="text-sm font-semibold text-slate-500 hover:text-intento-blue px-4 py-2 transition-colors disabled:opacity-60"
            disabled={carregando}
            onClick={onCancelar}
          >
            {textoCancelar}
          </button>
          <button
            ref={botaoConfirmarRef}
            type="button"
            className={btnConfirmar}
            disabled={carregando}
            data-loading={carregando}
            onClick={onConfirmar}
          >
            {carregando ? 'Processando…' : textoConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
