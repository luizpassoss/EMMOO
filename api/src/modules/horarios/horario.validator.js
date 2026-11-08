import { gerarGradeDeHorarios } from '../../domain/agenda.js';
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
    erros.push({ campo: 'horaInicio', mensagem: 'Informe o horário de início.' });
  }
  const duracaoMin = isVazio(input.duracaoMin) ? DURACAO_PADRAO_MIN : toNumber(input.duracaoMin);
  if (!Number.isInteger(duracaoMin) || duracaoMin < 15 || duracaoMin > 240) {
    erros.push({ campo: 'duracaoMin', mensagem: 'A duração da aula deve ficar entre 15 e 240 minutos.' });
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

/**
 * RF04 — grade de atendimento de uma vez: dias da semana, das `inicio` às `fim`, aulas de `duracaoMin` minutos.
 * Devolve também os horários que a grade gera (ao menos um, senão é erro).
 */
export function validarGrade(input = {}) {
  const erros = [];
  const dias = Array.isArray(input.dias) ? [...new Set(input.dias.map(toNumber))] : [];
  if (dias.length === 0 || dias.some((dia) => !Number.isInteger(dia) || dia < 0 || dia > 6)) {
    erros.push({ campo: 'dias', mensagem: 'Escolha ao menos um dia da semana.' });
  }
  if (!isHora(input.inicio)) erros.push({ campo: 'inicio', mensagem: 'Informe o horário de início do atendimento.' });
  if (!isHora(input.fim)) erros.push({ campo: 'fim', mensagem: 'Informe o horário de término do atendimento.' });
  else if (isHora(input.inicio) && input.fim <= input.inicio) {
    erros.push({ campo: 'fim', mensagem: 'O término precisa ser depois do início.' });
  }
  const duracaoMin = isVazio(input.duracaoMin) ? DURACAO_PADRAO_MIN : toNumber(input.duracaoMin);
  if (!Number.isInteger(duracaoMin) || duracaoMin < 15 || duracaoMin > 240) {
    erros.push({ campo: 'duracaoMin', mensagem: 'A duração da aula deve ficar entre 15 e 240 minutos.' });
  }
  if (erros.length > 0) return { erros, dados: null };

  const horarios = gerarGradeDeHorarios({ dias, inicio: input.inicio, fim: input.fim, duracaoMin });
  if (horarios.length === 0) {
    return { erros: [{ campo: 'fim', mensagem: `Entre o início e o término não cabe uma aula de ${duracaoMin} minutos.` }], dados: null };
  }
  return { erros, dados: { dias, inicio: input.inicio, fim: input.fim, duracaoMin, horarios } };
}
