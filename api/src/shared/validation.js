import { diferencaEmDias, isDataISO } from './datas.js';
import { ValidationError } from './errors.js';

/** Campo opcional não informado (ausente, nulo ou texto vazio de formulário). */
export function isVazio(value) {
  return value === undefined || value === null || value === '';
}

/** Verifica se o valor é texto com pelo menos `min` caracteres úteis. */
export function isNonEmptyString(value, min = 1) {
  return typeof value === 'string' && value.trim().length >= min;
}

/** Converte número ou texto numérico; qualquer outro tipo vira NaN. */
export function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
}

/** Converte o parâmetro de rota em id inteiro positivo ou lança ValidationError. */
export function parseId(value) {
  const id = toNumber(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError([{ campo: 'id', mensagem: 'Identificador inválido.' }]);
  }
  return id;
}

/** Id opcional (ex.: filtro de query string): undefined quando vazio, senão inteiro positivo. */
export function parseIdOpcional(value, campo) {
  if (isVazio(value)) return undefined;
  const id = toNumber(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ValidationError([{ campo, mensagem: 'Identificador inválido.' }]);
  }
  return id;
}

/** Lança ValidationError quando a lista de erros não está vazia. */
export function assertValid(erros) {
  if (erros.length > 0) throw new ValidationError(erros);
}

/** Valida um período de datas "AAAA-MM-DD" (inclusive) com tamanho máximo, ou lança ValidationError. */
export function validarPeriodo({ inicio, fim } = {}, maxDias) {
  const erros = [];
  if (!isDataISO(inicio)) erros.push({ campo: 'inicio', mensagem: 'Informe uma data inicial válida.' });
  if (!isDataISO(fim)) erros.push({ campo: 'fim', mensagem: 'Informe uma data final válida.' });
  if (erros.length === 0) {
    const dias = diferencaEmDias(inicio, fim);
    if (dias < 0) erros.push({ campo: 'fim', mensagem: 'A data final deve ser igual ou posterior à inicial.' });
    else if (dias > maxDias) erros.push({ campo: 'fim', mensagem: `O período pode ter no máximo ${maxDias} dias.` });
  }
  assertValid(erros);
  return { inicio, fim };
}
