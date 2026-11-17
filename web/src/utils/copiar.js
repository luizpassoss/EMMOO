/**
 * Copia o texto: pela área de transferência do navegador e, se ela não estiver disponível (página sem HTTPS,
 * permissão negada), selecionando o campo — a pessoa copia pelo menu do aparelho. Devolve se copiou.
 */
export async function copiarTexto(texto, campo) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    campo?.focus();
    campo?.select();
    return typeof document.execCommand === 'function' && document.execCommand('copy');
  }
}
