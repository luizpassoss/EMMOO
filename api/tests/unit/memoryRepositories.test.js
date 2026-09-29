import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { createMemoryRepositories } from '../../src/infra/memory/memoryRepositories.js';
import { ConflictError } from '../../src/shared/errors.js';

describe('repositórios em memória', () => {
  let repos;
  beforeEach(() => {
    repos = createMemoryRepositories();
  });

  it('cria usuário com e-mail normalizado e busca por e-mail/id', async () => {
    const criado = await repos.usuarios.create({ nome: 'Lu', email: ' LU@EMMOO.com ', senhaHash: 'h', papel: 'professor' });
    assert.equal(criado.email, 'lu@emmoo.com');
    assert.equal((await repos.usuarios.findByEmail('Lu@Emmoo.com')).id, criado.id);
    assert.equal((await repos.usuarios.findById(criado.id)).nome, 'Lu');
    assert.equal(await repos.usuarios.findByEmail('nao@existe.com'), null);
    assert.equal(await repos.usuarios.findById(999), null);
  });

  it('impede e-mail duplicado', async () => {
    await repos.usuarios.create({ nome: 'A', email: 'a@a.com', senhaHash: 'h', papel: 'professor' });
    await assert.rejects(repos.usuarios.create({ nome: 'B', email: 'A@a.com', senhaHash: 'h', papel: 'professor' }), ConflictError);
  });

  it('lista planos em ordem alfabética', async () => {
    await repos.planos.create({ nome: 'Particular', tipo: 'particular', valor: 140, freqSemanal: 1, duracaoMin: 45 });
    await repos.planos.create({ nome: 'Grupo', tipo: 'grupo', valor: 90, freqSemanal: 1, duracaoMin: 45 });
    assert.deepEqual((await repos.planos.list()).map((p) => p.nome), ['Grupo', 'Particular']);
    assert.equal((await repos.planos.findById(1)).nome, 'Particular');
  });

  it('filtra alunos por status, ordena e atualiza', async () => {
    const zeca = await repos.alunos.create({ nome: 'Zeca', status: 'ativo', planoId: 1 });
    await repos.alunos.create({ nome: 'Ana', status: 'ativo', planoId: 1 });
    await repos.alunos.update(zeca.id, { status: 'inativo' });
    assert.deepEqual((await repos.alunos.list()).map((a) => a.nome), ['Ana', 'Zeca']);
    assert.deepEqual((await repos.alunos.list({ status: 'inativo' })).map((a) => a.nome), ['Zeca']);
    assert.equal(await repos.alunos.update(999, { nome: 'X' }), null);
  });

  it('lista usuários por papel e alunos por responsável', async () => {
    await repos.usuarios.create({ nome: 'Zé', email: 'ze@a.com', senhaHash: 'h', papel: 'professor' });
    await repos.usuarios.create({ nome: 'Bia', email: 'bia@a.com', senhaHash: 'h', papel: 'responsavel' });
    assert.deepEqual((await repos.usuarios.list()).map((u) => u.nome), ['Bia', 'Zé']);
    assert.deepEqual((await repos.usuarios.list({ papel: 'professor' })).map((u) => u.nome), ['Zé']);
    await repos.alunos.create({ nome: 'Ana', status: 'ativo', planoId: 1, usuarioRespId: 2 });
    await repos.alunos.create({ nome: 'Leo', status: 'ativo', planoId: 1, usuarioRespId: null });
    assert.deepEqual((await repos.alunos.list({ usuarioRespId: 2 })).map((a) => a.nome), ['Ana']);
  });

  it('horários: ordena por dia e hora, filtra por professor e remove', async () => {
    await repos.horarios.create({ professorId: 1, diaSemana: 3, horaInicio: '14:00', duracaoMin: 45 });
    const segunda = await repos.horarios.create({ professorId: 1, diaSemana: 1, horaInicio: '15:00', duracaoMin: 45 });
    await repos.horarios.create({ professorId: 1, diaSemana: 1, horaInicio: '09:00', duracaoMin: 45 });
    await repos.horarios.create({ professorId: 2, diaSemana: 1, horaInicio: '08:00', duracaoMin: 45 });
    assert.deepEqual(
      (await repos.horarios.list({ professorId: 1 })).map((h) => `${h.diaSemana} ${h.horaInicio}`),
      ['1 09:00', '1 15:00', '3 14:00'],
    );
    assert.equal((await repos.horarios.list()).length, 4);
    assert.equal((await repos.horarios.findById(segunda.id)).horaInicio, '15:00');
    assert.equal(await repos.horarios.remove(segunda.id), true);
    assert.equal(await repos.horarios.remove(segunda.id), false);
    assert.equal(await repos.horarios.findById(segunda.id), null);
  });

  it('aulas: cria em lote, filtra por período, professor e alunos e atualiza', async () => {
    const base = { professorId: 1, hora: '14:00', duracaoMin: 45, status: 'agendada' };
    const criadas = await repos.aulas.createMany([
      { ...base, alunoId: 1, data: '2026-10-12' },
      { ...base, alunoId: 2, data: '2026-10-05', hora: '15:00' },
      { ...base, alunoId: 3, data: '2026-10-05', professorId: 2 },
    ]);
    assert.deepEqual(criadas.map((a) => a.id), [1, 2, 3]);
    assert.deepEqual((await repos.aulas.list()).map((a) => a.id), [3, 2, 1]); // por data e hora
    assert.deepEqual((await repos.aulas.list({ inicio: '2026-10-06' })).map((a) => a.id), [1]);
    assert.deepEqual((await repos.aulas.list({ fim: '2026-10-05', professorId: 1 })).map((a) => a.id), [2]);
    assert.deepEqual((await repos.aulas.list({ alunoId: 3 })).map((a) => a.id), [3]);
    assert.deepEqual((await repos.aulas.list({ alunoIds: [1, 3] })).map((a) => a.id), [3, 1]);
    assert.deepEqual(await repos.aulas.list({ alunoIds: [] }), []);
    assert.equal((await repos.aulas.update(2, { status: 'cancelada' })).status, 'cancelada');
    assert.equal((await repos.aulas.findById(2)).status, 'cancelada');
  });

  it('devolve cópias, protegendo o estado interno', async () => {
    const aluno = await repos.alunos.create({ nome: 'Ana', status: 'ativo', planoId: 1 });
    aluno.nome = 'Alterado fora';
    assert.equal((await repos.alunos.findById(aluno.id)).nome, 'Ana');
    assert.ok(aluno.criadoEm && aluno.atualizadoEm);
  });
});
