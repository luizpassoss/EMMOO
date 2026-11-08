import { SEMANAS_MAXIMAS } from '../../domain/agenda.js';
import { isDataISO, isHora } from '../../shared/datas.js';
import { isVazio, toNumber } from '../../shared/validation.js';

function idObrigatorio(valor, campo, mensagem, erros) {
  const id = toNumber(valor);
  if (!Number.isInteger(id) || id <= 0) erros.push({ campo, mensagem });
  return id;
}

/**
 * Valida o agendamento de aula (RF05) e devolve os dados normalizados.
 * `duracaoMin` é opcional (null = usar a duração do plano do aluno); `semanas` repete a aula semanalmente.
 */
export function validarAgendamento(input = {}) {
  const erros = [];
  const alunoId = idObrigatorio(input.alunoId, 'alunoId', 'Selecione o aluno.', erros);
  const professorId = idObrigatorio(input.professorId, 'professorId', 'Selecione o professor.', erros);
  if (!isDataISO(input.data)) {
    erros.push({ campo: 'data', mensagem: 'Informe uma data válida.' });
  }
  if (!isHora(input.hora)) {
    erros.push({ campo: 'hora', mensagem: 'Informe um horário válido.' });
  }
  const duracaoMin = isVazio(input.duracaoMin) ? null : toNumber(input.duracaoMin);
  if (duracaoMin !== null && (!Number.isInteger(duracaoMin) || duracaoMin < 15 || duracaoMin > 240)) {
    erros.push({ campo: 'duracaoMin', mensagem: 'A duração da aula deve ficar entre 15 e 240 minutos.' });
  }
  const semanas = isVazio(input.semanas) ? 1 : toNumber(input.semanas);
  if (!Number.isInteger(semanas) || semanas < 1 || semanas > SEMANAS_MAXIMAS) {
    erros.push({ campo: 'semanas', mensagem: `Repita a aula por 1 a ${SEMANAS_MAXIMAS} semanas.` });
  }

  if (erros.length > 0) return { erros, dados: null };
  return { erros, dados: { alunoId, professorId, data: input.data, hora: input.hora, duracaoMin, semanas } };
}

/** Remarcação: a nova data e o novo horário da aula. */
export function validarRemarcacao(input = {}) {
  const erros = [];
  if (!isDataISO(input.data)) erros.push({ campo: 'data', mensagem: 'Informe a nova data.' });
  if (!isHora(input.hora)) erros.push({ campo: 'hora', mensagem: 'Informe o novo horário.' });
  if (erros.length > 0) return { erros, dados: null };
  return { erros, dados: { data: input.data, hora: input.hora } };
}

export const STATUS_PRESENCA = ['realizada', 'falta'];
export const TAMANHO_MAXIMO_DIARIO = 5000;

/** RF08 — presença: "realizada" (o aluno veio) ou "falta". */
export function validarPresenca(input = {}) {
  if (!STATUS_PRESENCA.includes(input.status)) {
    return { erros: [{ campo: 'status', mensagem: 'Escolha se o aluno esteve presente ou faltou.' }], dados: null };
  }
  return { erros: [], dados: { status: input.status } };
}

/** RF09 — diário: conteúdo ministrado (obrigatório) e plano para a próxima aula (opcional). */
export function validarDiario(input = {}) {
  const erros = [];
  const conteudo = typeof input.conteudoMinistrado === 'string' ? input.conteudoMinistrado.trim() : '';
  const plano = typeof input.planoProxima === 'string' ? input.planoProxima.trim() : '';
  if (conteudo.length < 3 || conteudo.length > TAMANHO_MAXIMO_DIARIO) {
    erros.push({ campo: 'conteudoMinistrado', mensagem: 'Descreva o conteúdo da aula (de 3 a 5.000 caracteres).' });
  }
  if (plano.length > TAMANHO_MAXIMO_DIARIO) {
    erros.push({ campo: 'planoProxima', mensagem: 'O plano para a próxima aula pode ter até 5.000 caracteres.' });
  }
  if (erros.length > 0) return { erros, dados: null };
  return { erros, dados: { conteudoMinistrado: conteudo, planoProxima: plano || null } };
}
