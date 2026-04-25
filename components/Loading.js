'use client';

export function Spinner({ size = 'md', className = '' }) {
  const dims = size === 'sm' ? 'h-4 w-4 border-2' : size === 'lg' ? 'h-12 w-12 border-[3px]' : 'h-8 w-8 border-2';
  return (
    <div className={`animate-spin rounded-full border-intento-blue/20 border-t-intento-blue ${dims} ${className}`} />
  );
}

export function LoadingScreen({ mensagem = 'Carregando...' }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center font-sans">
      <Spinner size="lg" />
      <p className="text-intento-blue font-semibold text-sm mt-4 animate-pulse">{mensagem}</p>
    </div>
  );
}

export function LoadingInline({ mensagem = 'Carregando...', className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 ${className}`}>
      <Spinner />
      <p className="text-slate-400 font-medium text-xs mt-3 animate-pulse">{mensagem}</p>
    </div>
  );
}
