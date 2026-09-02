'use client';

// Tela cheia pro ex-aluno (DT_SAIDA preenchida na Planilha Mestre).
// Substitui o /painel e o pós-login com um encerramento acolhedor:
// o histórico continua guardado e a porta fica aberta pra retomar.
// URL do WhatsApp copiada do hub (ITENS, etapa whatsapp) de propósito —
// sem import pra não acoplar as duas telas.
const WHATSAPP_URL = 'https://chat.whatsapp.com/ECd4L67n1McJ89amBLU0be?mode=gi_t';

export default function MentoriaEncerrada({ dtSaida, onSair }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
        <div className="w-12 h-12 mx-auto mb-5 rounded-full bg-slate-100 flex items-center justify-center">
          <svg className="w-6 h-6 text-intento-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5"
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-intento-blue mb-3">
          Sua mentoria foi encerrada
        </h1>

        <p className="text-sm text-slate-600 leading-relaxed mb-6">
          {`Sua jornada com a gente foi encerrada${dtSaida ? ` em ${dtSaida}` : ''}. O que você construiu continua guardado — e a porta segue aberta: se quiser retomar a mentoria, é só chamar.`}
        </p>

        <a
          href={WHATSAPP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full bg-intento-blue hover:bg-blue-900 text-white font-semibold rounded-lg text-sm px-4 py-2.5 transition-all"
        >
          Falar com a Intento no WhatsApp
        </a>

        <button
          type="button"
          onClick={onSair}
          className="mt-4 text-sm font-medium text-slate-500 hover:text-intento-blue transition"
        >
          Entrar com outra conta
        </button>
      </div>
    </div>
  );
}
