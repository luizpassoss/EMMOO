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
    erros.push({ campo: 'data', mensagem: 'Informe uma data válida (AAAA-MM-DD).' });
  }
  if (!isHora(input.hora)) {
    erros.push({ campo: 'hora', mensagem: 'Informe a hora no formato HH:MM.' });
  }
  const duracaoMin = isVazio(input.duracaoMin) ? null : toNumber(input.duracaoMin);
  if (duracaoMin !== null && (!Number.isInteger(duracaoMin) || duracaoMin < 15 || duracaoMin > 240)) {
    erros.push({ campo: 'duracaoMin', mensagem: 'A duração deve ser um inteiro entre 15 e 240 minutos.' });
  }
  const semanas = isVazio(input.semanas) ? 1 : toNumber(input.semanas);
  if (!Number.isInteger(semanas) || semanas < 1 || semanas > SEMANAS_MAXIMAS) {
    erros.push({ campo: 'semanas', mensagem: `Repita a aula por 1 a ${SEMANAS_MAXIMAS} semanas.` });
  }

  if (erros.length > 0) return { erros, dados: null };
  return { erros, dados: { alunoId, professorId, data: input.data, hora: input.hora, duracaoMin, semanas } };
}
