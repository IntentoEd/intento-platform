'use client';

export default function Offline() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center gap-2 mb-8">
          <div className="w-1.5 h-7 bg-intento-yellow rounded-sm" />
          <span className="font-bold text-intento-blue text-xl tracking-wider">INTENTO</span>
        </div>

        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 5.636a9 9 0 010 12.728m-3.536-3.536a3 3 0 010-4.243m-7.071 7.071a9 9 0 010-12.728M9.879 9.879a3 3 0 014.242 0M3 3l18 18"/>
          </svg>
        </div>

        <h1 className="text-xl font-bold text-intento-blue mb-2">Sem conexão</h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-8">
          Não foi possível conectar ao servidor. Verifique sua internet e tente novamente.
        </p>

        <button
          onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}
          className="bg-intento-blue hover:bg-blue-900 text-white font-semibold px-6 py-3 rounded-lg transition text-sm"
        >
          Tentar novamente
        </button>

        <p className="text-[11px] text-slate-500 font-medium mt-8">
          Algumas páginas que você visitou recentemente continuam disponíveis em modo leitura.
        </p>
      </div>
    </div>
  );
}
