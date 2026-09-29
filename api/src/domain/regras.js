/**
 * Regras de negócio puras — sem dependência de framework ou banco de dados.
 * Derivadas da seção 2.5 da RFC (Regras de Negócio) e usadas pelos serviços
 * de agenda, reposição e mensalidades. Por serem puras, são testadas isoladamente (TDD).
 */
const MS_POR_MINUTO = 60 * 1000;
const MS_POR_HORA = 60 * MS_POR_MINUTO;
const MS_POR_DIA = 24 * MS_POR_HORA;

export const ANTECEDENCIA_MINIMA_HORAS = 24; // RN05
export const LIMITE_REPOSICOES_POR_MES = 1; // RN11
export const PRAZO_REPOSICAO_DIAS = 30; // RN11

function garantirData(valor, nome) {
  if (!(valor instanceof Date) || Number.isNaN(valor.getTime())) {
    throw new TypeError(`${nome} deve ser uma data válida.`);
  }
}

/** RN05 — o aviso de falta precisa respeitar a antecedência mínima (padrão: 24h). */
export function avisoDentroDaAntecedencia(inicioAula, dataAviso, antecedenciaHoras = ANTECEDENCIA_MINIMA_HORAS) {
  garantirData(inicioAula, 'inicioAula');
  garantirData(dataAviso, 'dataAviso');
  return inicioAula.getTime() - dataAviso.getTime() >= antecedenciaHoras * MS_POR_HORA;
}

/** Cria o intervalo [inicio, fim) de um compromisso a partir da duração em minutos. */
export function criarIntervalo(inicio, duracaoMin) {
  garantirData(inicio, 'inicio');
  if (!Number.isInteger(duracaoMin) || duracaoMin <= 0) {
    throw new RangeError('duracaoMin deve ser um inteiro positivo.');
  }
  return { inicio, fim: new Date(inicio.getTime() + duracaoMin * MS_POR_MINUTO) };
}

/** Dois intervalos se sobrepõem quando um começa antes de o outro terminar (encostar não conflita). */
export function intervalosSeSobrepoem(a, b) {
  return a.inicio.getTime() < b.fim.getTime() && b.inicio.getTime() < a.fim.getTime();
}

/** RN09/RN10 — retorna o primeiro compromisso que conflita com o novo intervalo, ou null. */
export function encontrarConflito(novo, existentes = []) {
  return existentes.find((existente) => intervalosSeSobrepoem(novo, existente)) ?? null;
}

/** RN12 — aula cancelada pelo professor não consome o limite mensal de reposições do aluno. */
export function contaNoLimiteDeReposicao(motivo) {
  return motivo !== 'cancelamento_professor';
}

/**
 * RN04, RN05, RN11 e RN12 — decide se a reposição pode ser solicitada.
 * @returns {{ permitido: boolean, motivo?: 'AVISO_FORA_DO_PRAZO' | 'LIMITE_MENSAL_ATINGIDO' }}
 */
export function avaliarSolicitacaoDeReposicao({
  motivo = 'falta_aluno',
  avisoNoPrazo = false,
  reposicoesNoMes = 0,
  limite = LIMITE_REPOSICOES_POR_MES,
} = {}) {
  if (!contaNoLimiteDeReposicao(motivo)) return { permitido: true };
  if (!avisoNoPrazo) return { permitido: false, motivo: 'AVISO_FORA_DO_PRAZO' };
  if (reposicoesNoMes >= limite) return { permitido: false, motivo: 'LIMITE_MENSAL_ATINGIDO' };
  return { permitido: true };
}

/** RN11 — a reposição deve acontecer em até N dias (padrão: 30) após a falta. */
export function reposicaoDentroDoPrazo(dataFalta, dataReposicao, prazoDias = PRAZO_REPOSICAO_DIAS) {
  garantirData(dataFalta, 'dataFalta');
  garantirData(dataReposicao, 'dataReposicao');
  const diferenca = dataReposicao.getTime() - dataFalta.getTime();
  return diferenca >= 0 && diferenca <= prazoDias * MS_POR_DIA;
}

function arredondarCentavos(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/**
 * RN13 — matrícula no meio do mês é cobrada proporcionalmente às semanas restantes.
 * Usa datas em UTC para não sofrer distorções de fuso horário.
 */
export function calcularValorProRata(valorMensal, dataMatricula) {
  if (!Number.isFinite(valorMensal) || valorMensal < 0) {
    throw new RangeError('valorMensal deve ser um número não negativo.');
  }
  garantirData(dataMatricula, 'dataMatricula');
  const ano = dataMatricula.getUTCFullYear();
  const mes = dataMatricula.getUTCMonth();
  const diasNoMes = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  const diasRestantes = diasNoMes - dataMatricula.getUTCDate() + 1;
  const semanasNoMes = Math.ceil(diasNoMes / 7);
  const semanasRestantes = Math.ceil(diasRestantes / 7);
  return arredondarCentavos((valorMensal * semanasRestantes) / semanasNoMes);
}

function chaveDeData(data) {
  return data.toISOString().slice(0, 10);
}

/** RN07 — mensalidade não paga após o dia do vencimento passa a "atrasada". */
export function calcularStatusMensalidade({ vencimento, dataPagamento = null, hoje = new Date() }) {
  garantirData(vencimento, 'vencimento');
  garantirData(hoje, 'hoje');
  if (dataPagamento !== null) {
    garantirData(dataPagamento, 'dataPagamento');
    return 'paga';
  }
  return chaveDeData(hoje) > chaveDeData(vencimento) ? 'atrasada' : 'pendente';
}
