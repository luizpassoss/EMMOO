import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { feriadoNaData, separarRestauraveis } from '../../src/domain/agenda.js';
import { feriadosNacionais, pascoa } from '../../src/domain/feriadosNacionais.js';
import { createAlunoService } from '../../src/modules/alunos/aluno.service.js';
import { createAulaService } from '../../src/modules/aulas/aula.service.js';
import { createFeriadoService } from '../../src/modules/feriados/feriado.service.js';
import { validarFeriado } from '../../src/modules/feriados/feriado.validator.js';
import { createHorarioService } from '../../src/modules/horarios/horario.service.js';
import { NotFoundError, ValidationError } from '../../src/shared/errors.js';
import { reposDaEscolaDemo } from '../helpers/fakes.js';

// Seed com HOJE = quarta 07/10/2026: Ana às segundas 14:00 (aulas 1–8, desde 05/10)
// e Pedro às quartas 15:30 (aulas 9–16, desde 07/10), com o professor Luiz (id 2).
const HOJE = '2026-10-07';
const COORDENACAO = { id: 1, papel: 'coordenacao' };
const PROFESSOR = { id: 2, papel: 'professor' };

let repos;
beforeEach(async () => {
  ({ repos } = await reposDaEscolaDemo({ hoje: HOJE }));
});

const relogio = ({ hoje = HOJE, agora = '10:00' } = {}) => ({ hoje: () => hoje, agora: () => agora });
const feriadosDe = (opcoes) =>
  createFeriadoService({ feriados: repos.feriados, aulas: repos.aulas, alunos: repos.alunos, ...relogio(opcoes) });
const aulasDe = (opcoes) =>
  createAulaService({
    aulas: repos.aulas,
    solicitacoes: repos.solicitacoes,
    diarios: repos.diarios,
    alunos: repos.alunos,
    planos: repos.planos,
    usuarios: repos.usuarios,
    feriados: repos.feriados,
    ...relogio(opcoes),
  });
const statusDe = async (id) => {
  const aula = await repos.aulas.findById(id);
  return `${aula.status}${aula.motivoCancelamento ? ` (${aula.motivoCancelamento})` : ''}`;
};

describe('regras puras de feriado', () => {
  it('feriadoNaData considera início e fim inclusive', () => {
    const lista = [{ id: 1, inicio: '2026-07-06', fim: '2026-07-31', descricao: 'Recesso' }];
    assert.equal(feriadoNaData('2026-07-06', lista).descricao, 'Recesso');
    assert.equal(feriadoNaData('2026-07-31', lista).descricao, 'Recesso');
    assert.equal(feriadoNaData('2026-08-01', lista), null);
    assert.equal(feriadoNaData('2026-08-01'), null);
  });
  it('separarRestauraveis devolve só as que não conflitam com outra aula do professor ou do aluno', () => {
    const aula = (id, hora, extra = {}) => ({ id, data: '2026-10-12', hora, duracaoMin: 45, status: 'agendada', professorId: 2, alunoId: id, ...extra });
    const candidatas = [aula(1, '14:00', { status: 'cancelada' }), aula(2, '16:00', { status: 'cancelada' })];
    const outras = [...candidatas, aula(3, '14:30'), aula(4, '16:00', { professorId: 9, alunoId: 99 })];
    assert.deepEqual(separarRestauraveis(candidatas, outras), { livres: [2], ocupadas: [1] });
  });
});

describe('validarFeriado', () => {
  it('um dia (fim em branco) ou um período', () => {
    assert.deepEqual(validarFeriado({ descricao: ' Finados ', inicio: '2026-11-02' }).dados, {
      descricao: 'Finados',
      inicio: '2026-11-02',
      fim: '2026-11-02',
    });
    assert.equal(validarFeriado({ descricao: 'Recesso', inicio: '2026-07-06', fim: '2026-07-31' }).dados.fim, '2026-07-31');
  });
  it('aponta os campos inválidos', () => {
    assert.deepEqual(validarFeriado().erros.map((e) => e.campo), ['descricao', 'inicio', 'fim']);
    assert.deepEqual(validarFeriado({ descricao: 'x'.repeat(81), inicio: '2026-02-30' }).erros.map((e) => e.campo), [
      'descricao',
      'inicio',
      'fim',
    ]);
    const antes = validarFeriado({ descricao: 'Ok', inicio: '2026-07-10', fim: '2026-07-01' });
    assert.equal(antes.erros[0].mensagem, 'A data final deve ser igual ou posterior à inicial.');
    const longo = validarFeriado({ descricao: 'Ok', inicio: '2026-01-01', fim: '2026-06-30' });
    assert.match(longo.erros[0].mensagem, /no máximo 120 dias/);
    assert.equal(validarFeriado({ descricao: 'Ok', inicio: '2026-01-01', fim: '2026-04-30' }).erros.length, 0); // 119 dias depois
  });
});

describe('FeriadoService', () => {
  it('cadastrar tira da agenda as aulas desses dias que ainda não começaram', async () => {
    // Recesso de 12/10 a 21/10: Ana (12/10, 19/10) e Pedro (14/10, 21/10).
    const criado = await feriadosDe().criar({ descricao: 'Recesso', inicio: '2026-10-12', fim: '2026-10-21' });
    assert.deepEqual([criado.descricao, criado.aulasCanceladas], ['Recesso', 4]);
    assert.deepEqual(await Promise.all([2, 3, 10, 11].map(statusDe)), Array(4).fill('cancelada (feriado)'));
    assert.equal(await statusDe(4), 'agendada'); // 26/10 fora do recesso
  });
  it('não mexe em aula de hoje que já começou, nem em aula já cancelada à mão', async () => {
    await repos.aulas.update(10, { status: 'cancelada', motivoCancelamento: 'manual' }); // Pedro 14/10
    const { aulasCanceladas } = await feriadosDe({ agora: '16:00' }).criar({
      descricao: 'Ponto facultativo',
      inicio: '2026-10-07',
      fim: '2026-10-14',
    });
    assert.equal(aulasCanceladas, 1); // só a Ana de 12/10; a do Pedro de hoje (15:30) já começou
    assert.deepEqual(await Promise.all([9, 10, 2].map(statusDe)), ['agendada', 'cancelada (manual)', 'cancelada (feriado)']);
  });
  it('recusa período que já passou e dados inválidos', async () => {
    await assert.rejects(feriadosDe().criar({ descricao: 'Passado', inicio: '2026-10-01', fim: '2026-10-06' }), (erro) => {
      assert.deepEqual(erro.details, [{ campo: 'fim', mensagem: 'Este período já passou.' }]);
      return true;
    });
    await assert.rejects(feriadosDe().criar({}), ValidationError);
  });
  it('lista os de hoje em diante, ou os que tocam o período pedido', async () => {
    await repos.feriados.create({ descricao: 'Antigo', inicio: '2026-09-07', fim: '2026-09-07' });
    await repos.feriados.create({ descricao: 'Finados', inicio: '2026-11-02', fim: '2026-11-02' });
    await repos.feriados.create({ descricao: 'Recesso', inicio: '2026-10-05', fim: '2026-10-09' });
    assert.deepEqual((await feriadosDe().listar()).map((f) => f.descricao), ['Recesso', 'Finados']);
    assert.deepEqual(
      (await feriadosDe().listar({ inicio: '2026-11-01', fim: '2026-11-07' })).map((f) => f.descricao),
      ['Finados'],
    );
    await assert.rejects(feriadosDe().listar({ inicio: '2026-11-01' }), ValidationError);
  });
  it('remover devolve as aulas que ele tirou, se o horário segue livre', async () => {
    const { id } = await feriadosDe().criar({ descricao: 'Finados', inicio: '2026-11-02', fim: '2026-11-02' });
    assert.equal(await statusDe(5), 'cancelada (feriado)'); // Ana, 02/11
    assert.deepEqual(await feriadosDe().remover(String(id)), { aulasRestauradas: 1, aulasNaoRestauradas: 0 });
    assert.equal(await statusDe(5), 'agendada');
    assert.equal((await repos.feriados.list()).length, 0);
    await assert.rejects(feriadosDe().remover(id), NotFoundError);
  });
  it('ao remover: horário ocupado fica cancelado; outro feriado no dia mantém fora; aluno inativo espera a reativação', async () => {
    const recesso = await feriadosDe().criar({ descricao: 'Recesso', inicio: '2026-10-12', fim: '2026-10-21' });
    await feriadosDe().criar({ descricao: 'Feriado local', inicio: '2026-10-19', fim: '2026-10-19' });
    // Pedro ganhou a vaga de segunda 12/10 às 14:00 (mesmo professor) enquanto era recesso.
    await repos.aulas.createMany([
      { alunoId: 2, professorId: 2, data: '2026-10-12', hora: '14:00', duracaoMin: 45, status: 'agendada' },
    ]);
    await repos.alunos.update(2, { status: 'inativo' }); // Pedro inativo: as de 14/10 e 21/10 só voltam se ele voltar

    const resultado = await feriadosDe().remover(recesso.id);
    assert.deepEqual(resultado, { aulasRestauradas: 0, aulasNaoRestauradas: 1 });
    assert.deepEqual(await Promise.all([2, 3, 10, 11].map(statusDe)), [
      'cancelada (manual)', // 12/10: horário ocupado pelo Pedro
      'cancelada (feriado)', // 19/10: ainda é feriado local
      'cancelada (inativacao)',
      'cancelada (inativacao)',
    ]);
  });
  it('usa a data e a hora atuais quando nenhum relógio é informado', async () => {
    const semRelogio = createFeriadoService({ feriados: repos.feriados, aulas: repos.aulas, alunos: repos.alunos });
    await assert.rejects(semRelogio.criar({ descricao: 'Antigo', inicio: '2000-01-01' }), ValidationError);
    assert.deepEqual(await semRelogio.listar(), []);
  });
});

describe('feriados na agenda, nas vagas e na reativação', () => {
  beforeEach(async () => {
    await feriadosDe().criar({ descricao: 'Finados', inicio: '2026-11-02', fim: '2026-11-02' });
  });

  it('a agenda não mostra as aulas tiradas pelo feriado', async () => {
    const semana = await aulasDe().listar({ inicio: '2026-11-02', fim: '2026-11-08' }, COORDENACAO);
    assert.deepEqual(semana.map((aula) => aula.data), ['2026-11-04']); // só a do Pedro, na quarta
  });
  it('série semanal pula o feriado; um dia de feriado sozinho é recusado', async () => {
    const pedido = { alunoId: 2, professorId: 2, data: '2026-10-26', hora: '16:15', semanas: 3 };
    const criadas = await aulasDe().agendar(pedido);
    assert.deepEqual(criadas.map((aula) => aula.data), ['2026-10-26', '2026-11-09']);
    await assert.rejects(aulasDe().agendar({ ...pedido, data: '2026-11-02', semanas: 1 }), (erro) => {
      assert.deepEqual(erro.details, [{ campo: 'data', mensagem: '02/11/2026 é "Finados": não há aula nesse dia.' }]);
      return true;
    });
  });
  it('série inteira em recesso é recusada', async () => {
    await feriadosDe().criar({ descricao: 'Recesso', inicio: '2026-12-14', fim: '2027-01-31' });
    const pedido = { alunoId: 2, professorId: 2, data: '2026-12-14', hora: '16:15', semanas: 3 };
    await assert.rejects(aulasDe().agendar(pedido), {
      message: 'Dados inválidos.',
      details: [{ campo: 'data', mensagem: 'Todas as datas caem em feriados ou recessos da escola.' }],
    });
  });
  it('vagas livres não oferecem o dia do feriado', async () => {
    const horarios = createHorarioService({
      horarios: repos.horarios,
      aulas: repos.aulas,
      usuarios: repos.usuarios,
      feriados: repos.feriados,
      ...relogio(),
    });
    const livres = await horarios.livres({ inicio: '2026-11-02', fim: '2026-11-04' }, PROFESSOR);
    assert.ok(livres.length > 0 && livres.every((vaga) => vaga.data === '2026-11-04'));
  });
  it('reativar não devolve a aula que caiu num feriado (ela volta quando o feriado for removido)', async () => {
    const alunosSvc = createAlunoService({
      alunos: repos.alunos,
      planos: repos.planos,
      usuarios: repos.usuarios,
      aulas: repos.aulas,
      feriados: repos.feriados,
      ...relogio(),
    });
    await alunosSvc.inativar(1); // Ana: 12/10 … 23/11 (a de 02/11 já estava fora pelo feriado)
    await feriadosDe().criar({ descricao: 'Feriado local', inicio: '2026-10-19', fim: '2026-10-19' });
    const { aulasRestauradas } = await alunosSvc.reativar(1);
    assert.equal(aulasRestauradas, 5); // 12/10, 26/10, 09/11, 16/11, 23/11
    assert.equal(await statusDe(3), 'cancelada (feriado)'); // 19/10
    assert.equal(await statusDe(5), 'cancelada (feriado)'); // 02/11
  });
});

describe('feriados nacionais (um clique)', () => {
  it('Páscoa e os feriados móveis de cada ano', () => {
    assert.deepEqual([2024, 2025, 2026, 2027, 2028].map(pascoa), [
      '2024-03-31',
      '2025-04-20',
      '2026-04-05',
      '2027-03-28',
      '2028-04-16',
    ]);
    const de2026 = Object.fromEntries(feriadosNacionais(2026).map((f) => [f.descricao, [f.inicio, f.fim, f.tipo]]));
    assert.deepEqual(de2026['Carnaval'], ['2026-02-16', '2026-02-17', 'facultativo']);
    assert.deepEqual(de2026['Sexta-feira Santa'], ['2026-04-03', '2026-04-03', 'nacional']);
    assert.deepEqual(de2026['Corpus Christi'], ['2026-06-04', '2026-06-04', 'facultativo']);
    assert.deepEqual(de2026['Dia Nacional de Zumbi e da Consciência Negra'], ['2026-11-20', '2026-11-20', 'nacional']);
    assert.equal(feriadosNacionais(2026).length, 12);
    const inicios = feriadosNacionais(2027).map((f) => f.inicio);
    assert.deepEqual(inicios, [...inicios].sort()); // em ordem de data
  });

  it('lista os do ano com o que já passou e o que a escola já cadastrou', async () => {
    await feriadosDe().criar({ descricao: 'Finados', inicio: '2026-11-02' });
    const { ano, feriados } = await feriadosDe().nacionais({});
    assert.equal(ano, 2026);
    const porNome = Object.fromEntries(feriados.map((f) => [f.descricao, f]));
    assert.deepEqual([porNome['Tiradentes'].passado, porNome['Tiradentes'].jaCadastrado], [true, false]);
    assert.deepEqual([porNome['Finados'].passado, porNome['Finados'].jaCadastrado], [false, true]);
    assert.deepEqual([porNome['Natal'].passado, porNome['Natal'].jaCadastrado], [false, false]);
    assert.equal((await feriadosDe().nacionais({ ano: '2028' })).ano, 2028);
    for (const anoInvalido of ['2025', '2029', 'abc', 2026.5]) {
      await assert.rejects(feriadosDe().nacionais({ ano: anoInvalido }), ValidationError);
    }
  });

  it('cadastra os escolhidos de uma vez, pulando os passados e os já cadastrados, e tira as aulas desses dias', async () => {
    await feriadosDe().criar({ descricao: 'Finados', inicio: '2026-11-02' }); // segunda: aula 5 da Ana
    // 12/10 (segunda) — aula 2 da Ana; 15/11 é domingo; 21/04 já passou; 02/11 já está cadastrado.
    const resultado = await feriadosDe().cadastrarNacionais({
      ano: 2026,
      datas: ['2026-10-12', '2026-11-15', '2026-04-21', '2026-11-02', '2026-10-12'],
    });
    assert.deepEqual(resultado, { ano: 2026, criados: 2, ignorados: 2, aulasCanceladas: 1 });
    assert.equal(await statusDe(2), 'cancelada (feriado)');
    const cadastrados = (await repos.feriados.list({})).map((f) => [f.inicio, f.descricao]);
    assert.deepEqual(cadastrados, [
      ['2026-10-12', 'Nossa Senhora Aparecida'],
      ['2026-11-02', 'Finados'],
      ['2026-11-15', 'Proclamação da República'],
    ]);
    // Repetir não duplica.
    assert.deepEqual(await feriadosDe().cadastrarNacionais({ ano: 2026, datas: ['2026-10-12'] }), {
      ano: 2026,
      criados: 0,
      ignorados: 1,
      aulasCanceladas: 0,
    });
  });

  it('recusa lista vazia ou data que não é feriado nacional do ano', async () => {
    for (const datas of [undefined, [], ['2026-10-13'], ['2027-01-01']]) {
      await assert.rejects(feriadosDe().cadastrarNacionais({ ano: 2026, datas }), (erro) => {
        assert.equal(erro.details[0].campo, 'datas');
        return true;
      });
    }
  });
});
