'use client';

import { useEffect, useState } from 'react';

// Converte chave VAPID em base64url pra Uint8Array (formato exigido pelo browser)
function urlB64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function PushToggle({ email }) {
  const [estado, setEstado] = useState('checking'); // checking | unsupported | denied | inactive | active | working
  const [mensagem, setMensagem] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setEstado('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setEstado('denied');
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setEstado(sub ? 'active' : 'inactive'))
      .catch(() => setEstado('inactive'));
  }, []);

  const ativar = async () => {
    if (!email) { setMensagem('Email do usuário ausente'); return; }
    setEstado('working');
    setMensagem('');
    try {
      const reg = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setEstado(permission === 'denied' ? 'denied' : 'inactive');
        return;
      }
      const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublic) throw new Error('VAPID public key não configurada');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(vapidPublic),
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          subscription: sub.toJSON(),
          userAgent: navigator.userAgent,
        }),
      });
      const data = await res.json();
      if (data.status !== 'sucesso') throw new Error(data.mensagem || 'falha ao registrar');
      setEstado('active');
      setMensagem('Notificações ativas neste dispositivo');
      setTimeout(() => setMensagem(''), 4000);
    } catch (e) {
      setEstado('inactive');
      setMensagem('Erro: ' + e.message);
    }
  };

  const desativar = async () => {
    setEstado('working');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/unsubscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setEstado('inactive');
      setMensagem('Notificações desativadas');
      setTimeout(() => setMensagem(''), 4000);
    } catch (e) {
      setEstado('active');
      setMensagem('Erro: ' + e.message);
    }
  };

  if (estado === 'checking' || estado === 'unsupported') return null;

  if (estado === 'denied') {
    return (
      <button
        disabled
        title="Permissão bloqueada — habilite nas configurações do navegador"
        className="text-[11px] font-semibold text-slate-300 px-3 py-1.5 rounded-lg border border-slate-200 cursor-not-allowed"
      >
        🔕 Notificações bloqueadas
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={estado === 'active' ? desativar : ativar}
        disabled={estado === 'working'}
        className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition disabled:opacity-50 ${
          estado === 'active'
            ? 'text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100'
            : 'text-intento-blue bg-white border border-intento-blue/30 hover:bg-intento-blue/5'
        }`}
      >
        {estado === 'working' ? '...'
          : estado === 'active' ? '🔔 Notificações ativas'
          : '🔔 Ativar notificações'}
      </button>
      {mensagem && <p className="text-[10px] text-slate-400 font-medium">{mensagem}</p>}
    </div>
  );
}
