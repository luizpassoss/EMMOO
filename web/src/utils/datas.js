/**
 * Datas de calendário "AAAA-MM-DD" (mesmo formato da API). Os cálculos usam UTC
 * para que somar dias e montar semanas não sofra com fuso horário ou horário de verão.
 */
const MS_POR_DIA = 24 * 60 * 60 * 1000;
export const NOMES_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const paraUTC = (dataISO) => new Date(`${dataISO}T00:00:00.000Z`);
const doisDigitos = (numero) => String(numero).padStart(2, '0');

/** Data de hoje no fuso do navegador. */
export function hojeISO(agora = new Date()) {
  return `${agora.getFullYear()}-${doisDigitos(agora.getMonth() + 1)}-${doisDigitos(agora.getDate())}`;
}

/** Hora atual "HH:MM" no fuso do navegador. */
export function horaAtual(agora = new Date()) {
  return `${doisDigitos(agora.getHours())}:${doisDigitos(agora.getMinutes())}`;
}

export function somarDias(dataISO, dias) {
  return new Date(paraUTC(dataISO).getTime() + dias * MS_POR_DIA).toISOString().slice(0, 10);
}

/** 0 = domingo ... 6 = sábado. */
export function diaDaSemana(dataISO) {
  return paraUTC(dataISO).getUTCDay();
}

/** Segunda-feira da semana da data (a semana da escola vai de segunda a domingo). */
export function inicioDaSemana(dataISO) {
  return somarDias(dataISO, -((diaDaSemana(dataISO) + 6) % 7));
}

/** As 7 datas da semana que começa em `inicio`. */
export function diasDaSemana(inicio) {
  return Array.from({ length: 7 }, (_, indice) => somarDias(inicio, indice));
}

/** "2026-10-05" → "05/10". */
export function formatarData(dataISO) {
  const [, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}`;
}

/** "2026-10-05" → "Segunda, 05/10". */
export function rotuloDia(dataISO) {
  return `${NOMES_DIAS[diaDaSemana(dataISO)]}, ${formatarData(dataISO)}`;
}

/** Semana iniciada em "2026-09-28" → "28 set – 4 out 2026". */
export function rotuloSemana(inicio) {
  const fim = somarDias(inicio, 6);
  const [anoInicio, mesInicio, diaInicio] = inicio.split('-').map(Number);
  const [anoFim, mesFim, diaFim] = fim.split('-').map(Number);
  const parteInicial = mesInicio === mesFim ? `${diaInicio}` : `${diaInicio} ${MESES[mesInicio - 1]}`;
  const anoInicial = anoInicio === anoFim ? '' : ` ${anoInicio}`;
  return `${parteInicial}${anoInicial} – ${diaFim} ${MESES[mesFim - 1]} ${anoFim}`;
}

/** Hora de término: ("14:00", 45) → "14:45". */
export function horaFim(hora, duracaoMin) {
  const [horas, minutos] = hora.split(':').map(Number);
  const total = horas * 60 + minutos + duracaoMin;
  return `${doisDigitos(Math.floor(total / 60) % 24)}:${doisDigitos(total % 60)}`;
}
