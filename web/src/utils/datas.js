/**
 * Datas de calendário "AAAA-MM-DD" (mesmo formato da API). Os cálculos usam UTC
 * para que somar dias e montar semanas não sofra com fuso horário ou horário de verão.
 */
const MS_POR_DIA = 24 * 60 * 60 * 1000;
export const NOMES_DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MESES_EXTENSO = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const DIAS_EXTENSO = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

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

/** Dias de `inicio` até `fim` (negativo quando `fim` vem antes). */
export function diferencaEmDias(inicio, fim) {
  return Math.round((paraUTC(fim).getTime() - paraUTC(inicio).getTime()) / MS_POR_DIA);
}

/**
 * A agenda anda em janelas de 7 dias a partir de hoje (hoje–hoje+6, hoje+7–hoje+13…), nunca antes de hoje.
 * Devolve o início da janela que contém a data (datas passadas caem na primeira, a de hoje).
 */
export function inicioDaJanela(dataISO, hoje = hojeISO()) {
  const semanas = Math.floor(Math.max(0, diferencaEmDias(hoje, dataISO)) / 7);
  return somarDias(hoje, semanas * 7);
}

/** A aula já terminou? (dia anterior, ou hoje depois do horário de término). A que está em andamento, não. */
export function aulaJaTerminou({ data, hora, duracaoMin }, hoje = hojeISO(), agora = horaAtual()) {
  if (data !== hoje) return data < hoje;
  const minutos = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  return minutos(hora) + duracaoMin <= minutos(agora);
}

/** As 7 datas a partir de `inicio` (uma janela da agenda). */
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

/** "2026-10-01" → "quinta-feira, 1 de outubro". */
export function dataPorExtenso(dataISO) {
  const [, mes, dia] = dataISO.split('-').map(Number);
  return `${DIAS_EXTENSO[diaDaSemana(dataISO)]}, ${dia} de ${MESES_EXTENSO[mes - 1]}`;
}

/** "Hoje", "Amanhã" ou "Segunda, 05/10" — o jeito mais rápido de ler quando é a aula. */
export function rotuloDiaRelativo(dataISO, hoje = hojeISO()) {
  if (dataISO === hoje) return 'Hoje';
  if (dataISO === somarDias(hoje, 1)) return 'Amanhã';
  return rotuloDia(dataISO);
}

/** Período de datas, sem repetir mês e ano: "28 set – 4 out 2026", "8 – 9 mar 2032"; um dia só: "2 nov 2026". */
export function rotuloPeriodo(inicio, fim) {
  const [anoInicio, mesInicio, diaInicio] = inicio.split('-').map(Number);
  const [anoFim, mesFim, diaFim] = fim.split('-').map(Number);
  if (inicio === fim) return `${diaFim} ${MESES[mesFim - 1]} ${anoFim}`;
  const mesmoMes = mesInicio === mesFim && anoInicio === anoFim;
  const parteInicial = mesmoMes ? `${diaInicio}` : `${diaInicio} ${MESES[mesInicio - 1]}`;
  const anoInicial = anoInicio === anoFim ? '' : ` ${anoInicio}`;
  return `${parteInicial}${anoInicial} – ${diaFim} ${MESES[mesFim - 1]} ${anoFim}`;
}

/** "2026-10-05" → "05/10/2026". */
export function formatarDataCompleta(dataISO) {
  const [ano, mes, dia] = dataISO.split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Instante da API (ISO, em UTC) no fuso do navegador: "17/10 às 14:32". */
export function formatarMomento(instanteISO) {
  const data = new Date(instanteISO);
  return `${formatarData(hojeISO(data))} às ${horaAtual(data)}`;
}

/** Mês de referência "AAAA-MM" de uma data. */
export const mesDaData = (dataISO) => dataISO.slice(0, 7);

/** "2026-11" + 2 → "2027-01". */
export function somarMeses(mes, quantidade) {
  const [ano, numero] = mes.split('-').map(Number);
  const total = ano * 12 + (numero - 1) + quantidade;
  return `${Math.floor(total / 12)}-${doisDigitos((total % 12) + 1)}`;
}

/** "2026-10" → "outubro de 2026" (com `maiuscula`, "Outubro de 2026", para títulos). */
export function nomeDoMes(mes, { maiuscula = false } = {}) {
  const [ano, numero] = mes.split('-').map(Number);
  const nome = MESES_EXTENSO[numero - 1];
  return `${maiuscula ? nome[0].toUpperCase() + nome.slice(1) : nome} de ${ano}`;
}

/** Hora de término: ("14:00", 45) → "14:45". */
export function horaFim(hora, duracaoMin) {
  const [horas, minutos] = hora.split(':').map(Number);
  const total = horas * 60 + minutos + duracaoMin;
  return `${doisDigitos(Math.floor(total / 60) % 24)}:${doisDigitos(total % 60)}`;
}
