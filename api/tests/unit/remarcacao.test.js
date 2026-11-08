import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { createAulaService } from '../../src/modules/aulas/aula.service.js';
import { createHistoricoService } from '../../src/modules/historico/historico.service.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../src/shared/errors.js';
import { reposDaEscolaDemo } from '../helpers/fakes.js';

// Seed com HOJE = quarta 07/10/2026, 10:00: Ana às segundas 14:00 (aulas 1–8, desde 05/10)
// e Pedro às quartas 15:30 (aulas 9–16, desde 07/10), com o professor Luiz (id 2).
const COORDENACAO = { id: 1, papel: 'coordenacao' };
const PROFESSOR = { id: 2, papel: 'professor' };

let repos;
let carla;
let relogio;
beforeEach(async () => {
  ({ repos } = await reposDaEscolaDemo({ hoje: '2026-10-07' }));
  relogio = { hoje: '2026-10-07', agora: '10:00' };
  carla = await repos.usuarios.create({ nome: 'Carla', email: 'carla@emmoo.com.br', senhaHash: 'h', papel: 'professor' });
});

const aulas = () =>
  createAulaService({
    ...repos,
    reposicoes: { creditoDaAula: async () => null },
    hoje: () => relogio.hoje,
    agora: () => relogio.agora,
  });
const remarcar = (id, data, hora, usuario = COORDENACAO) => aulas().remarcar(id, { data, hora }, usuario);
const noCampo = (campo, mensagem) => (erro) => {
  assert.ok(erro instanceof ValidationError, erro.message);
  assert.equal(erro.details[0].campo, campo);
  if (mensagem) assert.match(erro.details[0].mensagem, mensagem);
  return true;
};

describe('remarcar aula (nova data e horário, a mesma aula)', () => {
  it('muda a data e a hora, registra de quando para quando e aparece no detalhe e no histórico', async () => {
    const { aula, de, mensagem } = await remarcar(2, '2026-10-13', '15:00');
    assert.deepEqual([aula.id, aula.data, aula.hora, aula.status, aula.aluno.nome], [2, '2026-10-13', '15:00', 'agendada', 'Ana Beatriz']);
    assert.deepEqual(de, { data: '2026-10-12', hora: '14:00' });
    assert.equal(mensagem, 'Aula remarcada de 12/10/2026 às 14:00 para 13/10/2026 às 15:00.');

    const [pedido] = await repos.solicitacoes.list({ aulaIds: [2], tipo: 'remarcacao' });
    assert.deepEqual(
      [pedido.status, pedido.novaData, pedido.dataAnterior, pedido.alunoId],
      ['aprovada', '2026-10-13T15:00', '2026-10-12T14:00', 1],
    );
    const detalhe = await aulas().detalhe(2, COORDENACAO);
    assert.deepEqual([detalhe.remarcadaDe.dataHora, detalhe.remarcadaDe.vezes], ['2026-10-12T14:00', 1]);
    assert.equal((await aulas().detalhe(3, COORDENACAO)).remarcadaDe, null);

    // Remarcada de novo (na mesma semana, para outro horário que sobrepõe o anterior dela mesma: sem conflito).
    await remarcar(2, '2026-10-13', '15:30');
    assert.equal((await aulas().detalhe(2, COORDENACAO)).remarcadaDe.vezes, 2);

    const historico = await createHistoricoService({ ...repos, hoje: () => relogio.hoje, agora: () => relogio.agora }).doAluno(
      1,
      COORDENACAO,
    );
    const remarcacoes = historico.solicitacoes.filter((s) => s.tipo === 'remarcacao');
    assert.deepEqual(
      remarcacoes.map((s) => [s.dataAnterior, s.novaData]),
      [
        ['2026-10-13T15:00', '2026-10-13T15:30'],
        ['2026-10-12T14:00', '2026-10-13T15:00'],
      ],
    );
  });

  it('o professor remarca as próprias aulas; não as de outro professor', async () => {
    assert.equal((await remarcar(2, '2026-10-12', '16:15', PROFESSOR)).aula.hora, '16:15');
    await assert.rejects(remarcar(3, '2026-10-20', '14:00', { id: carla.id, papel: 'professor' }), ForbiddenError);
  });

  it('recusa o mesmo horário, data no passado, hora de hoje que já passou e dados inválidos', async () => {
    await assert.rejects(remarcar(2, '2026-10-12', '14:00'), noCampo('hora', /diferente do atual/));
    await assert.rejects(remarcar(2, '2026-10-06', '14:00'), noCampo('data', /a partir de hoje/));
    await assert.rejects(remarcar(2, '2026-10-07', '09:00'), noCampo('hora', /já passou/));
    await assert.rejects(remarcar(2, '2026-02-30', '14:00'), noCampo('data'));
    await assert.rejects(remarcar(2, '2026-10-13', '25:00'), noCampo('hora'));
    await assert.rejects(remarcar(999, '2026-10-13', '15:00'), NotFoundError);
  });

  it('só aula agendada que ainda não começou', async () => {
    relogio = { hoje: '2026-10-07', agora: '16:00' }; // a aula 9 (hoje, 15:30) já começou
    await assert.rejects(remarcar(9, '2026-10-08', '15:30'), { name: ConflictError.name, message: /já começou/ });
    await repos.aulas.update(3, { status: 'cancelada', motivoCancelamento: 'manual' });
    await assert.rejects(remarcar(3, '2026-10-20', '15:00'), { message: 'Apenas aulas agendadas podem ser remarcadas.' });
  });

  it('não pode conflitar com outra aula do professor (RN09) nem do aluno (RN10)', async () => {
    // Quarta 14/10 às 15:30 o professor Luiz já tem a aula do Pedro.
    await assert.rejects(remarcar(2, '2026-10-14', '15:45'), (erro) => {
      assert.equal(erro.message, 'Conflito de agenda.');
      assert.match(erro.details[0].mensagem, /14\/10\/2026 às 15:45: o professor já tem aula das 15:30/);
      return true;
    });
    // A Ana tem aula com a Carla na terça 13/10 às 15:00.
    await repos.aulas.createMany([
      { alunoId: 1, professorId: carla.id, data: '2026-10-13', hora: '15:00', duracaoMin: 45, status: 'agendada', motivoCancelamento: null },
    ]);
    await assert.rejects(remarcar(2, '2026-10-13', '15:30'), (erro) => {
      assert.match(erro.details[0].mensagem, /o aluno já tem aula das 15:00/);
      return true;
    });
  });

  it('não remarca para feriado nem com o professor desativado', async () => {
    await repos.feriados.create({ descricao: 'Dia do Professor', inicio: '2026-10-15', fim: '2026-10-15' });
    await assert.rejects(remarcar(2, '2026-10-15', '14:00'), noCampo('data', /"Dia do Professor": não há aula/));
    await repos.usuarios.update(2, { ativo: false });
    await assert.rejects(remarcar(2, '2026-10-13', '14:00'), noCampo('professorId', /desativado/));
  });

  it('a reposição remarcada continua dentro do prazo de 30 dias da aula perdida (RN11)', async () => {
    const [reposicao] = await repos.aulas.createMany([
      {
        alunoId: 1,
        professorId: 2,
        data: '2026-10-14',
        hora: '14:00',
        duracaoMin: 45,
        status: 'agendada',
        motivoCancelamento: null,
        reposicaoDeId: 1, // repõe a de 05/10: prazo até 04/11
      },
    ]);
    await assert.rejects(
      remarcar(reposicao.id, '2026-11-11', '14:00'),
      noCampo('data', /reposição da de 05\/10\/2026: remarque para até 04\/11\/2026/),
    );
    assert.equal((await remarcar(reposicao.id, '2026-11-04', '14:45')).aula.data, '2026-11-04');
  });
});
