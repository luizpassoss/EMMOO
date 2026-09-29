/**
 * Datas de calendário ("AAAA-MM-DD") e horas ("HH:MM") como texto, sem fuso horário.
 * Os cálculos usam UTC para que dias e semanas não sejam distorcidos pelo fuso do servidor.
 */
const PADRAO_DATA = /^\d{4}-\d{2}-\d{2}$/;
const PADRAO_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Data de calendário válida no formato "AAAA-MM-DD" (rejeita, por exemplo, 2026-02-30). */
export function isDataISO(valor) {
  if (typeof valor !== 'string' || !PADRAO_DATA.test(valor)) return false;
  const data = new Date(`${valor}T00:00:00.000Z`);
  return !Number.isNaN(data.getTime()) && data.toISOString().startsWith(valor);
}

/** Hora válida no formato "HH:MM" (00:00 a 23:59). */
export function isHora(valor) {
  return typeof valor === 'string' && PADRAO_HORA.test(valor);
}

/** Data de hoje no fuso do servidor (em produção, defina TZ=America/Sao_Paulo). */
export function hojeISO(agora = new Date()) {
  const doisDigitos = (numero) => String(numero).padStart(2, '0');
  return `${agora.getFullYear()}-${doisDigitos(agora.getMonth() + 1)}-${doisDigitos(agora.getDate())}`;
}

/** Converte data e hora de calendário em Date (UTC). */
export function paraDate(dataISO, hora = '00:00') {
  return new Date(`${dataISO}T${hora}:00.000Z`);
}

/** Converte Date em data de calendário "AAAA-MM-DD" (UTC). */
export function paraDataISO(data) {
  return data.toISOString().slice(0, 10);
}

export function somarDias(dataISO, dias) {
  return paraDataISO(new Date(paraDate(dataISO).getTime() + dias * MS_POR_DIA));
}

/** 0 = domingo ... 6 = sábado (mesma convenção do schema). */
export function diaDaSemana(dataISO) {
  return paraDate(dataISO).getUTCDay();
}

/** Quantidade de dias de `inicio` até `fim` (negativa quando `fim` vem antes). */
export function diferencaEmDias(inicio, fim) {
  return Math.round((paraDate(fim).getTime() - paraDate(inicio).getTime()) / MS_POR_DIA);
}

/** "2026-10-05" → "05/10/2026", para mensagens ao usuário. */
export function formatarDataBR(dataISO) {
  return dataISO.split('-').reverse().join('/');
}
