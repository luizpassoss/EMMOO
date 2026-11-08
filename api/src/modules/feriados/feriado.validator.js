import { diferencaEmDias, isDataISO } from '../../shared/datas.js';
import { isNonEmptyString, isVazio } from '../../shared/validation.js';

export const DURACAO_MAXIMA_DIAS = 120; // cobre as férias de verão; mais que isso é engano de digitação

/** Feriado (um dia: `fim` em branco) ou recesso (de `inicio` a `fim`, inclusive). */
export function validarFeriado(input = {}) {
  const erros = [];
  const descricao = String(input.descricao ?? '').trim();
  if (!isNonEmptyString(descricao, 2) || descricao.length > 80) {
    erros.push({ campo: 'descricao', mensagem: 'Informe o nome (de 2 a 80 caracteres), por exemplo: Carnaval.' });
  }
  const inicio = input.inicio;
  const fim = isVazio(input.fim) ? inicio : input.fim;
  if (!isDataISO(inicio)) erros.push({ campo: 'inicio', mensagem: 'Informe a data de início.' });
  if (!isDataISO(fim)) {
    erros.push({ campo: 'fim', mensagem: 'Informe uma data final válida.' });
  } else if (isDataISO(inicio)) {
    const dias = diferencaEmDias(inicio, fim);
    if (dias < 0) erros.push({ campo: 'fim', mensagem: 'A data final deve ser igual ou posterior à inicial.' });
    else if (dias >= DURACAO_MAXIMA_DIAS) {
      erros.push({ campo: 'fim', mensagem: `Um recesso pode ter no máximo ${DURACAO_MAXIMA_DIAS} dias.` });
    }
  }
  if (erros.length > 0) return { erros, dados: null };
  return { erros, dados: { descricao, inicio, fim } };
}
