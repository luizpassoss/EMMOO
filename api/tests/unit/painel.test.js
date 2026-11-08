import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { createAulaService } from '../../src/modules/aulas/aula.service.js';
import { createHistoricoService } from '../../src/modules/historico/historico.service.js';
import {
  createIndicadorService,
  percentualDePresenca,
  proximaDataSemanal,
} from '../../src/modules/indicadores/indicador.service.js';
import { createMensalidadeService } from '../../src/modules/mensalidades/mensalidade.service.js';
import { createRelatorioService } from '../../src/modules/relatorios/relatorio.service.js';
import { createReposicaoService } from '../../src/modules/reposicoes/reposicao.service.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../src/shared/errors.js';
import { reposDaEscolaDemo } from '../helpers/fakes.js';

// Seed com HOJE = quarta 07/10/2026, 16:00: Ana (responsável Mary) tem aula às segundas 14:00 — aulas 1 (05/10),
// 2 (12/10)…; Pedro às quartas 15:30 — aulas 9 (hoje, já começou), 10 (14/10)… Ambos com o professor Luiz (id 2).
const COORDENACAO = { id: 1, papel: 'coordenacao' };
const PROFESSOR = { id: 2, papel: 'professor' };
const MARY = { id: 3, papel: 'responsavel' };

let repos;
let relogio;
let carla;
let relatoriosGerados;
function servicos() {
  const relogioDeps = { hoje: () => relogio.hoje, agora: () => relogio.agora };
  const escola = async () => ({ nome: 'Escola de Música EMMOO' });
  const base = {
    aulas: repos.aulas,
    alunos: repos.alunos,
    usuarios: repos.usuarios,
    horarios: repos.horarios,
    feriados: repos.feriados,
    solicitacoes: repos.solicitacoes,
    diarios: repos.diarios,
    planos: repos.planos,
    mensalidades: repos.mensalidades,
    ...relogioDeps,
  };
  const reposicoes = createReposicaoService(base);
  const documentos = {
    async gerarRelatorioMensal(dados) {
      relatoriosGerados.push(dados);
      return Buffer.from('%PDF-relatorio');
    },
  };
  return {
    aulas: createAulaService({ ...base, reposicoes }),
    reposicoes,
    mensalidades: createMensalidadeService({
      ...base,
      alertas: repos.alertas,
      escola,
      mailer: { configurado: false, enviar: async () => {} },
      documentos: {},
    }),
    indicadores: createIndicadorService({ ...base, reposicoes }),
    historico: createHistoricoService(base),
    relatorios: createRelatorioService({ ...base, escola, documentos }),
  };
}

beforeEach(async () => {
  ({ repos } = await reposDaEscolaDemo({ hoje: '2026-10-07' }));
  relogio = { hoje: '2026-10-07', agora: '16:00' };
  relatoriosGerados = [];
  carla = await repos.usuarios.create({ nome: 'Carla', email: 'carla@emmoo.com.br', senhaHash: 'h', papel: 'professor' });
  await repos.alunos.update(1, { criadoEm: '2026-09-15T12:00:00.000Z' }); // matrícula em setembro: mês cheio
  await repos.alunos.update(2, { criadoEm: '2026-10-05T12:00:00.000Z' }); // em 05/10: proporcional (R$ 112,00)
});

describe('percentual de presença', () => {
  it('realizadas ÷ (realizadas + faltas); sem registro, null', () => {
    assert.equal(percentualDePresenca([]), null);
    assert.equal(percentualDePresenca([{ status: 'agendada' }, { status: 'cancelada' }]), null);
    assert.equal(percentualDePresenca([{ status: 'realizada' }, { status: 'falta' }, { status: 'realizada' }]), 67);
  });
});

describe('IndicadorService (RF13)', () => {
  it('coordenação: alunos ativos, aulas de hoje, a registrar, presença, inadimplência e o mês', async () => {
    const s = servicos();
    assert.deepEqual(await s.indicadores.doUsuario(COORDENACAO), {
      papel: 'coordenacao',
      alunosAtivos: 2,
      aulasHoje: 1,
      aRegistrar: 2, // aula 1 (segunda) e a de hoje, que já começou
      presenca: { percentual: null, dias: 30 },
      inadimplencia: { quantidade: 0, valor: 0 },
      mesAtual: { mes: '2026-10', previsto: 0, recebido: 0, geradas: 0 },
      alunosParaAgendar: [], // os dois têm aulas semanais marcadas por mais de duas semanas
    });

    await s.aulas.registrarPresenca(1, { status: 'realizada' }, PROFESSOR);
    await s.aulas.registrarPresenca(9, { status: 'falta' }, PROFESSOR);
    await s.mensalidades.gerar({ mes: '2026-10' }); // vencem em 12/10
    await s.mensalidades.registrarPagamento(1, { dataPagamento: '2026-10-07', formaPagamento: 'pix' });
    const depois = await s.indicadores.doUsuario(COORDENACAO);
    assert.deepEqual(
      [depois.aRegistrar, depois.presenca.percentual, depois.mesAtual],
      [0, 50, { mes: '2026-10', previsto: 252, recebido: 140, geradas: 2 }],
    );

    relogio = { hoje: '2026-10-13', agora: '08:00' };
    assert.deepEqual((await servicos().indicadores.doUsuario(COORDENACAO)).inadimplencia, { quantidade: 1, valor: 112 });
  });

  it('professor: só a própria agenda', async () => {
    assert.deepEqual(await servicos().indicadores.doUsuario(PROFESSOR), {
      papel: 'professor',
      aulasHoje: 1,
      aRegistrar: 2,
      presenca: { percentual: null, dias: 30 },
    });
    assert.deepEqual(await servicos().indicadores.doUsuario({ id: carla.id, papel: 'professor' }), {
      papel: 'professor',
      aulasHoje: 0,
      aRegistrar: 0,
      presenca: { percentual: null, dias: 30 },
    });
  });

  it('responsável: cada dependente ativo com a próxima aula, reposições e mensalidades em aberto', async () => {
    const s = servicos();
    await s.mensalidades.gerar({ mes: '2026-10' });
    assert.deepEqual(await s.indicadores.doUsuario(MARY), {
      papel: 'responsavel',
      dependentes: [
        {
          aluno: { id: 1, nome: 'Ana Beatriz', instrumento: 'Violino' },
          proximaAula: { id: 2, data: '2026-10-12', hora: '14:00' },
          reposicoesDisponiveis: 0,
          mensalidades: { emAberto: 1, valor: 140, atrasadas: 0 },
        },
      ],
    });

    await s.aulas.avisarFalta(2, MARY);
    const [ana] = (await s.indicadores.doUsuario(MARY)).dependentes;
    assert.deepEqual([ana.proximaAula.id, ana.reposicoesDisponiveis], [3, 1]); // a aula com falta avisada não é a próxima

    await repos.alunos.update(1, { status: 'inativo' });
    assert.deepEqual(await s.indicadores.doUsuario(MARY), { papel: 'responsavel', dependentes: [] });
  });
});

describe('HistoricoService (RF14)', () => {
  it('coordenação: aulas com presença e diário, próximas, reposições, avisos e mensalidades', async () => {
    const s = servicos();
    await s.aulas.registrarPresenca(1, { status: 'realizada' }, PROFESSOR);
    await s.aulas.salvarDiario(1, { conteudoMinistrado: 'Escalas maiores', planoProxima: 'Arpejos' }, PROFESSOR);
    relogio = { hoje: '2026-10-07', agora: '08:00' };
    await s.aulas.avisarFalta(2, MARY);
    const { aula: reposicao } = await s.reposicoes.solicitar({ aulaId: 2, data: '2026-10-14', hora: '14:00' }, MARY);
    await s.mensalidades.gerar({ mes: '2026-10' });

    const historico = await s.historico.doAluno('1', COORDENACAO);
    assert.deepEqual(historico.aluno, {
      id: 1,
      nome: 'Ana Beatriz',
      instrumento: 'Violino',
      status: 'ativo',
      contato: '(47) 99999-0001',
      plano: { id: 1, nome: 'Particular · 1 aula por semana' },
      responsavel: { id: 3, nome: 'Mary' },
    });
    assert.deepEqual(historico.resumo, {
      presencas: 1,
      faltas: 1,
      percentual: 50,
      reposicoes: 1,
      emAberto: { quantidade: 1, valor: 140 },
    });
    assert.deepEqual(historico.aulas.map((aula) => [aula.id, aula.status]), [[2, 'falta'], [1, 'realizada']]); // mais recente primeiro
    assert.deepEqual(historico.aulas[1].diario, { conteudoMinistrado: 'Escalas maiores', planoProxima: 'Arpejos' });
    assert.equal(historico.aulas[0].diario, null);
    // As 5 próximas, em ordem de data: a reposição (14/10) e as segundas seguintes.
    assert.deepEqual(historico.proximas.map((aula) => [aula.id, aula.data]), [
      [reposicao.id, '2026-10-14'],
      [3, '2026-10-19'],
      [4, '2026-10-26'],
      [5, '2026-11-02'],
      [6, '2026-11-09'],
    ]);
    assert.equal(historico.proximas[0].reposicao, true);
    assert.deepEqual(historico.reposicoes, [
      {
        aula: { id: reposicao.id, data: '2026-10-14', hora: '14:00', duracaoMin: 45, status: 'agendada' },
        de: { id: 2, data: '2026-10-12', hora: '14:00', duracaoMin: 45, status: 'falta' },
      },
    ]);
    assert.deepEqual(
      historico.solicitacoes.map((pedido) => [pedido.tipo, pedido.aula?.id, pedido.liberaReposicao, pedido.novaData]),
      [
        ['reposicao', 2, false, '2026-10-14T14:00'],
        ['falta', 2, true, null],
      ],
    );
    assert.deepEqual(historico.mensalidades, [
      {
        id: 1,
        mesReferencia: '2026-10',
        valor: 140,
        vencimento: '2026-10-12',
        status: 'pendente',
        dataPagamento: null,
        formaPagamentoNome: null,
        valorOriginal: null,
        numeroRecibo: null,
      },
    ]);
  });

  it('professor: só as próprias aulas com o aluno, sem contato nem financeiro', async () => {
    const s = servicos();
    await s.mensalidades.gerar({ mes: '2026-10' });
    const historico = await s.historico.doAluno(1, PROFESSOR);
    assert.equal(historico.aluno.contato, undefined);
    assert.equal(historico.resumo.emAberto, undefined);
    assert.deepEqual(historico.mensalidades, []);
    await assert.rejects(s.historico.doAluno(1, { id: carla.id, papel: 'professor' }), ForbiddenError);
  });

  it('responsável: só dos dependentes, sem revelar os outros alunos', async () => {
    const s = servicos();
    assert.equal((await s.historico.doAluno(1, MARY)).aluno.nome, 'Ana Beatriz');
    await assert.rejects(s.historico.doAluno(2, MARY), NotFoundError);
    await assert.rejects(s.historico.doAluno(999, COORDENACAO), NotFoundError);
    await assert.rejects(s.historico.doAluno('x', COORDENACAO), ValidationError);
  });
});

describe('RelatorioService (RF15)', () => {
  it('relatório mensal: financeiro e presença por aluno', async () => {
    const s = servicos();
    await s.mensalidades.gerar({ mes: '2026-10' });
    await s.mensalidades.registrarPagamento(1, { dataPagamento: '2026-10-07', formaPagamento: 'pix' });
    await s.aulas.registrarPresenca(1, { status: 'realizada' }, PROFESSOR);
    await s.aulas.registrarPresenca(9, { status: 'falta' }, PROFESSOR);
    await repos.aulas.update(3, { status: 'cancelada', motivoCancelamento: 'manual' });

    const relatorio = await s.relatorios.mensal({ mes: '2026-10' });
    assert.deepEqual(
      [relatorio.escola, relatorio.mes, relatorio.mesNome, relatorio.geradoEm],
      ['Escola de Música EMMOO', '2026-10', 'outubro de 2026', '07/10/2026 às 16:00'],
    );
    assert.deepEqual(relatorio.financeiro, {
      previsto: 252,
      recebido: 140,
      emAberto: 112,
      atrasado: 0,
      quantidade: { paga: 1, pendente: 1, atrasada: 0, cancelada: 0 },
    });
    const comum = { valorOriginal: null, observacao: null };
    assert.deepEqual(relatorio.mensalidades, [
      {
        aluno: 'Ana Beatriz',
        responsavel: 'Mary',
        vencimento: '2026-10-12',
        valor: 140,
        situacao: 'Paga',
        dataPagamento: '2026-10-07',
        formaPagamento: 'Pix',
        numeroRecibo: 1,
        ...comum,
      },
      {
        aluno: 'Pedro Henrique',
        responsavel: null,
        vencimento: '2026-10-12',
        valor: 112,
        situacao: 'Pendente',
        dataPagamento: null,
        formaPagamento: null,
        numeroRecibo: null,
        ...comum,
      },
    ]);
    assert.deepEqual(relatorio.presenca, {
      percentual: 50,
      porAluno: [
        { aluno: 'Ana Beatriz', aulas: 3, presencas: 1, faltas: 0, reposicoes: 0, percentual: 100 }, // 05, 12 e 26/10 (19/10 cancelada)
        { aluno: 'Pedro Henrique', aulas: 4, presencas: 0, faltas: 1, reposicoes: 0, percentual: 0 },
      ],
    });

    relogio = { hoje: '2026-10-13', agora: '09:30' };
    const depois = await servicos().relatorios.mensal({});
    assert.deepEqual([depois.mes, depois.financeiro.atrasado, depois.mensalidades[1].situacao], ['2026-10', 112, 'Atrasada']);
    assert.deepEqual((await servicos().relatorios.mensal({ mes: '2026-08' })).mensalidades, []);
    await assert.rejects(servicos().relatorios.mensal({ mes: '2026-13' }), ValidationError);
  });

  it('PDF do relatório com o nome do mês no arquivo', async () => {
    const { arquivo, conteudo } = await servicos().relatorios.pdf({ mes: '2026-10' });
    assert.equal(arquivo, 'relatorio-2026-10.pdf');
    assert.equal(conteudo.toString(), '%PDF-relatorio');
    assert.equal(relatoriosGerados[0].mesNome, 'outubro de 2026');
  });
});

describe('alunos para agendar (fim da série de aulas)', () => {
  it('próxima semana no mesmo dia e horário, de hoje em diante', () => {
    const ultima = { data: '2026-11-23', hora: '14:00' };
    assert.equal(proximaDataSemanal(ultima, { hoje: '2026-11-12', agora: '10:00' }), '2026-11-30');
    assert.equal(proximaDataSemanal(ultima, { hoje: '2026-11-30', agora: '13:59' }), '2026-11-30');
    assert.equal(proximaDataSemanal(ultima, { hoje: '2026-11-30', agora: '14:00' }), '2026-12-07');
    assert.equal(proximaDataSemanal({ data: '2026-08-03', hora: '09:00' }, { hoje: '2026-11-12', agora: '10:00' }), '2026-11-16');
  });

  it('quem termina nas próximas 2 semanas e quem ficou sem aula, com a sugestão para renovar', async () => {
    relogio = { hoje: '2026-11-12', agora: '10:00' }; // Ana: última em 23/11; Pedro: em 25/11
    const terminando = (await servicos().indicadores.doUsuario(COORDENACAO)).alunosParaAgendar;
    assert.deepEqual(terminando, [
      {
        aluno: { id: 1, nome: 'Ana Beatriz', instrumento: 'Violino' },
        situacao: 'terminando',
        ultimaAula: { id: 8, data: '2026-11-23', hora: '14:00', professorId: 2 },
        sugestao: { data: '2026-11-30', hora: '14:00', professorId: 2 },
      },
      {
        aluno: { id: 2, nome: 'Pedro Henrique', instrumento: 'Violão' },
        situacao: 'terminando',
        ultimaAula: { id: 16, data: '2026-11-25', hora: '15:30', professorId: 2 },
        sugestao: { data: '2026-12-02', hora: '15:30', professorId: 2 },
      },
    ]);

    // Aluno novo, sem nenhuma aula; o Pedro inativo sai da lista; a última da Ana já passou.
    const novo = await repos.alunos.create({ nome: 'Bruna', contato: 'x', instrumento: 'Piano', planoId: 1, usuarioRespId: null, status: 'ativo' });
    await repos.alunos.update(2, { status: 'inativo' });
    await repos.aulas.update(8, { status: 'cancelada', motivoCancelamento: 'manual' }); // a de 23/11 não conta
    relogio = { hoje: '2026-11-17', agora: '15:00' };
    const semAulas = (await servicos().indicadores.doUsuario(COORDENACAO)).alunosParaAgendar;
    assert.deepEqual(
      semAulas.map((item) => [item.aluno.nome, item.situacao, item.ultimaAula?.data ?? null, item.sugestao?.data ?? null]),
      [
        ['Bruna', 'sem_aulas', null, null], // nunca teve aula: a mais tempo sem, primeiro
        ['Ana Beatriz', 'sem_aulas', '2026-11-16', '2026-11-23'],
      ],
    );
    assert.equal(semAulas[0].aluno.id, novo.id);
  });
});
