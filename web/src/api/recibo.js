import { salvarArquivo } from '../utils/arquivo.js';
import { api } from './index.js';

/** RF15 — baixa o recibo em PDF de uma mensalidade paga, com o nome de arquivo que a API sugere. */
export async function baixarRecibo(mensalidade) {
  const { conteudo, arquivo } = await api.baixar(`/mensalidades/${mensalidade.id}/recibo`);
  salvarArquivo(conteudo, arquivo ?? `recibo-${mensalidade.mesReferencia}.pdf`);
}
