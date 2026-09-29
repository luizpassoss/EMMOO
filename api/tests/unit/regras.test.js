import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  avaliarSolicitacaoDeReposicao,
  avisoDentroDaAntecedencia,
  calcularStatusMensalidade,
  calcularValorProRata,
  contaNoLimiteDeReposicao,
  criarIntervalo,
  encontrarConflito,
  intervalosSeSobrepoem,
  reposicaoDentroDoPrazo,
} from '../../src/domain/regras.js';

const utc = (texto) => new Date(texto);

describe('RN05 — antecedência do aviso de falta', () => {
  const aula = utc('2026-10-07T18:00:00Z');
  it('aceita aviso com exatamente 24h de antecedência', () => {
    assert.equal(avisoDentroDaAntecedencia(aula, utc('2026-10-06T18:00:00Z')), true);
  });
  it('recusa aviso com menos de 24h', () => {
    assert.equal(avisoDentroDaAntecedencia(aula, utc('2026-10-06T18:01:00Z')), false);
  });
  it('respeita antecedência configurável', () => {
    assert.equal(avisoDentroDaAntecedencia(aula, utc('2026-10-07T10:00:00Z'), 6), true);
  });
  it('rejeita datas inválidas', () => {
    assert.throws(() => avisoDentroDaAntecedencia(new Date('x'), aula), TypeError);
    assert.throws(() => avisoDentroDaAntecedencia(aula, '2026-10-06'), TypeError);
  });
});

describe('RN09/RN10 — conflitos de agenda', () => {
  const aula = (hora) => criarIntervalo(utc(`2026-10-07T${hora}:00Z`), 45);

  it('detecta sobreposição parcial', () => {
    assert.equal(intervalosSeSobrepoem(aula('14:00'), aula('14:30')), true);
  });
  it('aulas que apenas se encostam não conflitam', () => {
    const primeira = criarIntervalo(utc('2026-10-07T14:00:00Z'), 60);
    const segunda = criarIntervalo(utc('2026-10-07T15:00:00Z'), 60);
    assert.equal(intervalosSeSobrepoem(primeira, segunda), false);
  });
  it('encontra o compromisso conflitante', () => {
    const existentes = [aula('13:00'), aula('15:00')];
    assert.deepEqual(encontrarConflito(aula('15:30'), existentes), existentes[1]);
  });
  it('retorna null sem conflito ou sem compromissos', () => {
    assert.equal(encontrarConflito(aula('10:00'), [aula('13:00')]), null);
    assert.equal(encontrarConflito(aula('10:00')), null);
  });
  it('valida a duração do intervalo', () => {
    assert.throws(() => criarIntervalo(utc('2026-10-07T10:00:00Z'), 0), RangeError);
    assert.throws(() => criarIntervalo(utc('2026-10-07T10:00:00Z'), 30.5), RangeError);
  });
});

describe('RN04/RN11/RN12 — solicitação de reposição', () => {
  it('permite quando o aviso foi no prazo e há saldo no mês', () => {
    assert.deepEqual(avaliarSolicitacaoDeReposicao({ avisoNoPrazo: true, reposicoesNoMes: 0 }), { permitido: true });
  });
  it('recusa aviso fora do prazo', () => {
    assert.deepEqual(avaliarSolicitacaoDeReposicao({ avisoNoPrazo: false }), {
      permitido: false,
      motivo: 'AVISO_FORA_DO_PRAZO',
    });
  });
  it('recusa quando o limite mensal foi atingido', () => {
    assert.deepEqual(avaliarSolicitacaoDeReposicao({ avisoNoPrazo: true, reposicoesNoMes: 1 }), {
      permitido: false,
      motivo: 'LIMITE_MENSAL_ATINGIDO',
    });
  });
  it('respeita limite configurável', () => {
    assert.equal(avaliarSolicitacaoDeReposicao({ avisoNoPrazo: true, reposicoesNoMes: 1, limite: 2 }).permitido, true);
  });
  it('cancelamento pelo professor sempre gera reposição e não conta no limite', () => {
    assert.equal(contaNoLimiteDeReposicao('cancelamento_professor'), false);
    assert.equal(contaNoLimiteDeReposicao('falta_aluno'), true);
    assert.deepEqual(avaliarSolicitacaoDeReposicao({ motivo: 'cancelamento_professor', reposicoesNoMes: 5 }), {
      permitido: true,
    });
  });
  it('usa valores padrão quando chamado sem argumentos', () => {
    assert.equal(avaliarSolicitacaoDeReposicao().motivo, 'AVISO_FORA_DO_PRAZO');
  });
});

describe('RN11 — prazo para realizar a reposição', () => {
  const falta = utc('2026-10-01T15:00:00Z');
  it('aceita reposição dentro de 30 dias', () => {
    assert.equal(reposicaoDentroDoPrazo(falta, utc('2026-10-31T15:00:00Z')), true);
  });
  it('recusa reposição após 30 dias ou antes da falta', () => {
    assert.equal(reposicaoDentroDoPrazo(falta, utc('2026-10-31T15:00:01Z')), false);
    assert.equal(reposicaoDentroDoPrazo(falta, utc('2026-09-30T15:00:00Z')), false);
  });
  it('valida as datas', () => {
    assert.throws(() => reposicaoDentroDoPrazo(falta, null), TypeError);
  });
});

describe('RN13 — cobrança proporcional (pro rata)', () => {
  it('cobra o valor cheio quando a matrícula é no dia 1', () => {
    assert.equal(calcularValorProRata(140, utc('2026-09-01T12:00:00Z')), 140);
  });
  it('cobra 3/5 das semanas na metade de setembro (30 dias)', () => {
    assert.equal(calcularValorProRata(140, utc('2026-09-16T12:00:00Z')), 84);
  });
  it('cobra 2/4 das semanas na metade de fevereiro (28 dias)', () => {
    assert.equal(calcularValorProRata(140, utc('2026-02-15T12:00:00Z')), 70);
  });
  it('cobra uma semana no fim do mês', () => {
    assert.equal(calcularValorProRata(140, utc('2026-10-31T12:00:00Z')), 28);
  });
  it('arredonda para centavos', () => {
    assert.equal(calcularValorProRata(100, utc('2026-10-20T12:00:00Z')), 40);
    assert.equal(calcularValorProRata(99.99, utc('2026-09-16T12:00:00Z')), 59.99);
  });
  it('rejeita valores inválidos', () => {
    assert.throws(() => calcularValorProRata(-1, utc('2026-09-16T12:00:00Z')), RangeError);
    assert.throws(() => calcularValorProRata(Number.NaN, utc('2026-09-16T12:00:00Z')), RangeError);
    assert.throws(() => calcularValorProRata(140, new Date('invalida')), TypeError);
  });
});

describe('RN07 — status da mensalidade', () => {
  const vencimento = utc('2026-10-10T00:00:00Z');
  it('fica pendente até o dia do vencimento', () => {
    assert.equal(calcularStatusMensalidade({ vencimento, hoje: utc('2026-10-10T23:00:00Z') }), 'pendente');
  });
  it('fica atrasada após o vencimento sem pagamento', () => {
    assert.equal(calcularStatusMensalidade({ vencimento, hoje: utc('2026-10-11T00:00:00Z') }), 'atrasada');
  });
  it('fica paga quando há data de pagamento', () => {
    const dataPagamento = utc('2026-10-12T00:00:00Z');
    assert.equal(calcularStatusMensalidade({ vencimento, dataPagamento, hoje: utc('2026-10-20T00:00:00Z') }), 'paga');
  });
  it('usa a data atual por padrão', () => {
    assert.ok(['pendente', 'atrasada'].includes(calcularStatusMensalidade({ vencimento })));
  });
  it('valida as datas', () => {
    assert.throws(() => calcularStatusMensalidade({ vencimento: 'amanhã' }), TypeError);
    assert.throws(() => calcularStatusMensalidade({ vencimento, dataPagamento: 'ontem' }), TypeError);
  });
});
