// Verificação de Firebase ID token no server-side.
// Frontend envia o token via header Authorization: Bearer <token>.
// Aqui validamos com Firebase Admin SDK e retornamos { uid, email } ou null.

import admin from 'firebase-admin';

let inicializou = false;
let initFalhou = false;
let initErro = null;

function init() {
  if (inicializou || initFalhou) return;
  if (admin.apps.length > 0) {
    inicializou = true;
    return;
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (!projectId || !clientEmail || !privateKey) {
    initFalhou = true;
    initErro = 'FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY são obrigatórios';
    return;
  }
  // Vercel armazena \n como literal, precisa converter
  if (privateKey.includes('\\n')) privateKey = privateKey.replace(/\\n/g, '\n');
  try {
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    inicializou = true;
  } catch (e) {
    initFalhou = true;
    initErro = e.message;
  }
}

// Retorna { uid, email } se token válido. null se inválido/ausente.
// Loga internamente erros de verificação mas não vaza pro response.
export async function verificarUsuario(request) {
  init();
  if (!inicializou) {
    console.error('[auth] Firebase Admin não inicializado:', initErro);
    return null;
  }
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    return {
      uid: decoded.uid,
      email: (decoded.email || '').toLowerCase().trim(),
      emailVerificado: !!decoded.email_verified,
    };
  } catch (e) {
    console.warn('[auth] verifyIdToken falhou:', e.code || e.message);
    return null;
  }
}

// Retorna estado da inicialização. Útil pra debug.
export function statusAuth() {
  init();
  return { ok: inicializou, erro: initErro };
}
