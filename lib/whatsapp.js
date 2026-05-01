// Gera URL de start chat do WhatsApp a partir de um telefone bruto.
// Aceita formatos comuns ("(11) 99999-9999", "+55 11 99999-9999", etc.)
// Adiciona "55" no início se vier sem código de país.
// Retorna null se o telefone for inválido / muito curto.
export function whatsappLink(telefone) {
  if (!telefone) return null;
  const digits = String(telefone).replace(/\D/g, '');
  if (!digits || digits.length < 10) return null;
  const comDDI = digits.startsWith('55') ? digits : '55' + digits;
  return `https://wa.me/${comDDI}`;
}
