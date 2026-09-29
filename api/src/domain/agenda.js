/**
 * Regras puras da agenda (RF04, RF05, RN09 e RN10) — sem framework nem banco.
 * Aulas e horários chegam como dados simples: datas "AAAA-MM-DD" e horas "HH:MM".
 */
import { diaDaSemana, diferencaEmDias, paraDate, somarDias } from '../shared/datas.js';
import { criarIntervalo, intervalosSeSobrepoem } from './regras.js';

export const SEMANAS_MAXIMAS = 26; // um semestre de aulas semanais
export const PERIODO_MAXIMO_DIAS = 62;

/** Intervalo [inicio, fim) de uma aula a partir da data, hora e duração. */
export function intervaloDaAula({ data, hora, duracaoMin }) {
  return criarIntervalo(paraDate(data, hora), duracaoMin);
}

/** Aulas canceladas liberam o horário; as demais (agendada, realizada, falta) o ocupam. */
export function ocupaHorario(aula) {
  return aula.status !== 'cancelada';
}

/** Datas de uma aula semanal: a data inicial e as N-1 semanas seguintes. */
export function gerarDatasSemanais(dataInicial, semanas = 1) {
  if (!Number.isInteger(semanas) || semanas < 1 || semanas > SEMANAS_MAXIMAS) {
    throw new RangeError(`semanas deve ser um inteiro entre 1 e ${SEMANAS_MAXIMAS}.`);
  }
  return Array.from({ length: semanas }, (_, indice) => somarDias(dataInicial, indice * 7));
}

/** RN09/RN10 — primeira aula existente (não cancelada) que conflita com a nova, ou null. */
export function encontrarAulaEmConflito(nova, existentes = []) {
  const intervalo = intervaloDaAula(nova);
  return (
    existentes.find(
      (aula) => ocupaHorario(aula) && intervalosSeSobrepoem(intervalo, intervaloDaAula(aula)),
    ) ?? null
  );
}

/** Dois horários disponíveis do mesmo professor não podem se sobrepor no mesmo dia da semana. */
export function horariosSeSobrepoem(a, b) {
  if (a.diaSemana !== b.diaSemana) return false;
  const referencia = '2000-01-01'; // o dia é irrelevante: só importa a faixa de horas
  return intervalosSeSobrepoem(
    intervaloDaAula({ data: referencia, hora: a.horaInicio, duracaoMin: a.duracaoMin }),
    intervaloDaAula({ data: referencia, hora: b.horaInicio, duracaoMin: b.duracaoMin }),
  );
}

/** Ordena aulas e vagas por data e hora. */
export const porDataEHora = (a, b) => a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora);

/**
 * RF05 — horários livres de um professor entre duas datas (inclusive):
 * cada horário disponível gera uma vaga no seu dia da semana, exceto quando já há aula no intervalo.
 */
export function calcularHorariosLivres({ horarios = [], aulas = [], inicio, fim }) {
  const totalDias = diferencaEmDias(inicio, fim);
  if (totalDias < 0) throw new RangeError('fim deve ser igual ou posterior a inicio.');

  const livres = [];
  for (let indice = 0; indice <= totalDias; indice += 1) {
    const data = somarDias(inicio, indice);
    const dia = diaDaSemana(data);
    for (const horario of horarios) {
      if (horario.diaSemana !== dia || horario.disponivel === false) continue;
      const vaga = { data, hora: horario.horaInicio, duracaoMin: horario.duracaoMin };
      if (!encontrarAulaEmConflito(vaga, aulas)) livres.push(vaga);
    }
  }
  return livres.sort(porDataEHora);
}
