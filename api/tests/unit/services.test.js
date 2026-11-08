import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { createMemoryRepositories } from '../../src/infra/memory/memoryRepositories.js';
import { seedMemoria } from '../../src/infra/memory/seed.js';
import { createAlunoService } from '../../src/modules/alunos/aluno.service.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createEscolaService } from '../../src/modules/escolas/escola.service.js';
import { createPlanoService } from '../../src/modules/planos/plano.service.js';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../src/shared/errors.js';
import { hasherFake, reposDaEscolaDemo, tokenServiceFake } from '../helpers/fakes.js';

const HOJE = '2026-10-07'; // quarta-feira

let base; // escolas + paraEscola
let escola; // a escola de demonstração (EMMOO)
let repos; // os repositórios dela
beforeEach(async () => {
  ({ base, escola, repos } = await reposDaEscolaDemo({ hoje: HOJE }));
});

describe('seed de demonstração', () => {
  it('cria a escola EMMOO, as personas da RFC, os planos e dois alunos', async () => {
    assert.deepEqual([escola.nome, escola.codigo], ['Escola de Música EMMOO', 'emmoo']);
    const lucimara = await repos.usuarios.findByEmail('lucimara@emmoo.com.br');
    assert.deepEqual([lucimara.papel, lucimara.login, lucimara.senhaHash], ['coordenacao', 'admin', 'hash:admin']);
    assert.equal(lucimara.escolaId, escola.id);
    assert.equal((await repos.usuarios.findByLogin('luiz')).senhaHash, 'hash:Luiz123');
    const mary = await repos.usuarios.findByEmail('mary@emmoo.com.br');
    assert.deepEqual([mary.login, mary.senhaHash], [null, 'hash:emmoo123']);
    const planos = await repos.planos.list();
    assert.deepEqual(
      planos.map((p) => `${p.nome} ${p.valor}`),
      ['Grupo · 1 aula por semana 90', 'Grupo · 2 aulas por semana 170', 'Particular · 1 aula por semana 140', 'Particular · 2 aulas por semana 260'],
    );
    assert.equal((await repos.planos.findById(1)).nome, 'Particular · 1 aula por semana'); // o dos alunos de exemplo
    assert.equal((await repos.alunos.list()).length, 2);
  });
  it('cria horários do professor e aulas semanais a partir da semana de hoje', async () => {
    assert.equal((await repos.horarios.list({ professorId: 2 })).length, 8);
    const aulas = await repos.aulas.list();
    assert.equal(aulas.length, 16);
    assert.deepEqual(
      aulas.slice(0, 2).map((aula) => [aula.data, aula.hora, aula.alunoId]),
      [
        ['2026-10-05', '14:00', 1], // segunda da semana de HOJE
        ['2026-10-07', '15:30', 2],
      ],
    );
  });
  it('usa a data atual quando nenhuma é informada', async () => {
    const outros = createMemoryRepositories();
    const { escola: demo } = await seedMemoria(outros, hasherFake);
    assert.equal((await outros.paraEscola(demo.id).aulas.list()).length, 16);
  });
});

describe('AuthService (RF01) — login por escola', () => {
  const criar = () =>
    createAuthService({ escolas: base.escolas, paraEscola: base.paraEscola, passwordHasher: hasherFake, tokenService: tokenServiceFake });

  it('entra com escola + usuário, sem diferenciar maiúsculas; o token leva a escola', async () => {
    const { token, usuario } = await criar().login({ escola: ' EMMOO ', login: '  Admin ', senha: 'admin' });
    assert.equal(token, `token:${usuario.id}:coordenacao:${escola.id}`);
    assert.equal(usuario.nome, 'Lucimara');
    assert.deepEqual(Object.keys(usuario).sort(), ['ativo', 'email', 'escola', 'id', 'login', 'nome', 'papel']);
    assert.equal(usuario.ativo, true);
    assert.deepEqual(usuario.escola, { id: escola.id, nome: 'Escola de Música EMMOO', codigo: 'emmoo' });
    assert.equal((await criar().login({ escola: 'emmoo', login: 'luiz', senha: 'Luiz123' })).usuario.papel, 'professor');
  });
  it('entra também com o e-mail (campo "login" ou o antigo "email")', async () => {
    const porLogin = await criar().login({ escola: 'emmoo', login: 'LUCIMARA@emmoo.com.br', senha: 'admin' });
    assert.equal(porLogin.usuario.nome, 'Lucimara');
    const porEmail = await criar().login({ escola: 'emmoo', email: 'mary@emmoo.com.br', senha: 'emmoo123' });
    assert.equal(porEmail.usuario.nome, 'Mary');
  });
  it('a senha diferencia maiúsculas', async () => {
    await assert.rejects(criar().login({ escola: 'emmoo', login: 'luiz', senha: 'luiz123' }), UnauthorizedError);
  });
  it('escola, usuário ou senha errados: a mesma mensagem, sem revelar o que existe', async () => {
    const mensagem = { message: 'Escola, usuário ou senha inválidos.' };
    await assert.rejects(criar().login({ escola: 'emmoo', login: 'admin', senha: 'errada' }), mensagem);
    await assert.rejects(criar().login({ escola: 'emmoo', login: 'ninguem', senha: 'x' }), mensagem);
    await assert.rejects(criar().login({ escola: 'nao-existe', login: 'admin', senha: 'admin' }), mensagem);
    await assert.rejects(criar().login({ escola: 'emmoo', login: 'ninguem@emmoo.com.br', senha: 'x' }), UnauthorizedError);
  });
  it('o mesmo usuário em outra escola é outra pessoa: cada escola com o seu "admin"', async () => {
    const outra = await base.escolas.create({ nome: 'Escola Sol', codigo: 'sol' });
    await base.paraEscola(outra.id).usuarios.create({
      nome: 'Rita', email: 'rita@sol.com', login: 'admin', senhaHash: 'hash:solsol', papel: 'coordenacao',
    });
    const naSol = await criar().login({ escola: 'sol', login: 'admin', senha: 'solsol' });
    assert.deepEqual([naSol.usuario.nome, naSol.usuario.escola.codigo], ['Rita', 'sol']);
    // A senha da EMMOO não abre a escola Sol (e vice-versa).
    await assert.rejects(criar().login({ escola: 'sol', login: 'admin', senha: 'admin' }), UnauthorizedError);
  });
  it('valida campos obrigatórios', async () => {
    await assert.rejects(criar().login({}), (erro) => {
      assert.ok(erro instanceof ValidationError);
      assert.deepEqual(erro.details.map((d) => d.campo), ['escola', 'login', 'senha']);
      return true;
    });
    await assert.rejects(criar().login(), ValidationError);
  });
  it('retorna o perfil do usuário autenticado, só dentro da escola dele', async () => {
    const perfil = await criar().perfil(1, escola.id);
    assert.deepEqual([perfil.nome, perfil.escola.codigo], ['Lucimara', 'emmoo']);
    await assert.rejects(criar().perfil(999, escola.id), NotFoundError);
    await assert.rejects(criar().perfil(1, 999), NotFoundError); // escola inexistente
    const outra = await base.escolas.create({ nome: 'Escola Sol', codigo: 'sol' });
    await assert.rejects(criar().perfil(1, outra.id), NotFoundError); // a Lucimara não existe na Sol
  });

  it('acesso desativado: com a senha certa, avisa; com a errada, a mensagem de sempre', async () => {
    await repos.usuarios.update(2, { ativo: false }); // Luiz
    await assert.rejects(criar().login({ escola: 'emmoo', login: 'luiz', senha: 'Luiz123' }), {
      name: 'ForbiddenError',
      message: 'Seu acesso foi desativado. Entre em contato com a coordenação da escola.',
    });
    await assert.rejects(criar().login({ escola: 'emmoo', login: 'luiz', senha: 'errada' }), {
      message: 'Escola, usuário ou senha inválidos.',
    });
  });

  it('o token leva a versão da sessão do usuário', async () => {
    await repos.usuarios.update(2, { versaoSessao: 3 });
    const { token } = await criar().login({ escola: 'emmoo', login: 'luiz', senha: 'Luiz123' });
    assert.equal(token, `token:2:professor:${escola.id}:3`);
  });

  it('valida a sessão: usuário da escola, ativo e na mesma versão', async () => {
    const validar = (dados) => criar().validarSessao({ usuarioId: 2, escolaId: escola.id, ...dados });
    assert.equal((await validar({ versao: 0 })).nome, 'Luiz');
    assert.equal((await validar({})).nome, 'Luiz'); // token sem versão = versão 0
    assert.equal(await validar({ versao: 1 }), null); // sessão de antes de uma mudança
    assert.equal(await validar({ usuarioId: 999 }), null);
    const outra = await base.escolas.create({ nome: 'Escola Sol', codigo: 'sol' });
    assert.equal(await validar({ escolaId: outra.id }), null);
    await repos.usuarios.update(2, { ativo: false });
    assert.equal(await validar({ versao: 0 }), null);
  });
});

describe('PlanoService (RF03)', () => {
  const criar = () => createPlanoService({ planos: repos.planos, alunos: repos.alunos });
  const plano3x = { nome: 'Particular · 3 aulas por semana', tipo: 'particular', valor: 370, freqSemanal: 3 };

  it('lista com a contagem de alunos de cada plano', async () => {
    await repos.alunos.update(2, { status: 'inativo' });
    const particular1x = (await criar().listar()).find((p) => p.id === 1);
    assert.deepEqual([particular1x.totalAlunos, particular1x.alunosAtivos], [2, 1]);
    const grupo = (await criar().listar()).find((p) => p.nome === 'Grupo · 1 aula por semana');
    assert.deepEqual([grupo.totalAlunos, grupo.alunosAtivos], [0, 0]);
  });
  it('cria plano válido, com qualquer frequência de 1 a 7 por semana', async () => {
    const criado = await criar().criar(plano3x);
    assert.deepEqual([criado.freqSemanal, criado.duracaoMin, criado.totalAlunos], [3, 45, 0]);
    assert.equal((await criar().listar()).length, 5);
  });
  it('rejeita plano inválido', async () => {
    await assert.rejects(criar().criar({ nome: '' }), ValidationError);
  });
  it('edita plano mantendo a contagem de alunos', async () => {
    const editado = await criar().atualizar('1', { ...plano3x, nome: 'Particular · 1 aula por semana', freqSemanal: 1, valor: 150 });
    assert.deepEqual([editado.valor, editado.freqSemanal, editado.totalAlunos], [150, 1, 2]);
    await assert.rejects(criar().atualizar(1, { nome: '' }), ValidationError);
    await assert.rejects(criar().atualizar(99, plano3x), NotFoundError);
  });
  it('exclui só plano sem alunos (contando inativos)', async () => {
    await repos.alunos.update(1, { status: 'inativo' });
    await repos.alunos.update(2, { status: 'inativo' });
    await assert.rejects(criar().excluir(1), (erro) => {
      assert.ok(erro instanceof ConflictError);
      assert.match(erro.message, /usado por 2 alunos \(contando os inativos\)/);
      return true;
    });
    const grupo = (await criar().listar()).find((p) => p.nome === 'Grupo · 1 aula por semana');
    await criar().excluir(String(grupo.id));
    assert.equal(await repos.planos.findById(grupo.id), null);
    await assert.rejects(criar().excluir(grupo.id), NotFoundError);
    await repos.alunos.create({ nome: 'Lia', planoId: 2, status: 'inativo' });
    await assert.rejects(criar().excluir(2), { message: /usado por 1 aluno \(/ });
  });
});

describe('AlunoService (RF02 e RN08)', () => {
  // Relógio fixo: HOJE (quarta 07/10) às 10:00, salvo quando o teste diz outra coisa.
  const criar = ({ hoje = HOJE, agora = '10:00' } = {}) =>
    createAlunoService({
      alunos: repos.alunos,
      planos: repos.planos,
      usuarios: repos.usuarios,
      aulas: repos.aulas,
      feriados: repos.feriados,
      hoje: () => hoje,
      agora: () => agora,
    });
  const statusDasAulas = async (alunoId) =>
    (await repos.aulas.list({ alunoId })).map((aula) => `${aula.data} ${aula.status}${aula.motivoCancelamento ? ` (${aula.motivoCancelamento})` : ''}`);
  const novo = { nome: 'Lia', contato: 'lia@email.com', instrumento: 'Canto', planoId: 1 };

  it('cria aluno ativo', async () => {
    const aluno = await criar().criar(novo);
    assert.equal(aluno.status, 'ativo');
    assert.equal(aluno.usuarioRespId, null);
  });
  it('valida plano e responsável referenciados', async () => {
    await assert.rejects(criar().criar({ ...novo, planoId: 99 }), (erro) => erro.details[0].campo === 'planoId');
    await assert.rejects(criar().criar({ ...novo, usuarioRespId: 1 }), (erro) => erro.details[0].campo === 'usuarioRespId');
    await assert.rejects(criar().criar({ ...novo, usuarioRespId: 99 }), ValidationError);
    const comResponsavel = await criar().criar({ ...novo, usuarioRespId: 3 });
    assert.equal(comResponsavel.usuarioRespId, 3);
  });
  it('rejeita dados inválidos', async () => {
    await assert.rejects(criar().criar({}), ValidationError);
  });
  it('lista com filtro de status e valida o filtro', async () => {
    assert.equal((await criar().listar()).length, 2);
    assert.equal((await criar().listar({ status: 'inativo' })).length, 0);
    await assert.rejects(criar().listar({ status: 'pausado' }), ValidationError);
  });
  it('busca por id e trata inexistente/inválido', async () => {
    assert.equal((await criar().buscar('1')).nome, 'Ana Beatriz');
    await assert.rejects(criar().buscar(99), NotFoundError);
    await assert.rejects(criar().buscar('abc'), ValidationError);
  });
  it('atualiza dados do aluno', async () => {
    const atualizado = await criar().atualizar(2, { ...novo, nome: 'Pedro H.' });
    assert.equal(atualizado.nome, 'Pedro H.');
    await assert.rejects(criar().atualizar(2, { nome: '' }), ValidationError);
    await assert.rejects(criar().atualizar(99, novo), NotFoundError);
  });
  it('inativa uma única vez (RN08)', async () => {
    assert.equal((await criar().inativar(2)).status, 'inativo');
    await assert.rejects(criar().inativar(2), ConflictError);
  });
  it('ao inativar, cancela só as aulas agendadas de hoje em diante, marcando o motivo', async () => {
    await repos.aulas.update(2, { status: 'realizada' }); // aula da Ana em 12/10 já registrada
    const { aulasCanceladas } = await criar().inativar(1);
    assert.equal(aulasCanceladas, 6); // 8 semanas − a de 05/10 (passada) − a já realizada
    assert.deepEqual((await statusDasAulas(1)).slice(0, 3), [
      '2026-10-05 agendada',
      '2026-10-12 realizada',
      '2026-10-19 cancelada (inativacao)',
    ]);
  });
  it('ao inativar, a aula de hoje que já começou fica como está (ela aconteceu)', async () => {
    // Pedro tem aula hoje (07/10) às 15:30.
    assert.equal((await criar({ agora: '15:30' }).inativar(2)).aulasCanceladas, 7);
    assert.equal((await statusDasAulas(2))[0], '2026-10-07 agendada');
    await criar().reativar(2);
    // Antes do horário, a de hoje também é cancelada.
    assert.equal((await criar({ agora: '15:29' }).inativar(2)).aulasCanceladas, 8);
  });
  it('reativa apenas aluno inativo', async () => {
    await assert.rejects(criar().reativar(1), ConflictError);
    await criar().inativar(1);
    assert.equal((await criar().reativar(1)).status, 'ativo');
  });
  it('ao reativar, devolve as aulas que a inativação cancelou', async () => {
    await criar().inativar(1);
    const reativada = await criar().reativar(1);
    assert.deepEqual([reativada.status, reativada.aulasRestauradas, reativada.aulasNaoRestauradas], ['ativo', 7, 0]);
    assert.ok((await statusDasAulas(1)).every((linha) => linha.endsWith('agendada')));
  });
  it('ao reativar, não devolve aula cancelada à mão nem a de horário ocupado nesse meio-tempo', async () => {
    await repos.aulas.update(3, { status: 'cancelada', motivoCancelamento: 'manual' }); // 19/10: feriado
    await criar().inativar(1); // cancela 12/10, 26/10, 02/11 … 23/11
    // Enquanto a Ana estava inativa, o Pedro ganhou a vaga das 14:00 de 26/10 com o mesmo professor.
    await repos.aulas.createMany([
      { alunoId: 2, professorId: 2, data: '2026-10-26', hora: '14:00', duracaoMin: 45, status: 'agendada' },
    ]);
    const { aulasRestauradas, aulasNaoRestauradas } = await criar().reativar(1);
    assert.deepEqual([aulasRestauradas, aulasNaoRestauradas], [5, 1]);
    assert.deepEqual((await statusDasAulas(1)).slice(0, 4), [
      '2026-10-05 agendada',
      '2026-10-12 agendada',
      '2026-10-19 cancelada (manual)',
      '2026-10-26 cancelada (manual)', // não volta, nem numa próxima reativação
    ]);
    await criar().inativar(1);
    assert.equal((await criar().reativar(1)).aulasRestauradas, 5);
  });
  it('ao reativar depois de um tempo, as aulas que já passaram continuam canceladas', async () => {
    await criar().inativar(1);
    const { aulasRestauradas } = await criar({ hoje: '2026-10-20' }).reativar(1);
    assert.equal(aulasRestauradas, 5); // 26/10 a 23/11; 12/10 e 19/10 já passaram
    assert.deepEqual((await statusDasAulas(1)).slice(1, 3), [
      '2026-10-12 cancelada (inativacao)',
      '2026-10-19 cancelada (inativacao)',
    ]);
  });
  it('reativar aluno sem aulas canceladas não muda a agenda', async () => {
    const lia = await criar().criar(novo);
    await criar().inativar(lia.id);
    assert.deepEqual(
      [(await criar().reativar(lia.id)).aulasRestauradas, (await repos.aulas.list()).length],
      [0, 16],
    );
  });
  it('usa a data e a hora atuais quando nenhum relógio é informado', async () => {
    const semRelogio = createAlunoService({
      alunos: repos.alunos,
      planos: repos.planos,
      usuarios: repos.usuarios,
      aulas: repos.aulas,
      feriados: repos.feriados,
    });
    await repos.aulas.createMany([
      { alunoId: 1, professorId: 2, data: '2099-01-05', hora: '14:00', duracaoMin: 45, status: 'agendada' },
      { alunoId: 1, professorId: 2, data: '2000-01-03', hora: '14:00', duracaoMin: 45, status: 'agendada' },
    ]);
    await semRelogio.inativar(1);
    const [antiga, futura] = [(await repos.aulas.list({ alunoId: 1 }))[0], (await repos.aulas.list({ alunoId: 1 })).at(-1)];
    assert.deepEqual([antiga.status, futura.status], ['agendada', 'cancelada']);
  });
  it('exclui permanentemente só aluno inativo, junto com o histórico de aulas', async () => {
    await assert.rejects(criar().excluir(1), {
      message: 'Só é possível excluir aluno inativo. Inative o aluno antes.',
    });
    await criar().inativar(1);
    assert.deepEqual(await criar().excluir('1'), { aulasExcluidas: 8 }); // as 8 da série, inclusive as canceladas
    assert.equal(await repos.alunos.findById(1), null);
    assert.equal((await repos.aulas.list({ alunoId: 1 })).length, 0);
    assert.equal((await repos.aulas.list({ alunoId: 2 })).length, 8); // as do Pedro continuam
    await assert.rejects(criar().excluir(1), NotFoundError);
  });
});

describe('EscolaService — cadastro de escolas (multi-tenant)', () => {
  const novaEscola = { nomeEscola: 'Escola Sol', codigo: 'Sol', nome: 'Rita', email: 'rita@sol.com', login: 'admin', senha: 'segredo' };
  const criar = (cadastroAberto = true) => {
    const auth = createAuthService({
      escolas: base.escolas, paraEscola: base.paraEscola, passwordHasher: hasherFake, tokenService: tokenServiceFake,
    });
    return createEscolaService({ escolas: base.escolas, paraEscola: base.paraEscola, passwordHasher: hasherFake, auth, cadastroAberto });
  };

  it('informa se o cadastro está aberto', () => {
    assert.deepEqual(criar(true).configuracao(), { cadastroDeEscolas: true, recuperacaoDeSenha: false });
    assert.deepEqual(criar(false).configuracao(), { cadastroDeEscolas: false, recuperacaoDeSenha: false });
  });

  it('cria a escola, quem a coordena, e já devolve a sessão', async () => {
    const { token, usuario } = await criar().cadastrar(novaEscola);
    const sol = await base.escolas.findByCodigo('sol');
    assert.equal(token, `token:${usuario.id}:coordenacao:${sol.id}`);
    assert.deepEqual([usuario.nome, usuario.papel, usuario.login], ['Rita', 'coordenacao', 'admin']);
    assert.deepEqual(usuario.escola, { id: sol.id, nome: 'Escola Sol', codigo: 'sol' });
    const rita = await base.paraEscola(sol.id).usuarios.findByLogin('admin');
    assert.equal(rita.senhaHash, 'hash:segredo');
  });

  it('a escola nova começa vazia: nada da EMMOO aparece nela', async () => {
    await criar().cadastrar(novaEscola);
    const sol = base.paraEscola((await base.escolas.findByCodigo('sol')).id);
    assert.deepEqual((await sol.usuarios.list()).map((u) => u.nome), ['Rita']);
    assert.deepEqual(await sol.planos.list(), []);
    assert.deepEqual(await sol.alunos.list(), []);
    assert.deepEqual(await sol.aulas.list(), []);
    assert.equal((await repos.alunos.list()).length, 2); // e a EMMOO continua igual
  });

  it('código em uso: 409, sem criar nada', async () => {
    await assert.rejects(criar().cadastrar({ ...novaEscola, codigo: 'EMMOO' }), {
      name: ConflictError.name,
      message: 'Este código de escola já está em uso.',
    });
  });

  it('valida os dados antes de criar', async () => {
    await assert.rejects(criar().cadastrar({ ...novaEscola, codigo: 'x', senha: '1' }), (erro) => {
      assert.ok(erro instanceof ValidationError);
      assert.deepEqual(erro.details.map((d) => d.campo), ['codigo', 'senha']);
      return true;
    });
    assert.equal(await base.escolas.findByCodigo('x'), null);
  });

  it('com o cadastro fechado, recusa (403)', async () => {
    await assert.rejects(criar(false).cadastrar(novaEscola), {
      name: ForbiddenError.name,
      message: 'O cadastro de novas escolas está desativado.',
    });
    assert.equal(await base.escolas.findByCodigo('sol'), null);
  });
});
