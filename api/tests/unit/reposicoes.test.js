import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  avaliarReposicao,
  avisoNoPrazo,
  dataNoPrazoDaReposicao,
  horasAteAAula,
  origemDaReposicao,
  prazoDaReposicao,
} from '../../src/domain/reposicoes.js';
import { createAulaService } from '../../src/modules/aulas/aula.service.js';
import { createHorarioService } from '../../src/modules/horarios/horario.service.js';
import { createReposicaoService } from '../../src/modules/reposicoes/reposicao.service.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../src/shared/errors.js';
import { reposDaEscolaDemo } from '../helpers/fakes.js';

describe('regras de falta e reposição (RF06, RF07, RN05, RN11, RN12)', () => {
  const aula = { data: '2026-10-12', hora: '14:00' };

  it('RN05 — aviso com pelo menos 24 horas de antecedência', () => {
    assert.equal(horasAteAAula(aula, { hoje: '2026-10-11', agora: '14:00' }), 24);
    assert.equal(horasAteAAula(aula, { hoje: '2026-10-12', agora: '15:30' }), -1.5);
    assert.equal(avisoNoPrazo(aula, { hoje: '2026-10-11', agora: '14:00' }), true);
    assert.equal(avisoNoPrazo(aula, { hoje: '2026-10-11', agora: '14:01' }), false);
  });

  it('dá direito: falta avisada (pelo prazo do aviso) e aula cancelada pela escola', () => {
    const falta = { ...aula, status: 'falta' };
    assert.deepEqual(origemDaReposicao(falta, { liberaReposicao: true }), { motivo: 'falta_aluno', avisoNoPrazo: true });
    assert.deepEqual(origemDaReposicao(falta, { liberaReposicao: false }), { motivo: 'falta_aluno', avisoNoPrazo: false });
    assert.equal(origemDaReposicao(falta), null); // falta registrada pelo professor, sem aviso
    const cancelada = { ...aula, status: 'cancelada' };
    assert.deepEqual(origemDaReposicao({ ...cancelada, motivoCancelamento: 'manual' }), {
      motivo: 'cancelamento_professor',
      avisoNoPrazo: true,
    });
    assert.equal(origemDaReposicao({ ...cancelada, motivoCancelamento: null }).motivo, 'cancelamento_professor');
    assert.equal(origemDaReposicao({ ...cancelada, motivoCancelamento: 'feriado' }), null);
    assert.equal(origemDaReposicao({ ...cancelada, motivoCancelamento: 'inativacao' }), null);
    assert.equal(origemDaReposicao({ ...aula, status: 'realizada' }), null);
    assert.equal(origemDaReposicao({ ...aula, status: 'agendada' }), null);
  });

  it('a própria reposição não gera outra reposição', () => {
    assert.equal(origemDaReposicao({ ...aula, status: 'cancelada', motivoCancelamento: 'manual', reposicaoDeId: 3 }), null);
    assert.equal(origemDaReposicao({ ...aula, status: 'falta', reposicaoDeId: 3 }, { liberaReposicao: true }), null);
  });

  it('RN11 — prazo de 30 dias, contado a partir do dia da aula perdida', () => {
    assert.equal(prazoDaReposicao(aula), '2026-11-11');
    assert.equal(dataNoPrazoDaReposicao(aula, '2026-10-12'), true);
    assert.equal(dataNoPrazoDaReposicao(aula, '2026-11-11'), true);
    assert.equal(dataNoPrazoDaReposicao(aula, '2026-11-12'), false);
    assert.equal(dataNoPrazoDaReposicao(aula, '2026-10-11'), false);
  });

  it('RN11/RN12 — limite mensal só para faltas; prazo vencido bloqueia tudo', () => {
    const falta = { motivo: 'falta_aluno', avisoNoPrazo: true };
    const cancelamento = { motivo: 'cancelamento_professor', avisoNoPrazo: true };
    const contexto = { reposicoesNoMes: 0, prazoAte: '2026-11-11', hoje: '2026-10-20' };
    assert.deepEqual(avaliarReposicao(falta, contexto), { permitido: true, contaNoLimite: true, bloqueio: null });
    assert.deepEqual(avaliarReposicao(falta, { ...contexto, reposicoesNoMes: 1 }), {
      permitido: false,
      contaNoLimite: true,
      bloqueio: 'LIMITE_MENSAL_ATINGIDO',
    });
    assert.equal(avaliarReposicao({ ...falta, avisoNoPrazo: false }, contexto).bloqueio, 'AVISO_FORA_DO_PRAZO');
    assert.deepEqual(avaliarReposicao(cancelamento, { ...contexto, reposicoesNoMes: 3 }), {
      permitido: true,
      contaNoLimite: false,
      bloqueio: null,
    });
    assert.equal(avaliarReposicao(cancelamento, { ...contexto, hoje: '2026-11-12' }).bloqueio, 'PRAZO_ENCERRADO');
  });
});

// Seed com HOJE = quarta 07/10/2026. Ana (responsável Mary): segundas 14:00 — aulas 1 (05/10), 2 (12/10), 3 (19/10),
// 4 (26/10), 5 (02/11)… Pedro (sem responsável): quartas 15:30 — aulas 9 (07/10), 10 (14/10)… Professor Luiz (id 2)
// atende segundas e quartas às 14:00, 14:45, 15:30 e 16:15 (45 min).
const COORDENACAO = { id: 1, papel: 'coordenacao' };
const PROFESSOR = { id: 2, papel: 'professor' };
const MARY = { id: 3, papel: 'responsavel' };

let repos;
let relogio;
let carla;
function servicos() {
  const deps = {
    aulas: repos.aulas,
    alunos: repos.alunos,
    usuarios: repos.usuarios,
    horarios: repos.horarios,
    feriados: repos.feriados,
    solicitacoes: repos.solicitacoes,
    diarios: repos.diarios,
    hoje: () => relogio.hoje,
    agora: () => relogio.agora,
  };
  const reposicoes = createReposicaoService(deps);
  return {
    reposicoes,
    aulas: createAulaService({ ...deps, planos: repos.planos, reposicoes }),
    horarios: createHorarioService(deps),
  };
}

beforeEach(async () => {
  ({ repos } = await reposDaEscolaDemo({ hoje: '2026-10-07' }));
  relogio = { hoje: '2026-10-07', agora: '08:00' };
  carla = await repos.usuarios.create({ nome: 'Carla', email: 'carla@emmoo.com.br', senhaHash: 'h', papel: 'professor' });
});

describe('AulaService — aviso de falta, presença e diário (RF06, RF08, RF09)', () => {
  it('RF06 — aviso com 24h ou mais libera reposição e deixa o horário livre', async () => {
    const { aulas, horarios } = servicos();
    const resultado = await aulas.avisarFalta('2', MARY);
    assert.deepEqual([resultado.liberaReposicao, resultado.horasDeAntecedencia], [true, 126]);
    assert.deepEqual(
      [resultado.aula.status, resultado.aula.faltaAvisada, resultado.aula.liberaReposicao],
      ['falta', true, true],
    );
    const [aviso] = await repos.solicitacoes.list({ tipo: 'falta' });
    assert.deepEqual(
      [aviso.alunoId, aviso.aulaId, aviso.status, aviso.liberaReposicao],
      [1, 2, 'aprovada', true],
    );
    await assert.rejects(aulas.avisarFalta(2, MARY), {
      name: ConflictError.name,
      message: 'Só é possível avisar falta de uma aula agendada.',
    });
    const vagas = await horarios.livres({ inicio: '2026-10-12', fim: '2026-10-12', professorId: '2' }, COORDENACAO);
    assert.deepEqual(vagas.map((vaga) => vaga.hora), ['14:00', '14:45', '15:30', '16:15']);
  });

  it('RF06 — aviso com menos de 24h fica registrado, mas não dá reposição', async () => {
    relogio = { hoje: '2026-10-11', agora: '15:00' };
    const { aulas, reposicoes } = servicos();
    const resultado = await aulas.avisarFalta(2, MARY);
    assert.deepEqual([resultado.liberaReposicao, resultado.horasDeAntecedencia], [false, 23]);
    const [credito] = await reposicoes.disponiveis({}, MARY);
    assert.deepEqual(
      [credito.aula.id, credito.motivo, credito.permitido, credito.bloqueio],
      [2, 'falta_avisada', false, 'AVISO_FORA_DO_PRAZO'],
    );
    assert.match(credito.mensagem, /menos de 24 horas/);
  });

  it('RF06 — não avisa falta de aula que já começou nem de quem não é dependente', async () => {
    await assert.rejects(servicos().aulas.avisarFalta(9, MARY), NotFoundError); // aula do Pedro
    await assert.rejects(servicos().aulas.avisarFalta(999, MARY), NotFoundError);
    relogio = { hoje: '2026-10-12', agora: '14:00' };
    await assert.rejects(servicos().aulas.avisarFalta(2, MARY), {
      name: ConflictError.name,
      message: 'Esta aula já começou: a falta é registrada pelo professor.',
    });
    relogio = { hoje: '2026-10-07', agora: '08:00' };
    assert.equal((await servicos().aulas.avisarFalta(10, COORDENACAO)).aula.status, 'falta'); // a coordenação avisa por qualquer aluno
  });

  it('RF08 — presença a partir do início da aula, pelo professor da aula ou pela coordenação', async () => {
    const { aulas } = servicos();
    assert.equal((await aulas.registrarPresenca('1', { status: 'realizada' }, PROFESSOR)).status, 'realizada');
    assert.equal((await aulas.registrarPresenca(1, { status: 'falta' }, COORDENACAO)).status, 'falta');
    await assert.rejects(aulas.registrarPresenca(2, { status: 'realizada' }, PROFESSOR), (erro) => {
      assert.ok(erro instanceof ValidationError);
      assert.deepEqual(erro.details, [{ campo: 'status', mensagem: 'A presença é registrada a partir do início da aula.' }]);
      return true;
    });
    await assert.rejects(aulas.registrarPresenca(1, { status: 'cancelada' }, PROFESSOR), ValidationError);
    await assert.rejects(aulas.registrarPresenca(1, { status: 'realizada' }, { id: carla.id, papel: 'professor' }), ForbiddenError);
    await repos.aulas.update(1, { status: 'cancelada', motivoCancelamento: 'manual' });
    await assert.rejects(aulas.registrarPresenca(1, { status: 'realizada' }, PROFESSOR), {
      name: ConflictError.name,
      message: 'Aula cancelada não tem presença.',
    });
  });

  it('RF08 — a falta que já tem reposição só vira presença depois de cancelar a reposição', async () => {
    await servicos().aulas.avisarFalta(2, MARY);
    const { aula: reposicao } = await servicos().reposicoes.solicitar({ aulaId: 2, data: '2026-10-14', hora: '14:00' }, MARY);
    relogio = { hoje: '2026-10-12', agora: '15:00' };
    const { aulas } = servicos();
    await assert.rejects(aulas.registrarPresenca(2, { status: 'realizada' }, PROFESSOR), /já tem reposição marcada/);
    assert.equal((await aulas.registrarPresenca(2, { status: 'falta' }, PROFESSOR)).status, 'falta');
    await repos.aulas.update(reposicao.id, { status: 'cancelada', motivoCancelamento: 'manual' });
    assert.equal((await aulas.registrarPresenca(2, { status: 'realizada' }, PROFESSOR)).status, 'realizada');
  });

  it('RF09 — diário da aula; a aula seguinte mostra o plano deixado na anterior', async () => {
    const { aulas } = servicos();
    const diario = await aulas.salvarDiario(1, { conteudoMinistrado: '  Escalas maiores ', planoProxima: '' }, PROFESSOR);
    assert.deepEqual(diario, { aulaId: 1, conteudoMinistrado: 'Escalas maiores', planoProxima: null });
    assert.equal((await aulas.detalhe(2, PROFESSOR)).planoAnterior, null); // sem plano, nada a continuar

    await aulas.salvarDiario('1', { conteudoMinistrado: 'Escalas maiores', planoProxima: 'Arpejos em ré' }, COORDENACAO);
    assert.equal((await repos.diarios.list()).length, 1); // atualiza, não duplica
    assert.deepEqual((await aulas.detalhe(2, PROFESSOR)).planoAnterior, {
      aula: { id: 1, data: '2026-10-05', hora: '14:00', duracaoMin: 45, status: 'agendada' },
      planoProxima: 'Arpejos em ré',
    });
    assert.deepEqual((await aulas.detalhe(1, PROFESSOR)).diario, { conteudoMinistrado: 'Escalas maiores', planoProxima: 'Arpejos em ré' });
    const semana = await aulas.listar({ inicio: '2026-10-05', fim: '2026-10-11' }, PROFESSOR);
    assert.deepEqual(semana.map((aula) => [aula.id, aula.temDiario]), [[1, true], [9, false]]);
  });

  it('RF09 — valida o diário e só o aceita a partir do início da aula', async () => {
    const { aulas } = servicos();
    await assert.rejects(aulas.salvarDiario(1, { conteudoMinistrado: 'ok' }, PROFESSOR), (erro) => {
      assert.deepEqual(erro.details.map((d) => d.campo), ['conteudoMinistrado']);
      return true;
    });
    await assert.rejects(
      aulas.salvarDiario(1, { conteudoMinistrado: 'x'.repeat(5001), planoProxima: 'y'.repeat(5001) }, PROFESSOR),
      (erro) => {
        assert.deepEqual(erro.details.map((d) => d.campo), ['conteudoMinistrado', 'planoProxima']);
        return true;
      },
    );
    await assert.rejects(aulas.salvarDiario(2, { conteudoMinistrado: 'Escalas' }, PROFESSOR), ValidationError);
    await assert.rejects(aulas.salvarDiario(1, { conteudoMinistrado: 'Escalas' }, { id: carla.id, papel: 'professor' }), ForbiddenError);
    await repos.aulas.update(1, { status: 'cancelada' });
    await assert.rejects(aulas.salvarDiario(1, { conteudoMinistrado: 'Escalas' }, PROFESSOR), /cancelada não tem diário/);
  });

  it('detalhe: o que cada papel pode fazer com a aula agora', async () => {
    const { aulas } = servicos();
    const passada = await aulas.detalhe(1, PROFESSOR);
    assert.deepEqual(passada.acoes, {
      registrar: true,
      cancelar: false,
      remarcar: false,
      avisarFalta: false,
      solicitarReposicao: false,
    });
    assert.equal(passada.horasAteAAula, -42);
    assert.deepEqual([passada.diario, passada.avisoFalta, passada.reposicaoDe, passada.reposicaoMarcada], [null, null, null, null]);

    const daMary = await aulas.detalhe(2, MARY);
    assert.deepEqual(daMary.acoes, {
      registrar: false,
      cancelar: false,
      remarcar: false,
      avisarFalta: true,
      solicitarReposicao: false,
    });
    assert.equal(daMary.horasAteAAula, 126);
    assert.deepEqual((await aulas.detalhe(2, COORDENACAO)).acoes, {
      registrar: false,
      cancelar: true,
      remarcar: true,
      avisarFalta: true,
      solicitarReposicao: false,
    });
    await assert.rejects(aulas.detalhe(9, MARY), NotFoundError);
    await assert.rejects(aulas.detalhe(1, { id: carla.id, papel: 'professor' }), ForbiddenError);
    await assert.rejects(aulas.detalhe('abc', COORDENACAO), ValidationError);

    await aulas.avisarFalta(2, MARY);
    const comFalta = await aulas.detalhe(2, MARY);
    assert.equal(comFalta.avisoFalta.liberaReposicao, true);
    assert.ok(comFalta.avisoFalta.dataSolicitacao);
    assert.deepEqual(comFalta.reposicaoPossivel, {
      permitido: true,
      bloqueio: null,
      mensagem: null,
      prazoAte: '2026-11-11',
      contaNoLimite: true,
    });
    assert.equal(comFalta.acoes.solicitarReposicao, true);
    assert.equal(comFalta.acoes.avisarFalta, false);
    assert.equal((await aulas.detalhe(2, PROFESSOR)).reposicaoPossivel, null); // reposição é assunto da família e da coordenação
  });
});

describe('ReposicaoService (RF07, RN04–RN06, RN11, RN12)', () => {
  it('falta avisada no prazo: escolhe uma vaga do mesmo professor e a reposição é marcada', async () => {
    const { aulas, reposicoes } = servicos();
    await aulas.avisarFalta(2, MARY);
    const [credito] = await reposicoes.disponiveis({}, MARY);
    assert.deepEqual(
      [credito.aula.id, credito.aula.aluno.nome, credito.motivo, credito.prazoAte, credito.contaNoLimite, credito.permitido, credito.mensagem],
      [2, 'Ana Beatriz', 'falta_avisada', '2026-11-11', true, true, null],
    );

    const { prazoAte, vagas } = await reposicoes.vagas('2', MARY);
    assert.equal(prazoAte, '2026-11-11');
    assert.deepEqual(vagas[0], { data: '2026-10-12', hora: '14:45', duracaoMin: 45 }); // o horário da própria falta fica de fora
    assert.ok(vagas.every((vaga) => vaga.data >= '2026-10-12' && vaga.data <= '2026-11-11'));
    assert.ok(!vagas.some((vaga) => vaga.data === '2026-10-14' && vaga.hora === '15:30')); // aula do Pedro

    const { aula, reposicaoDe } = await reposicoes.solicitar({ aulaId: '2', data: '2026-10-14', hora: '14:00' }, MARY);
    assert.deepEqual(
      [aula.alunoId, aula.professorId, aula.data, aula.hora, aula.duracaoMin, aula.status, aula.reposicaoDeId, aula.reposicao],
      [1, 2, '2026-10-14', '14:00', 45, 'agendada', 2, true],
    );
    assert.deepEqual(reposicaoDe, { id: 2, data: '2026-10-12', hora: '14:00', duracaoMin: 45, status: 'falta' });
    const [pedido] = await repos.solicitacoes.list({ tipo: 'reposicao' });
    assert.deepEqual([pedido.aulaId, pedido.status, pedido.novaData], [2, 'aprovada', '2026-10-14T14:00']);

    assert.deepEqual(await reposicoes.disponiveis({}, MARY), []);
    await assert.rejects(reposicoes.solicitar({ aulaId: 2, data: '2026-10-14', hora: '14:45' }, MARY), {
      name: ConflictError.name,
      message: 'Esta aula já tem reposição marcada.',
    });
    assert.equal((await aulas.detalhe(2, MARY)).reposicaoMarcada.id, aula.id);
    assert.equal((await aulas.detalhe(aula.id, MARY)).reposicaoDe.id, 2);
    assert.deepEqual(await repos.mensalidades.list(), []); // RN06: reposição não gera cobrança
  });

  it('horário ocupado ou fora da grade: bloqueia e sugere horários livres no prazo', async () => {
    const { aulas, reposicoes } = servicos();
    await aulas.avisarFalta(2, MARY);
    const esperado = (erro) => {
      assert.ok(erro instanceof ConflictError);
      assert.equal(erro.message, 'Horário indisponível.');
      assert.deepEqual(erro.details, [
        {
          campo: 'hora',
          mensagem: 'Este horário não está livre. Horários livres no prazo: 12/10/2026 às 14:45, 12/10/2026 às 15:30, 12/10/2026 às 16:15.',
        },
      ]);
      return true;
    };
    await assert.rejects(reposicoes.solicitar({ aulaId: 2, data: '2026-10-14', hora: '15:30' }, MARY), esperado); // aula do Pedro
    await assert.rejects(reposicoes.solicitar({ aulaId: 2, data: '2026-10-12', hora: '14:00' }, MARY), esperado); // a própria falta
    await assert.rejects(reposicoes.solicitar({ aulaId: 2, data: '2026-10-13', hora: '10:00' }, MARY), esperado); // terça: sem atendimento
  });

  it('sem nenhuma vaga no prazo, diz isso em vez de sugerir', async () => {
    const { aulas, reposicoes } = servicos();
    await aulas.avisarFalta(2, MARY);
    for (const horario of await repos.horarios.list()) await repos.horarios.remove(horario.id);
    await assert.rejects(reposicoes.solicitar({ aulaId: 2, data: '2026-10-14', hora: '14:00' }, MARY), (erro) => {
      assert.equal(erro.details[0].mensagem, 'Este horário não está livre e não há outro horário livre do professor dentro do prazo.');
      return true;
    });
  });

  it('RN11 — entre o dia da aula perdida e 30 dias depois; nunca no passado nem em feriado', async () => {
    const { aulas, reposicoes } = servicos();
    await aulas.avisarFalta(2, MARY);
    for (const data of ['2026-11-12', '2026-10-08']) {
      await assert.rejects(reposicoes.solicitar({ aulaId: 2, data, hora: '14:00' }, MARY), (erro) => {
        assert.deepEqual(erro.details, [{ campo: 'data', mensagem: 'Escolha uma data entre 12/10/2026 e 11/11/2026.' }]);
        return true;
      });
    }
    await repos.feriados.create({ descricao: 'Recesso', inicio: '2026-10-14', fim: '2026-10-14' });
    await assert.rejects(reposicoes.solicitar({ aulaId: 2, data: '2026-10-14', hora: '14:00' }, MARY), (erro) => {
      assert.deepEqual(erro.details, [{ campo: 'data', mensagem: 'Não há aula neste dia (feriado ou recesso da escola).' }]);
      return true;
    });
    assert.ok(!(await reposicoes.vagas(2, MARY)).vagas.some((vaga) => vaga.data === '2026-10-14'));

    relogio = { hoje: '2026-10-12', agora: '15:00' };
    await assert.rejects(servicos().reposicoes.solicitar({ aulaId: 2, data: '2026-10-12', hora: '14:45' }, MARY), (erro) => {
      assert.deepEqual(erro.details, [{ campo: 'hora', mensagem: 'Este horário já passou.' }]);
      return true;
    });
    await assert.rejects(reposicoes.solicitar({}, MARY), (erro) => {
      assert.deepEqual(erro.details.map((d) => d.campo), ['aulaId', 'data', 'hora']);
      return true;
    });
  });

  it('RN11 — uma reposição por mês para as faltas: a segunda falta do mês fica bloqueada', async () => {
    const { aulas, reposicoes } = servicos();
    await aulas.avisarFalta(2, MARY);
    await aulas.avisarFalta(3, MARY);
    await reposicoes.solicitar({ aulaId: 2, data: '2026-10-14', hora: '14:00' }, MARY);
    const [segunda] = await reposicoes.disponiveis({}, MARY);
    assert.deepEqual(
      [segunda.aula.id, segunda.permitido, segunda.bloqueio, segunda.mensagem],
      [3, false, 'LIMITE_MENSAL_ATINGIDO', 'O limite de 1 reposição por mês já foi usado para as faltas deste mês.'],
    );
    await assert.rejects(reposicoes.solicitar({ aulaId: 3, data: '2026-10-21', hora: '14:00' }, MARY), {
      message: 'O limite de 1 reposição por mês já foi usado para as faltas deste mês.',
    });
    assert.deepEqual(await reposicoes.vagas(3, MARY), { prazoAte: '2026-11-18', vagas: [] });
    const bloqueada = await aulas.detalhe(3, MARY);
    assert.deepEqual(
      [bloqueada.acoes.solicitarReposicao, bloqueada.reposicaoPossivel.mensagem],
      [false, 'O limite de 1 reposição por mês já foi usado para as faltas deste mês.'],
    );

    await aulas.avisarFalta(5, MARY); // 02/11: outro mês, outro limite
    const novembro = (await reposicoes.disponiveis({}, MARY)).find((credito) => credito.aula.id === 5);
    assert.equal(novembro.permitido, true);
  });

  it('RN12 — aula cancelada pela escola dá reposição sem contar no limite; feriado e inativação não', async () => {
    const { aulas, reposicoes } = servicos();
    await aulas.avisarFalta(2, MARY);
    await reposicoes.solicitar({ aulaId: 2, data: '2026-10-14', hora: '14:00' }, MARY); // limite de outubro usado
    await aulas.cancelar(3, COORDENACAO);
    const [credito] = await reposicoes.disponiveis({}, MARY);
    assert.deepEqual(
      [credito.aula.id, credito.motivo, credito.contaNoLimite, credito.permitido],
      [3, 'aula_cancelada', false, true],
    );
    assert.equal((await reposicoes.solicitar({ aulaId: 3, data: '2026-10-21', hora: '14:00' }, MARY)).aula.reposicaoDeId, 3);

    await repos.aulas.update(4, { status: 'cancelada', motivoCancelamento: 'feriado' });
    await repos.aulas.update(5, { status: 'cancelada', motivoCancelamento: 'inativacao' });
    assert.deepEqual(await reposicoes.disponiveis({}, MARY), []);
  });

  it('reposição cancelada devolve o direito à aula original; falta na reposição não gera outra', async () => {
    const { aulas, reposicoes } = servicos();
    await aulas.avisarFalta(2, MARY);
    const { aula: primeira } = await reposicoes.solicitar({ aulaId: 2, data: '2026-10-14', hora: '14:00' }, MARY);
    await aulas.cancelar(primeira.id, COORDENACAO);
    const creditos = await reposicoes.disponiveis({}, MARY);
    assert.deepEqual(creditos.map((credito) => [credito.aula.id, credito.permitido]), [[2, true]]); // só a original, sem crédito duplicado

    const { aula: segunda } = await reposicoes.solicitar({ aulaId: 2, data: '2026-10-14', hora: '14:45' }, MARY);
    const aviso = await aulas.avisarFalta(segunda.id, MARY);
    assert.equal(aviso.liberaReposicao, false);
    assert.deepEqual(await reposicoes.disponiveis({}, MARY), []);
  });

  it('explica por que não dá: aviso fora do prazo, prazo encerrado ou aula sem direito', async () => {
    relogio = { hoje: '2026-10-11', agora: '15:00' };
    await servicos().aulas.avisarFalta(2, MARY);
    await assert.rejects(servicos().reposicoes.solicitar({ aulaId: 2, data: '2026-10-14', hora: '14:00' }, MARY), /menos de 24 horas/);

    relogio = { hoje: '2026-10-07', agora: '08:00' };
    await servicos().aulas.avisarFalta(3, MARY); // 19/10, no prazo: pode repor até 18/11
    relogio = { hoje: '2026-11-19', agora: '08:00' };
    await assert.rejects(servicos().reposicoes.solicitar({ aulaId: 3, data: '2026-11-23', hora: '14:45' }, MARY), {
      message: 'O prazo de 30 dias para repor esta aula terminou.',
    });
    assert.deepEqual(await servicos().reposicoes.vagas(3, MARY), { prazoAte: null, vagas: [] });
    await assert.rejects(servicos().reposicoes.solicitar({ aulaId: 4, data: '2026-11-23', hora: '14:45' }, MARY), {
      message: 'Esta aula não dá direito a reposição.',
    });
  });

  it('RN03 — o responsável só repõe aulas dos dependentes; a coordenação, de qualquer aluno', async () => {
    const { aulas, reposicoes } = servicos();
    await aulas.avisarFalta(10, COORDENACAO); // Pedro, 14/10
    assert.deepEqual(await reposicoes.disponiveis({}, MARY), []);
    assert.deepEqual(await reposicoes.disponiveis({ alunoId: '2' }, MARY), []);
    await assert.rejects(reposicoes.solicitar({ aulaId: 10, data: '2026-10-19', hora: '14:45' }, MARY), NotFoundError);
    await assert.rejects(reposicoes.vagas(10, MARY), NotFoundError);
    await assert.rejects(reposicoes.vagas(999, COORDENACAO), NotFoundError);

    assert.deepEqual((await reposicoes.disponiveis({ alunoId: '2' }, COORDENACAO)).map((c) => c.aula.id), [10]);
    assert.deepEqual((await reposicoes.disponiveis({}, COORDENACAO)).map((c) => c.aula.id), [10]);
    const { aula } = await reposicoes.solicitar({ aulaId: 10, data: '2026-10-19', hora: '14:45' }, COORDENACAO);
    assert.equal(aula.alunoId, 2);
  });

  it('aluno inativo ou professor desativado não remarcam', async () => {
    const { aulas, reposicoes } = servicos();
    await aulas.avisarFalta(2, MARY);
    await repos.usuarios.update(2, { ativo: false });
    await assert.rejects(reposicoes.solicitar({ aulaId: 2, data: '2026-10-14', hora: '14:00' }, MARY), /acesso desativado/);
    await repos.usuarios.update(2, { ativo: true });
    await repos.alunos.update(1, { status: 'inativo' });
    await assert.rejects(reposicoes.solicitar({ aulaId: 2, data: '2026-10-14', hora: '14:00' }, COORDENACAO), (erro) => {
      assert.deepEqual(erro.details, [{ campo: 'aulaId', mensagem: 'Aluno inativo não pode ter aulas agendadas.' }]);
      return true;
    });
    assert.deepEqual(await reposicoes.disponiveis({}, MARY), []); // dependente inativo não aparece
  });

  it('RN10 — a vaga respeita as outras aulas do aluno, mesmo com outro professor', async () => {
    const { aulas, reposicoes } = servicos();
    await aulas.avisarFalta(2, MARY);
    await repos.aulas.createMany([
      { alunoId: 1, professorId: carla.id, data: '2026-10-12', hora: '14:45', duracaoMin: 45, status: 'agendada', motivoCancelamento: null },
    ]);
    assert.deepEqual((await reposicoes.vagas(2, MARY)).vagas[0], { data: '2026-10-12', hora: '15:30', duracaoMin: 45 });
    await assert.rejects(reposicoes.solicitar({ aulaId: 2, data: '2026-10-12', hora: '14:45' }, MARY), {
      message: 'Horário indisponível.',
    });
  });
});

describe('HorarioService — vagas para o responsável (RF05, RN03)', () => {
  const semana = { inicio: '2026-10-12', fim: '2026-10-18' };
  it('vê as vagas só dos professores dos dependentes', async () => {
    const { horarios } = servicos();
    const vagas = await horarios.livres({ ...semana, professorId: '2' }, MARY);
    assert.equal(vagas.length, 6); // 8 vagas − Ana (seg 14:00) − Pedro (qua 15:30)
    await assert.rejects(horarios.livres({ ...semana, professorId: String(carla.id) }, MARY), ForbiddenError);
    await assert.rejects(horarios.livres(semana, MARY), ValidationError);
    const semDependentes = await repos.usuarios.create({ nome: 'Rui', email: 'rui@x.com', senhaHash: 'h', papel: 'responsavel' });
    await assert.rejects(horarios.livres({ ...semana, professorId: '2' }, { id: semDependentes.id, papel: 'responsavel' }), ForbiddenError);
  });
});
