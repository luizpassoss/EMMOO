import { CIDADE_MAXIMA, normalizarChavePix, RECEBEDOR_MAXIMO, textoPix, TIPOS_DE_CHAVE } from '../../domain/pix.js';
import { isNonEmptyString, isVazio } from '../../shared/validation.js';

const SEM_PIX = { pixTipo: null, pixChave: null, pixRecebedor: null, pixCidade: null };

/**
 * Dados da escola: o nome e o Pix para receber as mensalidades. Sem tipo de chave, o Pix é removido.
 * Nome do recebedor (padrão: o nome da escola) e cidade vão no código do Pix sem acentos e no tamanho do
 * padrão do Banco Central (25 e 15 letras): já são guardados assim, para a tela mostrar o que vai no código.
 */
export function validarDadosDaEscola(input = {}) {
  const erros = [];
  const nome = String(input.nome ?? '').trim().replace(/\s+/g, ' ');
  if (!isNonEmptyString(nome, 3) || nome.length > 120) {
    erros.push({ campo: 'nome', mensagem: 'Informe o nome da escola (de 3 a 120 caracteres).' });
  }
  const pix = input.pix ?? null;
  if (pix === null || isVazio(pix.tipo)) {
    return erros.length ? { erros, dados: null } : { erros, dados: { nome, ...SEM_PIX } };
  }
  if (!Object.hasOwn(TIPOS_DE_CHAVE, pix.tipo)) {
    erros.push({ campo: 'pix.tipo', mensagem: 'Escolha o tipo da chave Pix.' });
    return { erros, dados: null };
  }
  const chave = normalizarChavePix(pix.tipo, pix.chave);
  if (chave.erro) erros.push({ campo: 'pix.chave', mensagem: chave.erro });
  const recebedor = textoPix(isVazio(pix.recebedor) ? nome : pix.recebedor, RECEBEDOR_MAXIMO);
  if (recebedor.length < 2) {
    erros.push({ campo: 'pix.recebedor', mensagem: 'Informe o nome de quem recebe (aparece para quem paga).' });
  }
  const cidade = textoPix(pix.cidade, CIDADE_MAXIMA);
  if (cidade.length < 2) erros.push({ campo: 'pix.cidade', mensagem: 'Informe a cidade da escola.' });
  if (erros.length > 0) return { erros, dados: null };
  return { erros, dados: { nome, pixTipo: pix.tipo, pixChave: chave.chave, pixRecebedor: recebedor, pixCidade: cidade } };
}
