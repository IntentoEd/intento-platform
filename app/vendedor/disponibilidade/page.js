'use client';

import { apiFetch } from '@/lib/api';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { LoadingScreen } from '@/components/Loading';

const DIAS = [
  { key: 'seg', label: 'Segunda' },
  { key: 'ter', label: 'Terça' },
  { key: 'qua', label: 'Quarta' },
  { key: 'qui', label: 'Quinta' },
  { key: 'sex', label: 'Sexta' },
  { key: 'sab', label: 'Sábado' },
  { key: 'dom', label: 'Domingo' },
];

const RX_INTERVALO = /^\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}\s*$/;

export default function DisponibilidadeVendedor() {
  const router = useRouter();
  const [emailUser, setEmailUser] = useState('');
  const [nomeVendedor, setNomeVendedor] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [aba, setAba] = useState('padrao');
  const [erroBoot, setErroBoot] = useState('');

  const [horarios, setHorarios] = useState({});
  const [salvandoP, setSalvandoP] = useState(false);
  const [feedbackP, setFeedbackP] = useState('');

  const [excecoes, setExcecoes] = useState([]);
  const [novaExc, setNovaExc] = useState({ dtInicio: '', dtFim: '', motivo: '' });
  const [salvandoE, setSalvandoE] = useState(false);
  const [feedbackE, setFeedbackE] = useState('');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      const email = u?.email?.toLowerCase();
      if (!email) { router.push('/'); return; }
      setEmailUser(email);
      await carregar(email);
    });
    return () => unsub();
  }, [router]);

  async function carregar(email) {
    setCarregando(true);
    setErroBoot('');
    try {
      const r = await apiFetch('/api/vendedor/disponibilidade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'ler', email }),
      });
      const data = await r.json();
      if (data.status !== 'sucesso') {
        setErroBoot(data.mensagem || 'Você não está cadastrado(a) como vendedor ativo.');
        return;
      }
      setNomeVendedor(data.nome || '');
      setHorarios(data.horariosPadrao || {});
      setExcecoes(data.excecoes || []);
    } catch (e) {
      setErroBoot(e.message);
    } finally {
      setCarregando(false);
    }
  }

  function addIntervalo(dia) {
    setHorarios((h) => ({ ...h, [dia]: [...(h[dia] || []), '09:00-12:00'] }));
  }
  function rmIntervalo(dia, idx) {
    setHorarios((h) => ({ ...h, [dia]: (h[dia] || []).filter((_, i) => i !== idx) }));
  }
  function setIntervalo(dia, idx, valor) {
    setHorarios((h) => ({ ...h, [dia]: (h[dia] || []).map((v, i) => (i === idx ? valor : v)) }));
  }

  async function salvarHorarios() {
    setFeedbackP('');
    // Valida formato
    for (const d of DIAS) {
      const arr = horarios[d.key] || [];
      for (const v of arr) {
        if (!RX_INTERVALO.test(v)) {
          setFeedbackP(`Formato inválido em ${d.label}: "${v}". Use HH:MM-HH:MM (ex: 09:00-12:00)`);
          return;
        }
      }
    }
    setSalvandoP(true);
    try {
      // Limpa: remove dias vazios
      const limpos = {};
      for (const d of DIAS) {
        if ((horarios[d.key] || []).length > 0) limpos[d.key] = horarios[d.key];
      }
      const r = await apiFetch('/api/vendedor/disponibilidade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'salvarHorarios', email: emailUser, horarios: limpos }),
      });
      const data = await r.json();
      setFeedbackP(data.status === 'sucesso' ? '✓ Salvo!' : 'Erro: ' + data.mensagem);
      if (data.status === 'sucesso') setTimeout(() => setFeedbackP(''), 3000);
    } catch (e) {
      setFeedbackP('Erro: ' + e.message);
    } finally {
      setSalvandoP(false);
    }
  }

  async function adicionarExcecao() {
    setFeedbackE('');
    if (!novaExc.dtInicio || !novaExc.dtFim) {
      setFeedbackE('Preencha início e fim');
      return;
    }
    if (new Date(novaExc.dtFim) <= new Date(novaExc.dtInicio)) {
      setFeedbackE('Fim deve ser depois do início');
      return;
    }
    setSalvandoE(true);
    try {
      const r = await apiFetch('/api/vendedor/disponibilidade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'criarExcecao',
          email: emailUser,
          tipo: 'bloqueio',
          dtInicio: new Date(novaExc.dtInicio).toISOString(),
          dtFim: new Date(novaExc.dtFim).toISOString(),
          motivo: novaExc.motivo,
        }),
      });
      const data = await r.json();
      if (data.status === 'sucesso') {
        setNovaExc({ dtInicio: '', dtFim: '', motivo: '' });
        setFeedbackE('✓ Bloqueio adicionado');
        await carregar(emailUser);
        setTimeout(() => setFeedbackE(''), 3000);
      } else {
        setFeedbackE('Erro: ' + data.mensagem);
      }
    } catch (e) {
      setFeedbackE('Erro: ' + e.message);
    } finally {
      setSalvandoE(false);
    }
  }

  async function removerExcecao(id) {
    if (!confirm('Remover este bloqueio?')) return;
    try {
      const r = await apiFetch('/api/vendedor/disponibilidade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'removerExcecao', email: emailUser, id }),
      });
      const data = await r.json();
      if (data.status === 'sucesso') {
        await carregar(emailUser);
      } else {
        alert('Erro: ' + data.mensagem);
      }
    } catch (e) {
      alert('Erro: ' + e.message);
    }
  }

  const sair = async () => { await signOut(auth); router.push('/'); };

  if (carregando) return <LoadingScreen mensagem="Carregando sua disponibilidade..." />;

  if (erroBoot) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
        <div className="max-w-md text-center">
          <p className="text-sm text-red-600 font-medium mb-3">{erroBoot}</p>
          <button onClick={sair} className="text-sm font-semibold text-intento-blue hover:underline">Sair</button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-intento-blue">Minha Disponibilidade</h1>
          <p className="text-[11px] text-slate-400 font-medium">{nomeVendedor || emailUser}</p>
        </div>
        <button onClick={sair} className="text-sm font-semibold text-slate-400 hover:text-red-500 transition">Sair</button>
      </header>

      <div className="max-w-3xl mx-auto p-4 lg:p-6 space-y-6">
        <div className="flex gap-2 border-b border-slate-200">
          <button
            onClick={() => setAba('padrao')}
            className={`px-4 py-2 text-sm font-semibold transition ${aba === 'padrao' ? 'text-intento-blue border-b-2 border-intento-blue' : 'text-slate-500 hover:text-intento-blue'}`}
          >
            Horário padrão semanal
          </button>
          <button
            onClick={() => setAba('excecoes')}
            className={`px-4 py-2 text-sm font-semibold transition ${aba === 'excecoes' ? 'text-intento-blue border-b-2 border-intento-blue' : 'text-slate-500 hover:text-intento-blue'}`}
          >
            Bloqueios pontuais
            {excecoes.length > 0 && <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">{excecoes.length}</span>}
          </button>
        </div>

        {aba === 'padrao' && (
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
            <div className="mb-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                Marque os horários que você atende reuniões em cada dia da semana. Use formato <code className="bg-slate-100 px-1 rounded">HH:MM-HH:MM</code> (ex: <code className="bg-slate-100 px-1 rounded">09:00-12:00</code>).
                Você pode adicionar vários intervalos no mesmo dia (ex: manhã + tarde).
              </p>
            </div>

            <div className="space-y-3">
              {DIAS.map((d) => {
                const intervalos = horarios[d.key] || [];
                return (
                  <div key={d.key} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-b-0">
                    <div className="w-24 pt-2 text-sm font-semibold text-slate-700 shrink-0">{d.label}</div>
                    <div className="flex-1 space-y-2">
                      {intervalos.length === 0 && (
                        <p className="text-xs text-slate-400 italic py-2">Sem disponibilidade</p>
                      )}
                      {intervalos.map((iv, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={iv}
                            onChange={(e) => setIntervalo(d.key, i, e.target.value)}
                            placeholder="09:00-12:00"
                            className="flex-1 max-w-[180px] px-3 py-1.5 text-sm border border-slate-200 rounded-md font-mono"
                          />
                          <button
                            onClick={() => rmIntervalo(d.key, i)}
                            className="text-xs font-semibold text-red-500 hover:text-red-700 px-2 py-1"
                            aria-label="Remover intervalo"
                          >
                            Remover
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => addIntervalo(d.key)}
                        className="text-xs font-semibold text-intento-blue hover:underline"
                      >
                        + Adicionar intervalo
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
              {feedbackP && <span className={`text-xs font-semibold ${feedbackP.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}`}>{feedbackP}</span>}
              <button
                onClick={salvarHorarios}
                disabled={salvandoP}
                className="ml-auto bg-intento-blue text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-900 transition disabled:opacity-50"
              >
                {salvandoP ? 'Salvando...' : 'Salvar horários'}
              </button>
            </div>
          </div>
        )}

        {aba === 'excecoes' && (
          <div className="space-y-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Adicionar bloqueio pontual</p>
              <p className="text-xs text-slate-500 mb-4">Pra férias, eventos, dia de folga ou qualquer hora que você não pode atender — mesmo que esteja dentro do horário padrão.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Início</label>
                  <input
                    type="datetime-local"
                    value={novaExc.dtInicio}
                    onChange={(e) => setNovaExc((x) => ({ ...x, dtInicio: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Fim</label>
                  <input
                    type="datetime-local"
                    value={novaExc.dtFim}
                    onChange={(e) => setNovaExc((x) => ({ ...x, dtFim: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                  />
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-xs font-semibold text-slate-500 mb-1">Motivo (opcional)</label>
                <input
                  type="text"
                  value={novaExc.motivo}
                  onChange={(e) => setNovaExc((x) => ({ ...x, motivo: e.target.value }))}
                  placeholder="Ex: Férias, dentista, viagem"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md"
                />
              </div>
              <div className="flex items-center justify-between">
                {feedbackE && <span className={`text-xs font-semibold ${feedbackE.startsWith('✓') ? 'text-emerald-600' : 'text-red-500'}`}>{feedbackE}</span>}
                <button
                  onClick={adicionarExcecao}
                  disabled={salvandoE}
                  className="ml-auto bg-intento-blue text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-900 transition disabled:opacity-50"
                >
                  {salvandoE ? 'Adicionando...' : 'Adicionar bloqueio'}
                </button>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Bloqueios cadastrados</p>
              {excecoes.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-6">Sem bloqueios cadastrados.</p>
              ) : (
                <div className="space-y-2">
                  {excecoes
                    .slice()
                    .sort((a, b) => a.dtInicio.localeCompare(b.dtInicio))
                    .map((e) => (
                      <div key={e.id} className="flex items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-slate-700">
                            {new Date(e.dtInicio).toLocaleString('pt-BR')} → {new Date(e.dtFim).toLocaleString('pt-BR')}
                          </div>
                          {e.motivo && <div className="text-xs text-slate-500 mt-0.5">{e.motivo}</div>}
                        </div>
                        <button
                          onClick={() => removerExcecao(e.id)}
                          className="text-xs font-semibold text-red-500 hover:text-red-700 shrink-0"
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
