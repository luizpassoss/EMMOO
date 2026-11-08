import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { createMemoryRepositories } from '../../src/infra/memory/memoryRepositories.js';
import { ConflictError } from '../../src/shared/errors.js';

describe('repositórios em memória — escolas', () => {
  it('cria escola com código normalizado, busca por código/id e impede código repetido', async () => {
    const { escolas } = createMemoryRepositories();
    const escola = await escolas.create({ nome: 'Escola Sol', codigo: ' Sol ' });
    assert.equal(escola.codigo, 'sol');
    assert.equal((await escolas.findByCodigo('SOL')).id, escola.id);
    assert.equal((await escolas.findById(escola.id)).nome, 'Escola Sol');
    assert.equal(await escolas.findByCodigo('lua'), null);
    assert.equal(await escolas.findById(999), null);
    await assert.rejects(escolas.create({ nome: 'Outra', codigo: 'SOL' }), {
      name: ConflictError.name,
      message: 'Este código de escola já está em uso.',
    });
  });
});

describe('repositórios em memória — dentro de uma escola', () => {
  let repos;
  beforeEach(async () => {
    const base = createMemoryRepositories();
    const escola = await base.escolas.create({ nome: 'Escola Sol', codigo: 'sol' });
    repos = base.paraEscola(escola.id);
  });

  it('cria usuário com e-mail normalizado e busca por e-mail/id', async () => {
    const criado = await repos.usuarios.create({ nome: 'Lu', email: ' LU@EMMOO.com ', senhaHash: 'h', papel: 'professor' });
    assert.equal(criado.email, 'lu@emmoo.com');
    assert.equal((await repos.usuarios.findByEmail('Lu@Emmoo.com')).id, criado.id);
    assert.equal((await repos.usuarios.findById(criado.id)).nome, 'Lu');
    assert.equal(await repos.usuarios.findByEmail('nao@existe.com'), null);
    assert.equal(await repos.usuarios.findById(999), null);
  });

  it('busca por usuário (login) sem diferenciar maiúsculas e impede usuário duplicado', async () => {
    const criado = await repos.usuarios.create({ nome: 'Lu', email: 'lu@a.com', login: ' Admin ', senhaHash: 'h', papel: 'coordenacao' });
    assert.equal(criado.login, 'admin');
    assert.equal((await repos.usuarios.findByLogin('ADMIN')).id, criado.id);
    assert.equal(await repos.usuarios.findByLogin('outro'), null);
    const semLogin = await repos.usuarios.create({ nome: 'Ma', email: 'ma@a.com', senhaHash: 'h', papel: 'responsavel' });
    assert.equal(semLogin.login, null);
    await assert.rejects(
      repos.usuarios.create({ nome: 'X', email: 'x@a.com', login: 'admin', senhaHash: 'h', papel: 'professor' }),
      { message: 'Usuário já cadastrado nesta escola.' },
    );
  });

  it('impede e-mail duplicado', async () => {
    await repos.usuarios.create({ nome: 'A', email: 'a@a.com', senhaHash: 'h', papel: 'professor' });
    await assert.rejects(repos.usuarios.create({ nome: 'B', email: 'A@a.com', senhaHash: 'h', papel: 'professor' }), {
      name: ConflictError.name,
      message: 'E-mail já cadastrado nesta escola.',
    });
  });

  it('edita usuário mantendo a unicidade (o próprio registro não conta)', async () => {
    const lu = await repos.usuarios.create({ nome: 'Lu', email: 'lu@a.com', login: 'lu', senhaHash: 'h', papel: 'professor' });
    await repos.usuarios.create({ nome: 'Bia', email: 'bia@a.com', login: 'bia', senhaHash: 'h', papel: 'professor' });
    const editado = await repos.usuarios.update(lu.id, { nome: 'Luiza', email: 'LU@a.com', login: 'Lu' });
    assert.deepEqual([editado.nome, editado.email, editado.login], ['Luiza', 'lu@a.com', 'lu']);
    assert.equal((await repos.usuarios.update(lu.id, { login: '' })).login, null); // tira o usuário: entra só pelo e-mail
    await assert.rejects(repos.usuarios.update(lu.id, { email: 'bia@a.com' }), { message: 'E-mail já cadastrado nesta escola.' });
    await assert.rejects(repos.usuarios.update(lu.id, { login: 'BIA' }), { message: 'Usuário já cadastrado nesta escola.' });
    assert.equal(await repos.usuarios.update(999, { nome: 'X' }), null);
  });

  it('lista planos em ordem alfabética', async () => {
    await repos.planos.create({ nome: 'Particular', tipo: 'particular', valor: 140, freqSemanal: 1, duracaoMin: 45 });
    await repos.planos.create({ nome: 'Grupo', tipo: 'grupo', valor: 90, freqSemanal: 1, duracaoMin: 45 });
    assert.deepEqual((await repos.planos.list()).map((p) => p.nome), ['Grupo', 'Particular']);
    assert.equal((await repos.planos.findById(1)).nome, 'Particular');
    assert.equal((await repos.planos.update(1, { valor: 150 })).valor, 150);
    assert.equal(await repos.planos.remove(2), true);
    assert.equal(await repos.planos.remove(2), false);
    assert.deepEqual((await repos.planos.list()).map((p) => p.nome), ['Particular']);
  });

  it('excluir aluno apaga também as aulas dele, e só as dele', async () => {
    const ana = await repos.alunos.create({ nome: 'Ana', status: 'inativo', planoId: 1 });
    const leo = await repos.alunos.create({ nome: 'Leo', status: 'ativo', planoId: 1 });
    const base = { professorId: 1, hora: '14:00', duracaoMin: 45, status: 'agendada' };
    await repos.aulas.createMany([
      { ...base, alunoId: ana.id, data: '2026-10-05' },
      { ...base, alunoId: ana.id, data: '2026-10-12', status: 'cancelada' },
      { ...base, alunoId: leo.id, data: '2026-10-06' },
    ]);
    assert.deepEqual(await repos.alunos.remove(ana.id), { aulasExcluidas: 2 });
    assert.equal(await repos.alunos.findById(ana.id), null);
    assert.deepEqual((await repos.aulas.list()).map((a) => a.alunoId), [leo.id]);
    assert.deepEqual(await repos.alunos.remove(ana.id), { aulasExcluidas: 0 });
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
    // Em lote: devolve quantas mudaram (ids inexistentes não contam).
    assert.equal(await repos.aulas.updateMany([1, 3, 99], { status: 'cancelada', motivoCancelamento: 'inativacao' }), 2);
    assert.deepEqual((await repos.aulas.list()).map((a) => a.motivoCancelamento ?? '-'), ['inativacao', '-', 'inativacao']);
    assert.equal(await repos.aulas.updateMany([], { status: 'agendada' }), 0);
  });

  it('feriados: lista os que tocam o período, em ordem de data, e remove', async () => {
    const recesso = await repos.feriados.create({ descricao: 'Recesso', inicio: '2026-07-06', fim: '2026-07-31' });
    await repos.feriados.create({ descricao: 'Finados', inicio: '2026-11-02', fim: '2026-11-02' });
    await repos.feriados.create({ descricao: 'Tiradentes', inicio: '2026-04-21', fim: '2026-04-21' });
    assert.deepEqual((await repos.feriados.list()).map((f) => f.descricao), ['Tiradentes', 'Recesso', 'Finados']);
    assert.deepEqual((await repos.feriados.list({ inicio: '2026-07-20', fim: '2026-08-10' })).map((f) => f.descricao), ['Recesso']);
    assert.deepEqual((await repos.feriados.list({ inicio: '2026-08-01' })).map((f) => f.descricao), ['Finados']);
    assert.deepEqual((await repos.feriados.list({ fim: '2026-07-05' })).map((f) => f.descricao), ['Tiradentes']);
    assert.equal((await repos.feriados.findById(recesso.id)).fim, '2026-07-31');
    assert.equal(await repos.feriados.remove(recesso.id), true);
    assert.equal(await repos.feriados.findById(recesso.id), null);
  });

  it('usuário novo começa ativo, na versão de sessão 0', async () => {
    const criado = await repos.usuarios.create({ nome: 'Lu', email: 'lu@a.com', senhaHash: 'h', papel: 'professor' });
    assert.deepEqual([criado.ativo, criado.versaoSessao], [true, 0]);
  });

  it('devolve cópias, protegendo o estado interno', async () => {
    const aluno = await repos.alunos.create({ nome: 'Ana', status: 'ativo', planoId: 1 });
    aluno.nome = 'Alterado fora';
    assert.equal((await repos.alunos.findById(aluno.id)).nome, 'Ana');
    assert.ok(aluno.criadoEm && aluno.atualizadoEm);
  });
});

describe('repositórios em memória — isolamento entre escolas (multi-tenant)', () => {
  let sol;
  let lua;
  let dados; // registros criados na escola Sol
  beforeEach(async () => {
    const base = createMemoryRepositories();
    const escolaSol = await base.escolas.create({ nome: 'Escola Sol', codigo: 'sol' });
    const escolaLua = await base.escolas.create({ nome: 'Escola Lua', codigo: 'lua' });
    sol = base.paraEscola(escolaSol.id);
    lua = base.paraEscola(escolaLua.id);

    const professor = await sol.usuarios.create({ nome: 'Rita', email: 'rita@a.com', login: 'admin', senhaHash: 'h', papel: 'professor' });
    const plano = await sol.planos.create({ nome: 'Particular', tipo: 'particular', valor: 140, freqSemanal: 1, duracaoMin: 45 });
    const aluno = await sol.alunos.create({ nome: 'Ana', status: 'inativo', planoId: plano.id });
    const horario = await sol.horarios.create({ professorId: professor.id, diaSemana: 1, horaInicio: '14:00', duracaoMin: 45 });
    const [aula] = await sol.aulas.createMany([
      { professorId: professor.id, alunoId: aluno.id, data: '2026-10-05', hora: '14:00', duracaoMin: 45, status: 'agendada' },
    ]);
    dados = { professor, plano, aluno, horario, aula, escolaSol };
  });

  it('cada registro guarda a escola em que foi criado', () => {
    for (const registro of [dados.professor, dados.plano, dados.aluno, dados.horario, dados.aula]) {
      assert.equal(registro.escolaId, dados.escolaSol.id);
    }
  });

  it('outra escola não lista nem encontra por id os dados da Sol', async () => {
    assert.deepEqual(await lua.usuarios.list(), []);
    assert.deepEqual(await lua.planos.list(), []);
    assert.deepEqual(await lua.alunos.list(), []);
    assert.deepEqual(await lua.horarios.list(), []);
    assert.deepEqual(await lua.aulas.list(), []);
    assert.equal(await lua.usuarios.findById(dados.professor.id), null);
    assert.equal(await lua.usuarios.findByEmail('rita@a.com'), null);
    assert.equal(await lua.usuarios.findByLogin('admin'), null);
    assert.equal(await lua.planos.findById(dados.plano.id), null);
    assert.equal(await lua.alunos.findById(dados.aluno.id), null);
    assert.equal(await lua.horarios.findById(dados.horario.id), null);
    assert.equal(await lua.aulas.findById(dados.aula.id), null);
  });

  it('outra escola não altera nem exclui os dados da Sol', async () => {
    assert.equal(await lua.usuarios.update(dados.professor.id, { nome: 'Invasor' }), null);
    assert.equal(await lua.planos.update(dados.plano.id, { valor: 1 }), null);
    assert.equal(await lua.alunos.update(dados.aluno.id, { nome: 'Invasor' }), null);
    assert.equal(await lua.aulas.update(dados.aula.id, { status: 'cancelada' }), null);
    assert.equal(await lua.aulas.updateMany([dados.aula.id], { status: 'cancelada' }), 0);
    const feriadoDaSol = await sol.feriados.create({ descricao: 'Carnaval', inicio: '2027-02-08', fim: '2027-02-10' });
    assert.deepEqual(await lua.feriados.list(), []);
    assert.equal(await lua.feriados.findById(feriadoDaSol.id), null);
    assert.equal(await lua.feriados.remove(feriadoDaSol.id), false);
    assert.equal((await sol.feriados.list()).length, 1);
    assert.equal(await lua.planos.remove(dados.plano.id), false);
    assert.equal(await lua.horarios.remove(dados.horario.id), false);
    assert.deepEqual(await lua.alunos.remove(dados.aluno.id), { aulasExcluidas: 0 });

    // Tudo continua intacto na Sol.
    assert.equal((await sol.usuarios.findById(dados.professor.id)).nome, 'Rita');
    assert.equal((await sol.planos.findById(dados.plano.id)).valor, 140);
    assert.equal((await sol.alunos.findById(dados.aluno.id)).nome, 'Ana');
    assert.equal((await sol.horarios.list()).length, 1);
    assert.equal((await sol.aulas.findById(dados.aula.id)).status, 'agendada');
  });

  it('o mesmo e-mail e o mesmo usuário podem existir em escolas diferentes', async () => {
    const naLua = await lua.usuarios.create({ nome: 'Rita Lua', email: 'RITA@a.com', login: 'Admin', senhaHash: 'h', papel: 'coordenacao' });
    assert.equal(naLua.login, 'admin');
    assert.equal((await lua.usuarios.findByLogin('admin')).nome, 'Rita Lua');
    assert.equal((await sol.usuarios.findByLogin('admin')).nome, 'Rita');
  });

  it('a escola do registro nunca muda, mesmo que a edição tente trocá-la', async () => {
    const editado = await sol.alunos.update(dados.aluno.id, { nome: 'Ana Clara', escolaId: 999 });
    assert.equal(editado.escolaId, dados.escolaSol.id);
    const criado = await sol.planos.create({ nome: 'Grupo', tipo: 'grupo', valor: 90, freqSemanal: 1, duracaoMin: 60, escolaId: 999 });
    assert.equal(criado.escolaId, dados.escolaSol.id);
  });
});

describe('repositórios em memória — falta, reposição, diário e mensalidades (RF06–RF12)', () => {
  let base;
  let sol;
  let lua;
  let ana;
  let leo;
  beforeEach(async () => {
    base = createMemoryRepositories();
    sol = base.paraEscola((await base.escolas.create({ nome: 'Escola Sol', codigo: 'sol' })).id);
    lua = base.paraEscola((await base.escolas.create({ nome: 'Escola Lua', codigo: 'lua' })).id);
    ana = await sol.alunos.create({ nome: 'Ana', status: 'ativo', planoId: 1 });
    leo = await sol.alunos.create({ nome: 'Leo', status: 'ativo', planoId: 1 });
  });

  it('escolas: lista todas, em ordem de cadastro', async () => {
    assert.deepEqual((await base.escolas.list()).map((escola) => escola.codigo), ['sol', 'lua']);
  });

  it('aula comum não é reposição; a reposição aponta para a aula perdida', async () => {
    const comum = { alunoId: ana.id, professorId: 1, hora: '14:00', duracaoMin: 45 };
    const [aula] = await sol.aulas.createMany([{ ...comum, data: '2026-10-05', status: 'falta' }]);
    const [reposicao] = await sol.aulas.createMany([{ ...comum, data: '2026-10-07', status: 'agendada', reposicaoDeId: aula.id }]);
    assert.deepEqual([aula.reposicaoDeId, reposicao.reposicaoDeId], [null, aula.id]);
  });

  it('solicitações: padrões do banco e filtros por aluno, aulas e tipo', async () => {
    const aviso = await sol.solicitacoes.create({ alunoId: ana.id, aulaId: 7, tipo: 'falta', status: 'aprovada', liberaReposicao: true });
    const pedido = await sol.solicitacoes.create({ alunoId: leo.id, tipo: 'reposicao', novaData: '2026-10-07T14:00' });
    assert.deepEqual(
      [pedido.aulaId, pedido.status, pedido.liberaReposicao, pedido.novaData],
      [null, 'pendente', false, '2026-10-07T14:00'],
    );
    assert.ok(aviso.dataSolicitacao);
    assert.deepEqual((await sol.solicitacoes.list({ alunoId: ana.id })).map((s) => s.id), [aviso.id]);
    assert.deepEqual((await sol.solicitacoes.list({ alunoIds: [ana.id, leo.id] })).map((s) => s.id), [aviso.id, pedido.id]);
    assert.deepEqual((await sol.solicitacoes.list({ aulaIds: [7] })).map((s) => s.id), [aviso.id]);
    assert.deepEqual((await sol.solicitacoes.list({ tipo: 'reposicao' })).map((s) => s.id), [pedido.id]);
    assert.deepEqual(await lua.solicitacoes.list(), []);
  });

  it('diários: um por aula — salvar de novo atualiza', async () => {
    const primeiro = await sol.diarios.salvar({ aulaId: 3, conteudoMinistrado: 'Escalas' });
    assert.equal(primeiro.planoProxima, null);
    const segundo = await sol.diarios.salvar({ aulaId: 3, conteudoMinistrado: 'Escalas e arpejos', planoProxima: 'Leitura' });
    assert.equal(segundo.id, primeiro.id);
    assert.equal((await sol.diarios.findByAulaId(3)).conteudoMinistrado, 'Escalas e arpejos');
    assert.equal(await sol.diarios.findByAulaId(4), null);
    await sol.diarios.salvar({ aulaId: 4, conteudoMinistrado: 'Ritmo' });
    assert.deepEqual((await sol.diarios.list({ aulaIds: [4] })).map((d) => d.aulaId), [4]);
    assert.equal((await sol.diarios.list()).length, 2);
    assert.equal(await lua.diarios.findByAulaId(3), null);
  });

  it('mensalidades: uma por aluno e mês; filtros por mês, aluno e em aberto', async () => {
    const outubro = await sol.mensalidades.create({ alunoId: ana.id, mesReferencia: '2026-10', valor: 140, vencimento: '2026-10-10' });
    assert.deepEqual([outubro.status, outubro.dataPagamento, outubro.formaPagamento], ['pendente', null, null]);
    await assert.rejects(sol.mensalidades.create({ alunoId: ana.id, mesReferencia: '2026-10', valor: 1, vencimento: '2026-10-10' }), {
      name: ConflictError.name,
      message: 'Este aluno já tem mensalidade neste mês.',
    });
    const novembro = await sol.mensalidades.create({ alunoId: ana.id, mesReferencia: '2026-11', valor: 140, vencimento: '2026-11-10' });
    const doLeo = await sol.mensalidades.create({ alunoId: leo.id, mesReferencia: '2026-10', valor: 90, vencimento: '2026-10-10' });
    await sol.mensalidades.update(outubro.id, { status: 'paga', dataPagamento: '2026-10-05', formaPagamento: 'pix' });

    assert.deepEqual((await sol.mensalidades.list()).map((m) => m.id), [novembro.id, outubro.id, doLeo.id]); // mês mais recente primeiro
    assert.deepEqual((await sol.mensalidades.list({ mes: '2026-10' })).map((m) => m.id), [outubro.id, doLeo.id]);
    assert.deepEqual((await sol.mensalidades.list({ alunoId: leo.id })).map((m) => m.id), [doLeo.id]);
    assert.deepEqual((await sol.mensalidades.list({ alunoIds: [ana.id], naoPagas: true })).map((m) => m.id), [novembro.id]);
    assert.equal((await sol.mensalidades.findById(outubro.id)).formaPagamento, 'pix');
    assert.equal(await lua.mensalidades.findById(outubro.id), null);
    assert.equal(await lua.mensalidades.update(outubro.id, { status: 'pendente' }), null);
  });

  it('alertas: um de cada tipo por mensalidade, com status e tentativas', async () => {
    const alerta = await sol.alertas.create({ mensalidadeId: 1, tipo: 'vencimento', destinatario: 'mary@a.com' });
    assert.deepEqual([alerta.status, alerta.tentativas, alerta.ultimoErro, alerta.enviadoEm], ['pendente', 0, null, null]);
    await assert.rejects(sol.alertas.create({ mensalidadeId: 1, tipo: 'vencimento', destinatario: 'mary@a.com' }), {
      name: ConflictError.name,
      message: 'Este alerta já foi registrado.',
    });
    const atraso = await sol.alertas.create({ mensalidadeId: 1, tipo: 'atraso', destinatario: 'mary@a.com' });
    await sol.alertas.create({ mensalidadeId: 2, tipo: 'atraso', destinatario: 'rui@a.com' });
    await sol.alertas.update(alerta.id, { status: 'enviado', tentativas: 1 });
    assert.deepEqual((await sol.alertas.list({ status: 'pendente' })).map((a) => a.mensalidadeId), [1, 2]);
    assert.deepEqual((await sol.alertas.list({ mensalidadeIds: [1] })).map((a) => a.id), [alerta.id, atraso.id]);
    assert.deepEqual(await lua.alertas.list(), []);
  });

  it('excluir aluno apaga diários, solicitações, mensalidades e alertas dele, e só dele', async () => {
    const comum = { professorId: 1, hora: '14:00', duracaoMin: 45, status: 'realizada' };
    const [daAna, doLeo] = await sol.aulas.createMany([
      { ...comum, alunoId: ana.id, data: '2026-10-05' },
      { ...comum, alunoId: leo.id, data: '2026-10-06' },
    ]);
    await sol.diarios.salvar({ aulaId: daAna.id, conteudoMinistrado: 'Escalas' });
    await sol.diarios.salvar({ aulaId: doLeo.id, conteudoMinistrado: 'Ritmo' });
    await sol.solicitacoes.create({ alunoId: ana.id, aulaId: daAna.id, tipo: 'falta' });
    await sol.solicitacoes.create({ alunoId: leo.id, aulaId: doLeo.id, tipo: 'falta' });
    const daMensalidade = (alunoId) => ({ alunoId, mesReferencia: '2026-10', valor: 140, vencimento: '2026-10-10' });
    const mensalidadeDaAna = await sol.mensalidades.create(daMensalidade(ana.id));
    const mensalidadeDoLeo = await sol.mensalidades.create(daMensalidade(leo.id));
    await sol.alertas.create({ mensalidadeId: mensalidadeDaAna.id, tipo: 'atraso', destinatario: 'a@a.com' });
    await sol.alertas.create({ mensalidadeId: mensalidadeDoLeo.id, tipo: 'atraso', destinatario: 'l@a.com' });

    assert.deepEqual(await sol.alunos.remove(ana.id), { aulasExcluidas: 1 });
    assert.deepEqual((await sol.diarios.list()).map((d) => d.aulaId), [doLeo.id]);
    assert.deepEqual((await sol.solicitacoes.list()).map((s) => s.alunoId), [leo.id]);
    assert.deepEqual((await sol.mensalidades.list()).map((m) => m.alunoId), [leo.id]);
    assert.deepEqual((await sol.alertas.list()).map((a) => a.mensalidadeId), [mensalidadeDoLeo.id]);
  });
});

describe('repositórios em memória — Pix da escola, redefinição de senha e recibo numerado', () => {
  it('escolas: começam sem Pix; a edição muda nome e Pix, nunca o código', async () => {
    const { escolas } = createMemoryRepositories();
    const sol = await escolas.create({ nome: 'Escola Sol', codigo: 'sol' });
    assert.deepEqual([sol.pixTipo, sol.pixChave, sol.pixRecebedor, sol.pixCidade], [null, null, null, null]);
    const editada = await escolas.update(sol.id, { nome: 'Escola Sol Nascente', codigo: 'outro', pixTipo: 'email', pixChave: 'a@b.com' });
    assert.deepEqual([editada.nome, editada.codigo, editada.pixChave], ['Escola Sol Nascente', 'sol', 'a@b.com']);
    assert.equal(await escolas.update(999, { nome: 'x' }), null);
  });

  it('redefinições de senha: busca pelo hash, usa uma vez só, invalida as da pessoa e apaga as vencidas', async () => {
    const { redefinicoesDeSenha: pedidos } = createMemoryRepositories();
    const a = await pedidos.create({ escolaId: 1, usuarioId: 7, tokenHash: 'h1', expiraEm: '2026-10-07T14:00:00.000Z' });
    await pedidos.create({ escolaId: 1, usuarioId: 7, tokenHash: 'h2', expiraEm: '2026-10-07T15:00:00.000Z' });
    await pedidos.create({ escolaId: 1, usuarioId: 8, tokenHash: 'h3', expiraEm: '2026-10-07T12:00:00.000Z' });
    assert.deepEqual([a.usadoEm, (await pedidos.findByTokenHash('h1')).id], [null, a.id]);
    assert.equal(await pedidos.findByTokenHash('nenhum'), null);
    assert.equal(await pedidos.usar(a.id, '2026-10-07T13:00:00.000Z'), true);
    assert.equal(await pedidos.usar(a.id, '2026-10-07T13:01:00.000Z'), false); // já usado
    assert.equal(await pedidos.usar(999, '2026-10-07T13:01:00.000Z'), false);
    assert.equal(await pedidos.invalidarDoUsuario(7, '2026-10-07T13:02:00.000Z'), 1); // só o h2 estava aberto
    assert.equal((await pedidos.findByTokenHash('h2')).usadoEm, '2026-10-07T13:02:00.000Z');
    assert.equal(await pedidos.removerVencidos('2026-10-07T13:00:00.000Z'), 1); // o h3
    assert.equal(await pedidos.findByTokenHash('h3'), null);
  });

  it('mensalidades: em aberto é pendente ou atrasada (sem a cancelada); recibo numerado por escola', async () => {
    const base = createMemoryRepositories();
    const sol = base.paraEscola((await base.escolas.create({ nome: 'Sol', codigo: 'sol' })).id);
    const lua = base.paraEscola((await base.escolas.create({ nome: 'Lua', codigo: 'lua' })).id);
    const nova = (repos, alunoId, status) =>
      repos.mensalidades.create({ alunoId, mesReferencia: '2026-10', valor: 140, vencimento: '2026-10-10', status });
    const m1 = await nova(sol, 1, 'pendente');
    const m2 = await nova(sol, 2, 'atrasada');
    await nova(sol, 3, 'cancelada');
    await nova(sol, 4, 'paga');
    assert.deepEqual([m1.valorOriginal, m1.ajusteMotivo, m1.cancelamentoMotivo, m1.numeroRecibo], [null, null, null, null]);
    assert.deepEqual((await sol.mensalidades.list({ naoPagas: true })).map((m) => m.alunoId), [1, 2]);

    assert.equal((await sol.mensalidades.registrarNumeroRecibo(m2.id)).numeroRecibo, 1);
    assert.equal((await sol.mensalidades.registrarNumeroRecibo(m1.id)).numeroRecibo, 2);
    assert.equal((await sol.mensalidades.registrarNumeroRecibo(m2.id)).numeroRecibo, 1); // já tinha: mantém
    const daLua = await nova(lua, 1, 'paga');
    assert.equal((await lua.mensalidades.registrarNumeroRecibo(daLua.id)).numeroRecibo, 1); // cada escola, a sua sequência
    assert.equal(await lua.mensalidades.registrarNumeroRecibo(m1.id), null); // da outra escola: não encontra
  });
});
