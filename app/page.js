'use client';

import { apiFetch } from '@/lib/api';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { auth, googleProvider } from '@/lib/firebase';
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
} from 'firebase/auth';

export default function Home() {
  const router = useRouter();

  const [modoLogin, setModoLogin] = useState(true);
  const [modoRecuperacao, setModoRecuperacao] = useState(false);
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const inputClasse =
    'w-full p-3 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-intento-blue transition-all font-medium text-intento-blue text-sm';
  const labelClasse =
    'block text-xs font-semibold text-slate-400 uppercase mb-2 tracking-wider';

  const efetuarLoginComGoogle = async () => {
    setCarregando(true);
    setErro('');
    try {
      const resultado = await signInWithPopup(auth, googleProvider);
      await processarAcessoNoSistema(resultado.user.email, resultado.user.displayName || 'Novo Aluno');
    } catch {
      setErro('Falha ao abrir o login do Google.');
      setCarregando(false);
    }
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setCarregando(true);
    setErro('');
    try {
      let credencial;
      if (modoLogin) {
        credencial = await signInWithEmailAndPassword(auth, email, senha);
      } else {
        credencial = await createUserWithEmailAndPassword(auth, email, senha);
      }
      await processarAcessoNoSistema(credencial.user.email, email.split('@')[0]);
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') setErro('Este e-mail já está registrado. Faça login.');
      else if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') setErro('E-mail ou senha incorretos.');
      else if (e.code === 'auth/weak-password') setErro('A senha deve ter pelo menos 6 caracteres.');
      else setErro('Ocorreu um erro. Verifique seus dados e tente novamente.');
      setCarregando(false);
    }
  };

  const handleRecuperacao = async (e) => {
    e.preventDefault();
    setCarregando(true);
    setErro('');
    setSucesso('');
    try {
      await sendPasswordResetEmail(auth, email);
      setSucesso('E-mail de recuperação enviado. Verifique sua caixa de entrada.');
    } catch (e) {
      if (e.code === 'auth/user-not-found') setErro('Nenhuma conta encontrada com este e-mail.');
      else setErro('Erro ao enviar e-mail. Tente novamente.');
    } finally {
      setCarregando(false);
    }
  };

  const processarAcessoNoSistema = async (emailUsuario, nomeUsuario) => {
    try {
      const resBase = await apiFetch('/api/mentor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'loginGlobal', email: emailUsuario, nome: nomeUsuario }),
      });
      const dados = await resBase.json();
      if (dados.status === 'sucesso') {
        sessionStorage.setItem('emailLogado', emailUsuario.toLowerCase());
        router.push(dados.rota);
      } else {
        setErro(dados.mensagem);
        setCarregando(false);
      }
    } catch {
      setErro('Erro na rede. Verifique sua conexão.');
      setCarregando(false);
    }
  };

  const trocarModo = (novoModo) => {
    setModoLogin(novoModo);
    setModoRecuperacao(false);
    setErro('');
    setSucesso('');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex font-sans">

      {/* ── Coluna esquerda: proposta de valor ────────────────────────── */}
      <div className="hidden lg:flex lg:w-1/2 bg-intento-blue flex-col justify-between p-12 relative overflow-hidden">
        {/* Textura de fundo: grade de símbolos Intento com fade */}
        <div className="absolute inset-0">
          <Image
            src="/hero-login.svg"
            alt=""
            fill
            className="object-cover object-center"
            priority
          />
        </div>

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <Image src="/simbolo-branco.png" alt="Intento" width={36} height={36} className="shrink-0" />
          <span className="text-white font-bold text-xl tracking-tight">Intento</span>
        </div>

        {/* Conteúdo central */}
        <div className="relative space-y-8">
          <div>
            <h2 className="text-4xl font-bold text-white leading-tight mb-4">
              Da base sólida<br />
              <span className="text-intento-yellow">à aprovação.</span>
            </h2>
            <p className="text-slate-400 text-base leading-relaxed max-w-sm">
              Acompanhamento individual com método, dados e consistência — para quem quer resultado de verdade no ENEM.
            </p>
          </div>

          <div className="space-y-4">
            {[
              { icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', label: 'Painel personalizado com suas métricas semanais' },
              { icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', label: 'Diagnóstico de pontos fortes e áreas a desenvolver' },
              { icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', label: 'Mentor dedicado que conhece seu caso' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-intento-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d={item.icon} />
                  </svg>
                </div>
                <p className="text-slate-300 text-sm font-medium">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Rodapé */}
        <p className="relative text-slate-600 text-xs font-medium">metodointento.com.br</p>
      </div>

      {/* ── Coluna direita: formulário ─────────────────────────────────── */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-[400px]">

          {/* Header mobile */}
          <div className="lg:hidden text-center mb-8">
            <Image src="/simbolo-azul.png" alt="Intento" width={40} height={40} className="mx-auto mb-3 object-contain" />
            <h1 className="text-2xl font-bold text-intento-blue">Intento</h1>
            <p className="text-slate-400 text-sm font-medium mt-1">Plataforma de Mentoria</p>
          </div>

          {/* Header desktop */}
          <div className="hidden lg:block mb-8">
            <h1 className="text-2xl font-bold text-intento-blue">
              {modoRecuperacao ? 'Recuperar senha' : modoLogin ? 'Bem-vindo de volta' : 'Criar sua conta'}
            </h1>
            <p className="text-slate-400 text-sm font-medium mt-1">
              {modoRecuperacao
                ? 'Informe seu e-mail e enviaremos um link de redefinição.'
                : modoLogin
                ? 'Acesse seu painel de mentoria.'
                : 'Preencha os dados para começar.'}
            </p>
          </div>

          {/* Feedback */}
          {erro && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-medium border border-red-100 mb-5">
              {erro}
            </div>
          )}
          {sucesso && (
            <div className="bg-emerald-50 text-emerald-700 p-3 rounded-lg text-sm font-medium border border-emerald-100 mb-5">
              {sucesso}
            </div>
          )}

          {/* Formulário de recuperação */}
          {modoRecuperacao ? (
            <form onSubmit={handleRecuperacao} className="space-y-4">
              <div>
                <label className={labelClasse}>E-mail</label>
                <input type="email" placeholder="exemplo@email.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} disabled={carregando} required
                  className={inputClasse} />
              </div>
              <button type="submit" disabled={carregando}
                className="w-full py-3 bg-intento-blue text-white font-semibold rounded-lg hover:bg-blue-900 transition-all disabled:opacity-50 text-sm">
                {carregando ? 'Enviando...' : 'Enviar link de recuperação'}
              </button>
              <button type="button" onClick={() => { setModoRecuperacao(false); setErro(''); setSucesso(''); }}
                className="w-full text-sm font-medium text-slate-400 hover:text-intento-blue transition text-center py-1">
                ← Voltar ao login
              </button>
            </form>
          ) : (
            <>
              <form onSubmit={handleEmailAuth} className="space-y-4">
                <div>
                  <label className={labelClasse}>E-mail</label>
                  <input type="email" placeholder="exemplo@email.com" value={email}
                    onChange={(e) => setEmail(e.target.value)} disabled={carregando} required
                    className={inputClasse} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className={labelClasse + ' mb-0'}>Senha</label>
                    {modoLogin && (
                      <button type="button"
                        onClick={() => { setModoRecuperacao(true); setErro(''); setSucesso(''); }}
                        className="text-xs font-medium text-slate-400 hover:text-intento-blue transition">
                        Esqueci minha senha
                      </button>
                    )}
                  </div>
                  <input type="password" placeholder="••••••••" value={senha}
                    onChange={(e) => setSenha(e.target.value)} disabled={carregando} required
                    className={inputClasse} />
                </div>
                <button type="submit" disabled={carregando}
                  className="w-full py-3 mt-1 bg-intento-blue text-white font-semibold rounded-lg hover:bg-blue-900 transition-all disabled:opacity-50 text-sm">
                  {carregando ? 'Processando...' : modoLogin ? 'Entrar' : 'Criar Conta'}
                </button>
              </form>

              <div className="relative flex items-center py-5">
                <div className="flex-grow border-t border-slate-200" />
                <span className="flex-shrink-0 mx-4 text-slate-400 text-xs font-semibold uppercase tracking-wider">ou</span>
                <div className="flex-grow border-t border-slate-200" />
              </div>

              <button onClick={efetuarLoginComGoogle} disabled={carregando}
                className="w-full flex items-center justify-center gap-3 bg-white border border-slate-200 text-slate-600 py-2.5 rounded-lg font-medium hover:bg-slate-50 hover:border-slate-300 transition-all disabled:opacity-50 text-sm shadow-sm">
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Continuar com Google
              </button>

              <p className="mt-6 text-center text-sm font-medium text-slate-500">
                {modoLogin ? (
                  <>Não tem uma conta?{' '}
                    <button type="button" onClick={() => trocarModo(false)} className="text-intento-blue font-semibold hover:underline">
                      Registre-se
                    </button>
                  </>
                ) : (
                  <>Já tem uma conta?{' '}
                    <button type="button" onClick={() => trocarModo(true)} className="text-intento-blue font-semibold hover:underline">
                      Faça Login
                    </button>
                  </>
                )}
              </p>

              <p className="mt-6 text-center text-[10px] text-slate-400 leading-relaxed">
                Ao continuar, você concorda com os nossos{' '}
                <Link href="/termos" className="text-intento-blue underline">Termos de Uso</Link>{' '}
                e nossa{' '}
                <Link href="/privacidade" className="text-intento-blue underline">Política de Privacidade</Link>.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
