/** Converte o erro da API em { campo: mensagem } para exibir junto aos campos do formulário. */
export function mapearErros(erro) {
  if (Array.isArray(erro?.details) && erro.details.length > 0) {
    return Object.fromEntries(erro.details.map((detalhe) => [detalhe.campo, detalhe.mensagem]));
  }
  return { geral: erro?.message || 'Não foi possível concluir a operação.' };
}
