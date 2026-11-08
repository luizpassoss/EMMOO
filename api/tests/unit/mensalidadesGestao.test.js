import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { crc16 } from '../../src/domain/pix.js';
import { createAlunoService } from '../../src/modules/alunos/aluno.service.js';
import { createIndicadorService } from '../../src/modules/indicadores/indicador.service.js';
import { createMensalidadeService } from '../../src/modules/mensalidades/mensalidade.service.js';
import { createRelatorioService } from '../../src/modules/relatorios/relatorio.service.js';
import { ConflictError, NotFoundError, ValidationError } from '../../src/shared/errors.js';
import { reposDaEscolaDemo } from '../helpers/fakes.js';

// Seed: Ana (responsável Mary) e Pedro (sem responsável), ambos no plano de R$ 140,00. Hoje: 07/10/2026.
const COORDENACAO = { id: 1, papel: 'coordenacao' };
const MARY = { id: 3, papel: 'responsavel' };
const PIX_DA_ESCOLA = { pixTipo: 'email', pixChave: 'financeiro@emmoo.com.br', pixRecebedor: 'Escola EMMOO', pixCidade: 'Joinville' };

let base;
let escola;
let repos;
let qrGerados;
let recibos;
let hoje;

const qrCode = async (texto) => {
  qrGerados.push(texto);
  return `<svg>${texto.length}</svg>`;
};
const criar = () =>
  createMensalidadeService({
    mensalidades: repos.mensalidades,
    alunos: repos.alunos,
    planos: repos.planos,
    usuarios: repos.usuarios,
    alertas: repos.alertas,
    escola: () => base.escolas.findById(escola.id),
    mailer: { configurado: false, enviar: async () => {} },
    documentos: {
      async gerarRecibo(dados) {
        recibos.push(dados);
        return Buffer.from('%PDF-recibo');
      },
    },
    qrCode,
    hoje: () => hoje,
  });

/** Erro de validação no campo informado. */
const noCampo = (campo) => (erro) => {
  assert.ok(erro instanceof ValidationError);
  assert.equal(erro.details[0].campo, campo);
  return true;
};

beforeEach(async () => {
  ({ base, escola, repos } = await reposDaEscolaDemo({ hoje: '2026-10-07' }));
  hoje = '2026-10-07';
  qrGerados = [];
  recibos = [];
  await repos.alunos.update(1, { criadoEm: '2026-09-15T12:00:00.000Z' }); // Ana: mês cheio (R$ 140,00)
  await repos.alunos.update(2, { criadoEm: '2026-10-05T12:00:00.000Z' }); // Pedro: proporcional (R$ 112,00)
  await criar().gerar({ mes: '2026-10' }); // 1: Ana, 2: Pedro — vencem em 12/10
});

describe('ajuste de valor (desconto, bolsa, correção)', () => {
  it('guarda o valor antes do primeiro ajuste e o motivo; voltar ao valor original desfaz o ajuste', async () => {
    const s = criar();
    const desconto = await s.ajustarValor(1, { valor: '100', motivo: '  Desconto   de irmãos ' });
    assert.deepEqual([desconto.valor, desconto.valorOriginal, desconto.ajusteMotivo], [100, 140, 'Desconto de irmãos']);
    const bolsa = await s.ajustarValor(1, { valor: 70.004, motivo: 'Bolsa de 50%' });
    assert.deepEqual([bolsa.valor, bolsa.valorOriginal, bolsa.ajusteMotivo], [70, 140, 'Bolsa de 50%']); // o original é o do plano
    const desfeito = await s.ajustarValor(1, { valor: 140 }); // sem motivo: só desfaz
    assert.deepEqual([desfeito.valor, desfeito.valorOriginal, desfeito.ajusteMotivo], [140, null, null]);
  });

  it('recusa valor inválido e ajuste sem motivo', async () => {
    const s = criar();
    for (const valor of [0, -5, 'abc', '', null, 100000]) {
      await assert.rejects(s.ajustarValor(1, { valor, motivo: 'Desconto' }), noCampo('valor'));
    }
    await assert.rejects(s.ajustarValor(1, { valor: 100 }), noCampo('motivo'));
    await assert.rejects(s.ajustarValor(1, { valor: 100, motivo: 'ok' }), noCampo('motivo'));
    await assert.rejects(s.ajustarValor(1, { valor: 100, motivo: 'x'.repeat(161) }), noCampo('motivo'));
    await assert.rejects(s.ajustarValor(99, { valor: 100, motivo: 'Desconto' }), NotFoundError);
  });

  it('só mexe em cobrança em aberto: a paga pede para desfazer a baixa; a cancelada, para reabrir', async () => {
    const s = criar();
    await s.registrarPagamento(1, { dataPagamento: '2026-10-07', formaPagamento: 'pix' });
    await assert.rejects(s.ajustarValor(1, { valor: 100, motivo: 'Desconto' }), {
      name: ConflictError.name,
      message: 'Esta mensalidade já está paga. Para mudar o valor, desfaça o pagamento antes.',
    });
    await s.cancelar(2, { motivo: 'Aluno saiu' });
    await assert.rejects(s.ajustarValor(2, { valor: 100, motivo: 'Desconto' }), /está cancelada/);
  });
});

describe('cancelar e reabrir uma cobrança', () => {
  it('cancelada sai dos totais e dos alertas, fica na lista com o motivo e pode ser reaberta', async () => {
    const s = criar();
    await assert.rejects(s.cancelar(2, {}), noCampo('motivo'));
    const cancelada = await s.cancelar(2, { motivo: 'Mês sem aulas' });
    assert.deepEqual([cancelada.status, cancelada.cancelamentoMotivo], ['cancelada', 'Mês sem aulas']);
    await assert.rejects(s.cancelar(2, { motivo: 'De novo' }), /está cancelada/);
    await assert.rejects(s.registrarPagamento(2, { dataPagamento: '2026-10-07', formaPagamento: 'pix' }), {
      name: ConflictError.name,
      message: 'Esta mensalidade está cancelada. Reabra-a antes de registrar o pagamento.',
    });

    // A lista do mês põe a cancelada por último e filtra por ela.
    assert.deepEqual((await s.listar({ mes: '2026-10' }, COORDENACAO)).map((m) => [m.id, m.status]), [
      [1, 'pendente'],
      [2, 'cancelada'],
    ]);
    assert.deepEqual((await s.listar({ status: 'cancelada' }, COORDENACAO)).map((m) => m.id), [2]);

    // Vencida, não vira atrasada nem gera alerta.
    hoje = '2026-10-20';
    const resumo = await criar().resumoDeAlertas();
    assert.deepEqual(resumo.atrasadas, { quantidade: 1, valor: 140 }); // só a da Ana
    await criar().processarAlertas();
    assert.equal((await repos.mensalidades.findById(2)).status, 'cancelada');

    // Reaberta já vencida: volta como atrasada, sem o motivo.
    const reaberta = await criar().reabrir(2);
    assert.deepEqual([reaberta.status, reaberta.cancelamentoMotivo], ['atrasada', null]);
    await assert.rejects(criar().reabrir(2), /não está cancelada/);
  });

  it('a paga não se cancela (desfaça a baixa antes)', async () => {
    const s = criar();
    await s.registrarPagamento(1, { dataPagamento: '2026-10-07', formaPagamento: 'dinheiro' });
    await assert.rejects(s.cancelar(1, { motivo: 'Engano' }), /desfaça o pagamento antes/);
  });

  it('o responsável vê a situação e o valor, mas não as anotações da coordenação', async () => {
    const s = criar();
    await s.ajustarValor(1, { valor: 120, motivo: 'Combinado com a família' });
    const [daMary] = await s.listar({}, MARY);
    assert.deepEqual([daMary.valor, daMary.valorOriginal], [120, 140]);
    assert.equal('ajusteMotivo' in daMary, false);
    assert.equal('cancelamentoMotivo' in daMary, false);
    const [daCoordenacao] = await s.listar({ alunoId: '1' }, COORDENACAO);
    assert.equal(daCoordenacao.ajusteMotivo, 'Combinado com a família');
  });

  it('"mes=todos" traz todos os meses (ex.: as de um aluno); situação inválida é recusada', async () => {
    hoje = '2026-11-01';
    await criar().gerar({ mes: '2026-11' });
    const s = criar();
    assert.deepEqual((await s.listar({ mes: 'todos', alunoId: 1 }, COORDENACAO)).map((m) => m.mesReferencia), [
      '2026-10',
      '2026-11',
    ]); // a atrasada de outubro antes da pendente de novembro
    await assert.rejects(s.listar({ mes: 'outubro' }, COORDENACAO), noCampo('mes'));
    await assert.rejects(s.listar({ status: 'perdida' }, COORDENACAO), noCampo('status'));
  });
});

describe('número do recibo (RF15)', () => {
  it('sequencial por escola, dado na primeira baixa e mantido se a baixa for desfeita e refeita', async () => {
    const s = criar();
    assert.equal((await s.registrarPagamento(2, { dataPagamento: '2026-10-06', formaPagamento: 'pix' })).numeroRecibo, 1);
    assert.equal((await s.registrarPagamento(1, { dataPagamento: '2026-10-07', formaPagamento: 'pix' })).numeroRecibo, 2);
    const desfeita = await s.desfazerPagamento(2);
    assert.deepEqual([desfeita.status, desfeita.numeroRecibo], ['pendente', 1]);
    assert.equal((await s.registrarPagamento(2, { dataPagamento: '2026-10-07', formaPagamento: 'dinheiro' })).numeroRecibo, 1);
    await s.recibo(1, COORDENACAO);
    assert.equal(recibos[0].numero, 2);
  });

  it('pagamento de antes da numeração usa o id no recibo', async () => {
    await repos.mensalidades.update(1, { status: 'paga', dataPagamento: '2026-10-01', formaPagamento: 'pix' });
    await criar().recibo(1, COORDENACAO);
    assert.equal(recibos[0].numero, 1);
  });
});

describe('Pix da escola para o responsável pagar', () => {
  it('sem chave cadastrada, explica que a coordenação precisa cadastrar', async () => {
    await assert.rejects(criar().pix(1, MARY), { name: ConflictError.name, message: /ainda não cadastrou a chave Pix/ });
  });

  it('"copia e cola" com a chave, o valor e a descrição, e o QR do mesmo texto', async () => {
    await base.escolas.update(escola.id, PIX_DA_ESCOLA);
    await criar().ajustarValor(1, { valor: 126.5, motivo: 'Desconto pontualidade' });
    const pix = await criar().pix(1, MARY);
    assert.equal(pix.valor, 126.5);
    assert.deepEqual([pix.recebedor, pix.chave], ['Escola EMMOO', { tipo: 'email', valor: 'financeiro@emmoo.com.br' }]);
    assert.ok(pix.copiaECola.includes('0123financeiro@emmoo.com.br'));
    assert.ok(pix.copiaECola.includes('5406126.50'));
    assert.ok(pix.copiaECola.includes('5912Escola EMMOO6009Joinville'));
    assert.ok(pix.copiaECola.includes('Mensalidade 10 2026 Ana Beatriz'));
    assert.equal(pix.copiaECola.slice(-4), crc16(pix.copiaECola.slice(0, -4)));
    assert.deepEqual(qrGerados, [pix.copiaECola]);
    assert.equal(pix.qrCodeSvg, `<svg>${pix.copiaECola.length}</svg>`);
    assert.equal('ajusteMotivo' in pix.mensalidade, false); // o responsável não vê a anotação
  });

  it('a lista do responsável diz quais podem ser pagas pelo Pix (só com a chave cadastrada e em aberto)', async () => {
    assert.deepEqual((await criar().listar({}, MARY)).map((m) => m.pixDisponivel), [false]);
    await base.escolas.update(escola.id, PIX_DA_ESCOLA);
    assert.deepEqual((await criar().listar({}, MARY)).map((m) => m.pixDisponivel), [true]);
    await criar().registrarPagamento(1, { dataPagamento: '2026-10-07', formaPagamento: 'pix' });
    assert.deepEqual((await criar().listar({}, MARY)).map((m) => m.pixDisponivel), [false]);
    assert.equal('pixDisponivel' in (await criar().listar({}, COORDENACAO))[0], false);
  });

  it('só das cobranças em aberto, e o responsável só das dos dependentes', async () => {
    await base.escolas.update(escola.id, PIX_DA_ESCOLA);
    const s = criar();
    await assert.rejects(s.pix(2, MARY), NotFoundError); // Pedro não é dependente da Mary
    assert.ok((await s.pix(2, COORDENACAO)).copiaECola);
    await s.registrarPagamento(1, { dataPagamento: '2026-10-07', formaPagamento: 'pix' });
    await assert.rejects(s.pix(1, MARY), { message: 'Esta mensalidade já está paga.' });
    await s.cancelar(2, { motivo: 'Aluno saiu' });
    await assert.rejects(s.pix(2, COORDENACAO), /foi cancelada/);
  });
});

describe('cobrança cancelada fora dos números da escola', () => {
  it('inativar o aluno pode cancelar as cobranças em aberto dele; sem pedir, elas continuam', async () => {
    const alunos = (mensalidades = repos.mensalidades) =>
      createAlunoService({ ...repos, mensalidades, hoje: () => hoje, agora: () => '16:00' });
    const pedro = await alunos().inativar(2, { cancelarMensalidades: true });
    assert.deepEqual([pedro.status, pedro.mensalidadesCanceladas], ['inativo', 1]);
    const dele = await repos.mensalidades.findById(2);
    assert.deepEqual([dele.status, dele.cancelamentoMotivo], ['cancelada', 'Aluno inativado.']);

    await criar().registrarPagamento(1, { dataPagamento: '2026-10-07', formaPagamento: 'pix' });
    const ana = await alunos().inativar(1, {});
    assert.equal(ana.mensalidadesCanceladas, 0);
    assert.equal((await repos.mensalidades.findById(1)).status, 'paga'); // a paga nunca é tocada
  });

  it('painel e relatório: a cancelada não entra no previsto nem no em aberto; aparece contada e com o motivo', async () => {
    await criar().registrarPagamento(1, { dataPagamento: '2026-10-07', formaPagamento: 'pix' });
    await criar().cancelar(2, { motivo: 'Mês sem aulas' });
    const relogio = { hoje: () => '2026-10-20', agora: () => '10:00' };
    const painel = await createIndicadorService({ ...repos, reposicoes: { disponiveis: async () => [] }, ...relogio }).doUsuario(
      COORDENACAO,
    );
    assert.deepEqual(painel.mesAtual, { mes: '2026-10', previsto: 140, recebido: 140, geradas: 1 });
    assert.deepEqual(painel.inadimplencia, { quantidade: 0, valor: 0 });

    const relatorios = createRelatorioService({ ...repos, escola: async () => ({ nome: 'EMMOO' }), documentos: {}, ...relogio });
    const relatorio = await relatorios.mensal({ mes: '2026-10' });
    assert.deepEqual(relatorio.financeiro, {
      previsto: 140,
      recebido: 140,
      emAberto: 0,
      atrasado: 0,
      quantidade: { paga: 1, pendente: 0, atrasada: 0, cancelada: 1 },
    });
    const pedro = relatorio.mensalidades.find((linha) => linha.aluno === 'Pedro Henrique');
    assert.deepEqual([pedro.situacao, pedro.observacao, pedro.numeroRecibo], ['Cancelada', 'Mês sem aulas', null]);
  });
});
