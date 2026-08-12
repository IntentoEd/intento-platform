// Salva o canvas gerado pelo html2canvas como arquivo PNG.
//
// No iPad/iPhone (Safari e Chrome usam o mesmo WebKit), âncora com atributo
// `download` + dataURL base64 gigante falha silenciosamente — o toque no botão
// não produz nada. Lá, o caminho confiável é a share sheet nativa
// (navigator.share com File), que oferece "Salvar Imagem" e WhatsApp direto.
// Nos demais browsers, âncora com blob URL (dataURL multi-MB também é lento e
// estoura memória em canvas grande).
//
// Retorna true se o arquivo saiu (download disparado ou share concluída) e
// false se o usuário cancelou a share sheet — quem chama usa isso pra decidir
// se registra a exportação.
export async function salvarPngDoCanvas(canvas, nomeArquivo) {
  const blob = await new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob retornou null'))), 'image/png');
    } catch (e) {
      reject(e);
    }
  });

  // iPadOS se apresenta como "Macintosh" (desktop-class browsing); Macs de
  // verdade não têm maxTouchPoints > 1.
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);

  if (isIOS && typeof navigator.share === 'function') {
    const file = new File([blob], nomeArquivo, { type: 'image/png' });
    if (!navigator.canShare || navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return true;
      } catch (e) {
        if (e?.name === 'AbortError') return false; // usuário fechou a share sheet
        // NotAllowedError (ativação do gesto expirou durante o render) e afins:
        // cai pro download por âncora abaixo.
      }
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.download = nomeArquivo;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
