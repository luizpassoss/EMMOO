/**
 * Entrega ao navegador um arquivo recebido da API (ex.: o PDF do recibo) como download, com o nome dado.
 * O endereço temporário é liberado logo depois — o navegador já começou a baixar.
 */
export function salvarArquivo(conteudo, nome) {
  const url = URL.createObjectURL(conteudo);
  const link = document.createElement('a');
  link.href = url;
  link.download = nome;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
