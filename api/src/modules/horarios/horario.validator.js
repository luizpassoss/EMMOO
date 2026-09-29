import { isHora } from '../../shared/datas.js';
import { isVazio, toNumber } from '../../shared/validation.js';
import { DURACAO_PADRAO_MIN } from '../planos/plano.validator.js';

export const NOMES_DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

/** Valida um horário disponível do professor (RF04) e devolve os dados normalizados. */
export function validarHorario(input = {}) {
  const erros = [];
  const diaSemana = toNumber(input.diaSemana);
  if (!Number.isInteger(diaSemana) || diaSemana < 0 || diaSemana > 6) {
    erros.push({ campo: 'diaSemana', mensagem: 'Selecione um dia da semana válido.' });
  }
  if (!isHora(input.horaInicio)) {
    erros.push({ campo: 'horaInicio', mensagem: 'Informe a hora no formato HH:MM.' });
  }
  const duracaoMin = isVazio(input.duracaoMin) ? DURACAO_PADRAO_MIN : toNumber(input.duracaoMin);
  if (!Number.isInteger(duracaoMin) || duracaoMin < 15 || duracaoMin > 240) {
    erros.push({ campo: 'duracaoMin', mensagem: 'A duração deve ser um inteiro entre 15 e 240 minutos.' });
  }
  let professorId;
  if (!isVazio(input.professorId)) {
    professorId = toNumber(input.professorId);
    if (!Number.isInteger(professorId) || professorId <= 0) {
      erros.push({ campo: 'professorId', mensagem: 'Professor inválido.' });
    }
  }

  if (erros.length > 0) return { erros, dados: null };
  return { erros, dados: { diaSemana, horaInicio: input.horaInicio, duracaoMin, professorId } };
}
