import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { createMemoryRepositories } from '../../src/infra/memory/memoryRepositories.js';
import { seedMemoria, SENHA_DEMO } from '../../src/infra/memory/seed.js';
import { createAlunoService } from '../../src/modules/alunos/aluno.service.js';
import { createAuthService } from '../../src/modules/auth/auth.service.js';
import { createPlanoService } from '../../src/modules/planos/plano.service.js';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../../src/shared/errors.js';
import { hasherFake, tokenServiceFake } from '../helpers/fakes.js';

const HOJE = '2026-10-07'; // quarta-feira

let repos;
beforeEach(async () => {
  repos = createMemoryRepositories();
  await seedMemoria(repos, hasherFake, { hoje: HOJE });
});

describe('seed de demonstração', () => {
  it('cria as personas da RFC, o plano particular e dois alunos', async () => {
    assert.equal((await repos.usuarios.findByEmail('lucimara@emmoo.com.br')).papel, 'coordenacao');
    assert.equal((await repos.usuarios.findByEmail('mary@emmoo.com.br')).senhaHash, `hash:${SENHA_DEMO}`);
    assert.equal((await repos.planos.list())[0].valor, 140);
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
    await seedMemoria(outros, hasherFake);
    assert.equal((await outros.aulas.list()).length, 16);
  });
});

describe('AuthService (RF01)', () => {
  const criar = () => createAuthService({ usuarios: repos.usuarios, passwordHasher: hasherFake, tokenService: tokenServiceFake });

  it('autentica e não expõe o hash da senha', async () => {
    const { token, usuario } = await criar().login({ email: '  LUCIMARA@emmoo.com.br ', senha: SENHA_DEMO });
    assert.equal(token, `token:${usuario.id}:coordenacao`);
    assert.deepEqual(Object.keys(usuario).sort(), ['email', 'id', 'nome', 'papel']);
  });
  it('recusa senha errada e e-mail inexistente com a mesma mensagem', async () => {
    await assert.rejects(criar().login({ email: 'lucimara@emmoo.com.br', senha: 'errada' }), UnauthorizedError);
    await assert.rejects(criar().login({ email: 'ninguem@emmoo.com.br', senha: 'x' }), {
      message: 'E-mail ou senha inválidos.',
    });
  });
  it('valida campos obrigatórios', async () => {
    await assert.rejects(criar().login({}), (erro) => {
      assert.ok(erro instanceof ValidationError);
      assert.deepEqual(erro.details.map((d) => d.campo), ['email', 'senha']);
      return true;
    });
    await assert.rejects(criar().login(), ValidationError);
  });
  it('retorna o perfil do usuário autenticado', async () => {
    const perfil = await criar().perfil(1);
    assert.equal(perfil.nome, 'Lucimara');
    await assert.rejects(criar().perfil(999), NotFoundError);
  });
});

describe('PlanoService (RF03)', () => {
  it('lista e cria planos válidos', async () => {
    const service = createPlanoService({ planos: repos.planos });
    const criado = await service.criar({ nome: 'Grupo 1x', tipo: 'grupo', valor: 90, freqSemanal: 1 });
    assert.equal(criado.duracaoMin, 45);
    assert.equal((await service.listar()).length, 2);
  });
  it('rejeita plano inválido', async () => {
    const service = createPlanoService({ planos: repos.planos });
    await assert.rejects(service.criar({ nome: '' }), ValidationError);
  });
});

describe('AlunoService (RF02 e RN08)', () => {
  const criar = () =>
    createAlunoService({ alunos: repos.alunos, planos: repos.planos, usuarios: repos.usuarios, aulas: repos.aulas, hoje: () => HOJE });
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
  it('ao inativar, cancela só as aulas agendadas de hoje em diante', async () => {
    await repos.aulas.update(2, { status: 'realizada' }); // aula da Ana em 12/10 já registrada
    const { aulasCanceladas } = await criar().inativar(1);
    assert.equal(aulasCanceladas, 6); // 8 semanas − a de 05/10 (passada) − a já realizada
    const aulasDaAna = await repos.aulas.list({ alunoId: 1 });
    assert.deepEqual(
      aulasDaAna.slice(0, 3).map((aula) => aula.status),
      ['agendada', 'realizada', 'cancelada'],
    );
  });
  it('reativa apenas aluno inativo', async () => {
    await assert.rejects(criar().reativar(1), ConflictError);
    await criar().inativar(1);
    assert.equal((await criar().reativar(1)).status, 'ativo');
  });
});
