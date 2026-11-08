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

/**
 * Ocupam o horário as aulas agendadas e as realizadas. Cancelada libera; falta também — com o aviso de falta
 * (RF06), o horário fica livre para a reposição de outro aluno (RF07). Falta registrada pelo professor é de
 * aula que já aconteceu, então não disputa horário com nada novo.
 */
export function ocupaHorario(aula) {
  return aula.status === 'agendada' || aula.status === 'realizada';
}

/**
 * A aula (ou vaga) já começou em relação a `hoje` + `agora` ("HH:MM")? Uma aula que já começou não se cancela,
 * não se agenda e não é cancelada pela inativação do aluno — ela aconteceu (será realizada ou falta, RF08).
 */
export function jaComecou({ data, hora }, { hoje, agora }) {
  return data < hoje || (data === hoje && hora <= agora);
}

/** Feriado ou recesso da escola que cobre a data ("AAAA-MM-DD"), ou null. */
export function feriadoNaData(data, feriados = []) {
  return feriados.find((feriado) => feriado.inicio <= data && data <= feriado.fim) ?? null;
}

/**
 * Aulas canceladas que podem voltar para a agenda: as que não conflitam (RN09/RN10) com outra aula do mesmo
 * professor ou do mesmo aluno. `outras` são as demais aulas do período (as canceladas não ocupam horário).
 * @returns {{ livres: number[], ocupadas: number[] }} ids
 */
export function separarRestauraveis(candidatas, outras) {
  const ids = new Set(candidatas.map((aula) => aula.id));
  const demais = outras.filter((aula) => !ids.has(aula.id));
  const livres = [];
  const ocupadas = [];
  for (const aula of candidatas) {
    const doMesmoProfessorOuAluno = demais.filter(
      (outra) => outra.professorId === aula.professorId || outra.alunoId === aula.alunoId,
    );
    (encontrarAulaEmConflito(aula, doMesmoProfessorOuAluno) ? ocupadas : livres).push(aula.id);
  }
  return { livres, ocupadas };
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

const paraMinutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const paraHora = (minutos) => `${String(Math.floor(minutos / 60)).padStart(2, '0')}:${String(minutos % 60).padStart(2, '0')}`;

/**
 * RF04 — grade de atendimento do professor: nos dias escolhidos, aulas seguidas de `duracaoMin` minutos de `inicio`
 * até `fim` (a última termina até `fim`). Ex.: segunda, 14:00–16:00, 45 min → 14:00 e 14:45 (15:30 passaria das 16:00).
 * @returns {{ diaSemana: number, horaInicio: string, duracaoMin: number }[]}
 */
export function gerarGradeDeHorarios({ dias, inicio, fim, duracaoMin }) {
  const horas = [];
  for (let minuto = paraMinutos(inicio); minuto + duracaoMin <= paraMinutos(fim); minuto += duracaoMin) {
    horas.push(paraHora(minuto));
  }
  return [...dias].sort((a, b) => a - b).flatMap((diaSemana) => horas.map((horaInicio) => ({ diaSemana, horaInicio, duracaoMin })));
}

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
