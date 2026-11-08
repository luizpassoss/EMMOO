/**
 * Regras puras das mensalidades (RF10–RF12, RN07, RN08 e RN13) — sem framework nem banco.
 * Meses de referência chegam como "AAAA-MM" e datas como "AAAA-MM-DD".
 */
import { paraDate, somarDias } from '../shared/datas.js';
import { calcularStatusMensalidade, calcularValorProRata } from './regras.js';

export const DIA_VENCIMENTO = 10; // as mensalidades vencem no dia 10 do mês de referência
export const PRAZO_MINIMO_PAGAMENTO_DIAS = 5; // gerada depois do dia 10: vence 5 dias depois de gerada
export const DIAS_AVISO_VENCIMENTO = 3; // RF12 — alerta de vencimento próximo

/** RF11 — formas de pagamento aceitas pela escola na baixa, com o nome que aparece na tela e no recibo. */
export const FORMAS_PAGAMENTO = {
  pix: 'Pix',
  dinheiro: 'Dinheiro',
};
/** Formas aceitas em versões anteriores: um pagamento já registrado assim continua com o nome certo. */
const FORMAS_ANTERIORES = { cartao: 'Cartão', transferencia: 'Transferência bancária', boleto: 'Boleto' };

/** Nome da forma de pagamento para a tela e o recibo ("pix" → "Pix"); desconhecida ou vazia → null. */
export function nomeDaForma(forma) {
  return FORMAS_PAGAMENTO[forma] ?? FORMAS_ANTERIORES[forma] ?? null;
}

const PADRAO_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** Mês de referência válido no formato "AAAA-MM". */
export function isMesReferencia(valor) {
  return typeof valor === 'string' && PADRAO_MES.test(valor);
}

/** "2026-10-17" → "2026-10". */
export const mesDaData = (dataISO) => dataISO.slice(0, 7);

/** "2026-11" + 2 → "2027-01". */
export function somarMeses(mes, quantidade) {
  const [ano, numero] = mes.split('-').map(Number);
  const total = ano * 12 + (numero - 1) + quantidade;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** "2026-10" → "outubro de 2026". */
export function nomeDoMes(mes) {
  const [ano, numero] = mes.split('-').map(Number);
  return `${MESES[numero - 1]} de ${ano}`;
}

/**
 * Vencimento da mensalidade: dia 10 do mês de referência. Se ela for gerada perto disso ou depois
 * (ex.: matrícula no meio do mês), vence só PRAZO_MINIMO_PAGAMENTO_DIAS depois de hoje — ninguém recebe
 * uma cobrança que já nasce atrasada.
 */
export function vencimentoDaMensalidade(mes, hoje) {
  const padrao = `${mes}-${String(DIA_VENCIMENTO).padStart(2, '0')}`;
  const minimo = somarDias(hoje, PRAZO_MINIMO_PAGAMENTO_DIAS);
  return padrao < minimo ? minimo : padrao;
}

const arredondar = (valor) => Math.round((valor + Number.EPSILON) * 100) / 100;

/** Valor do mês: o do plano; no mês da matrícula, proporcional às semanas restantes (RN13). */
export function valorDaMensalidade(valorPlano, matricula, mes) {
  return mesDaData(matricula) === mes ? calcularValorProRata(Number(valorPlano), paraDate(matricula)) : arredondar(Number(valorPlano));
}

/**
 * O aluno gera mensalidade neste mês? Só se estiver ativo (RN08) e já matriculado no mês.
 * @returns {null | string} null quando gera; senão, o motivo
 */
export function motivoParaNaoGerar(aluno, matricula, mes) {
  if (aluno.status !== 'ativo') return 'Aluno inativo não gera mensalidade.';
  if (mesDaData(matricula) > mes) return 'Matriculado depois deste mês.';
  return null;
}

/** Situações em que a mensalidade ainda é cobrada (a cancelada não é; a paga já foi). */
export const EM_ABERTO = ['pendente', 'atrasada'];

/** Ajuste de valor e motivos (de ajuste e de cancelamento). */
export const VALOR_MAXIMO = 99999.99;
export const MOTIVO_MINIMO = 3;
export const MOTIVO_MAXIMO = 160;

/**
 * RN07 — situação de hoje: paga; atrasada se passou do vencimento sem pagamento; senão, pendente.
 * A cancelada continua cancelada (a escola desistiu de cobrá-la), qualquer que seja a data.
 */
export function situacaoDaMensalidade({ vencimento, dataPagamento, status }, hoje) {
  if (status === 'cancelada') return 'cancelada';
  return calcularStatusMensalidade({
    vencimento: paraDate(vencimento),
    dataPagamento: dataPagamento ? paraDate(dataPagamento) : null,
    hoje: paraDate(hoje),
  });
}

/** RF12 — que alerta cabe hoje: "vencimento" (vence em até 3 dias), "atraso" (vencida) ou nenhum. */
export function alertaDevido(mensalidade, hoje) {
  const situacao = situacaoDaMensalidade(mensalidade, hoje);
  if (situacao === 'atrasada') return 'atraso';
  if (situacao === 'pendente' && mensalidade.vencimento <= somarDias(hoje, DIAS_AVISO_VENCIMENTO)) return 'vencimento';
  return null;
}
