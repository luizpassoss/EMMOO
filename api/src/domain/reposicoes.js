/**
 * Regras puras de aviso de falta e reposição (RF06, RF07, RN04, RN05, RN11 e RN12) — sem framework nem banco.
 * Aulas chegam como dados simples ({ data: "AAAA-MM-DD", hora: "HH:MM", status, motivoCancelamento }).
 */
import { paraDate, somarDias } from '../shared/datas.js';
import {
  avaliarSolicitacaoDeReposicao,
  avisoDentroDaAntecedencia,
  contaNoLimiteDeReposicao,
  PRAZO_REPOSICAO_DIAS,
  reposicaoDentroDoPrazo,
} from './regras.js';

const MS_POR_HORA = 60 * 60 * 1000;

/** Início da aula e "agora" na mesma referência (data e hora de calendário, sem fuso). */
const inicioDaAula = (aula) => paraDate(aula.data, aula.hora);
const instante = ({ hoje, agora }) => paraDate(hoje, agora);

/** Horas que faltam para a aula começar (negativo quando já começou). */
export function horasAteAAula(aula, momento) {
  return (inicioDaAula(aula).getTime() - instante(momento).getTime()) / MS_POR_HORA;
}

/** RN05 — o aviso de falta feito agora respeita a antecedência mínima (24h) e libera reposição? */
export function avisoNoPrazo(aula, momento) {
  return avisoDentroDaAntecedencia(inicioDaAula(aula), instante(momento));
}

/**
 * Por que a aula perdida dá (ou não) direito a reposição:
 * - falta avisada pelo aluno/responsável → "falta_aluno", só com o aviso no prazo (RN05) e conta no limite (RN11);
 * - aula cancelada pela escola (professor ou coordenação) → "cancelamento_professor": não conta no limite (RN12).
 * Aula realizada, agendada, falta registrada pelo professor sem aviso, ou cancelada pela inativação do aluno
 * ou por feriado não gera reposição (RN04: a reposição só existe a pedido, por uma aula perdida).
 * A própria reposição também não gera outra: se a escola a cancela, a aula perdida original volta a poder
 * ser reposta; se o aluno falta a ela, a reposição foi usada.
 * @returns {null | { motivo: 'falta_aluno' | 'cancelamento_professor', avisoNoPrazo: boolean }}
 */
export function origemDaReposicao(aula, avisoFalta = null) {
  if (aula.reposicaoDeId != null) return null;
  if (aula.status === 'cancelada' && (aula.motivoCancelamento ?? 'manual') === 'manual') {
    return { motivo: 'cancelamento_professor', avisoNoPrazo: true };
  }
  if (aula.status === 'falta' && avisoFalta) return { motivo: 'falta_aluno', avisoNoPrazo: Boolean(avisoFalta.liberaReposicao) };
  return null;
}

/** RN11 — último dia para fazer a reposição: 30 dias depois da aula perdida. */
export const prazoDaReposicao = (aula) => somarDias(aula.data, PRAZO_REPOSICAO_DIAS);

/** RN11 — a data da reposição fica entre o dia da aula perdida e o fim do prazo. */
export function dataNoPrazoDaReposicao(aulaPerdida, data) {
  return reposicaoDentroDoPrazo(paraDate(aulaPerdida.data), paraDate(data));
}

/**
 * Decide se a aula perdida pode ser reposta agora.
 * `reposicoesNoMes`: reposições do aluno que contam no limite, de aulas perdidas no mesmo mês desta.
 * @returns {{ permitido: boolean, contaNoLimite: boolean, bloqueio: null | 'AVISO_FORA_DO_PRAZO' | 'LIMITE_MENSAL_ATINGIDO' | 'PRAZO_ENCERRADO' }}
 */
export function avaliarReposicao(origem, { reposicoesNoMes, prazoAte, hoje }) {
  const contaNoLimite = contaNoLimiteDeReposicao(origem.motivo);
  if (prazoAte < hoje) return { permitido: false, contaNoLimite, bloqueio: 'PRAZO_ENCERRADO' };
  const avaliacao = avaliarSolicitacaoDeReposicao({ ...origem, reposicoesNoMes });
  return { permitido: avaliacao.permitido, contaNoLimite, bloqueio: avaliacao.permitido ? null : avaliacao.motivo };
}
