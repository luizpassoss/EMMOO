import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import { createAulaService } from '../../src/modules/aulas/aula.service.js';
import { createHorarioService } from '../../src/modules/horarios/horario.service.js';
import { createUsuarioService } from '../../src/modules/usuarios/usuario.service.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../src/shared/errors.js';
import { hasherFake, reposDaEscolaDemo } from '../helpers/fakes.js';

// Seed com HOJE = quarta 07/10/2026: Ana tem aula às segundas 14:00 (aulas 1–8, desde 05/10)
// e Pedro às quartas 15:30 (aulas 9–16, desde 07/10), ambos com o professor Luiz (id 2).
const COORDENACAO = { id: 1, papel: 'coordenacao' };
const PROFESSOR = { id: 2, papel: 'professor' };
const RESPONSAVEL = { id: 3, papel: 'responsavel' };
const SEMANA = { inicio: '2026-10-05', fim: '2026-10-11' };

let repos;
let carla; // segunda professora, para testar o isolamento entre professores
beforeEach(async () => {
  ({ repos } = await reposDaEscolaDemo({ hoje: '2026-10-07' }));
  carla = await repos.usuarios.create({ nome: 'Carla', email: 'carla@emmoo.com.br', senhaHash: 'h', papel: 'professor' });
});

describe('UsuarioService', () => {
  const criar = () => createUsuarioService({ usuarios: repos.usuarios, passwordHasher: hasherFake });
  const nova = { nome: 'Bia', email: 'Bia@Email.com', login: 'Bia.Prof', senha: 'segredo1', papel: 'professor' };

  it('lista usuários sem expor o hash da senha, com filtro por papel', async () => {
    const todos = await criar().listar();
    assert.deepEqual(todos.map((u) => u.nome), ['Carla', 'Lucimara', 'Luiz', 'Mary']);
    assert.equal(todos[0].senhaHash, undefined);
    assert.equal(todos.find((u) => u.nome === 'Lucimara').login, 'admin');
    assert.deepEqual((await criar().listar({ papel: 'responsavel' })).map((u) => u.nome), ['Mary']);
  });
  it('rejeita papel desconhecido', async () => {
    await assert.rejects(criar().listar({ papel: 'admin' }), ValidationError);
  });

  it('cadastra usuário normalizando e-mail e login, com a senha guardada em hash', async () => {
    const criado = await criar().criar(nova);
    assert.deepEqual([criado.email, criado.login, criado.papel], ['bia@email.com', 'bia.prof', 'professor']);
    assert.equal(criado.senhaHash, undefined);
    assert.equal((await repos.usuarios.findByLogin('bia.prof')).senhaHash, 'hash:segredo1');
  });
  it('valida os dados e recusa e-mail ou usuário repetidos na escola', async () => {
    await assert.rejects(criar().criar({ nome: 'B', email: 'x', login: 'a@b', senha: '123', papel: 'chefe' }), (erro) => {
      assert.deepEqual(erro.details.map((d) => d.campo), ['nome', 'email', 'login', 'senha', 'papel']);
      return true;
    });
    await assert.rejects(criar().criar({ ...nova, email: 'luiz@emmoo.com.br' }), { message: 'E-mail já cadastrado nesta escola.' });
    await assert.rejects(criar().criar({ ...nova, login: 'admin' }), { message: 'Usuário já cadastrado nesta escola.' });
  });
  it('edita dados e perfil; senha em branco mantém a atual', async () => {
    const editado = await criar().atualizar(carla.id, { ...nova, nome: 'Carla S.', senha: '' }, COORDENACAO);
    assert.deepEqual([editado.nome, editado.login], ['Carla S.', 'bia.prof']);
    assert.equal((await repos.usuarios.findById(carla.id)).senhaHash, 'h'); // não trocou
    await criar().atualizar(carla.id, { ...nova, senha: 'outrasenha' }, COORDENACAO);
    assert.equal((await repos.usuarios.findById(carla.id)).senhaHash, 'hash:outrasenha');
    await assert.rejects(criar().atualizar(carla.id, { ...nova, senha: '12' }, COORDENACAO), ValidationError);
    await assert.rejects(criar().atualizar(999, nova, COORDENACAO), NotFoundError);
  });
  it('ninguém muda o próprio perfil (a escola não fica sem coordenação)', async () => {
    const dados = { nome: 'Lucimara', email: 'lucimara@emmoo.com.br', login: 'admin', papel: 'professor' };
    await assert.rejects(criar().atualizar(1, dados, COORDENACAO), { message: 'Dados inválidos.' });
    const mesmoPerfil = await criar().atualizar(1, { ...dados, papel: 'coordenacao', nome: 'Lucimara M.' }, COORDENACAO);
    assert.equal(mesmoPerfil.nome, 'Lucimara M.');
  });

  it('desativa o acesso encerrando a sessão; reativa depois', async () => {
    const desativado = await criar().desativar(String(carla.id), COORDENACAO);
    assert.equal(desativado.ativo, false);
    assert.equal((await repos.usuarios.findById(carla.id)).versaoSessao, 1); // o token antigo da Carla não vale mais
    await assert.rejects(criar().desativar(carla.id, COORDENACAO), { message: 'Este acesso já está desativado.' });
    assert.equal((await criar().listar({ papel: 'professor' })).find((u) => u.id === carla.id).ativo, false);

    const reativado = await criar().reativar(carla.id);
    assert.equal(reativado.ativo, true);
    await assert.rejects(criar().reativar(carla.id), { message: 'Este acesso já está ativo.' });
    await assert.rejects(criar().desativar(999, COORDENACAO), NotFoundError);
  });

  it('ninguém desativa o próprio acesso', async () => {
    await assert.rejects(criar().desativar(1, COORDENACAO), {
      name: 'ConflictError',
      message: 'Você não pode desativar o seu próprio acesso.',
    });
  });

  it('trocar o perfil ou redefinir a senha de alguém encerra as sessões dessa pessoa', async () => {
    const versao = async () => (await repos.usuarios.findById(carla.id)).versaoSessao;
    const dados = { nome: 'Carla', email: 'carla@emmoo.com.br', papel: 'professor' };
    await criar().atualizar(carla.id, { ...dados, nome: 'Carla S.' }, COORDENACAO);
    assert.equal(await versao(), 0); // só o nome: a sessão continua
    await criar().atualizar(carla.id, { ...dados, papel: 'responsavel' }, COORDENACAO);
    assert.equal(await versao(), 1);
    await criar().atualizar(carla.id, { ...dados, papel: 'responsavel', senha: 'nova-senha' }, COORDENACAO);
    assert.equal(await versao(), 2);
    // A própria senha trocada não derruba quem está usando o sistema.
    const lucimara = { nome: 'Lucimara', email: 'lucimara@emmoo.com.br', login: 'admin', papel: 'coordenacao' };
    await criar().atualizar(1, { ...lucimara, senha: 'outra-senha' }, COORDENACAO);
    assert.equal((await repos.usuarios.findById(1)).versaoSessao, 0);
  });
});

describe('HorarioService (RF04)', () => {
  // Relógio fixo: segunda 05/10, antes das aulas (salvo quando o teste diz outra coisa).
  const criar = ({ hoje = '2026-10-05', agora = '08:00' } = {}) =>
    createHorarioService({
      horarios: repos.horarios,
      aulas: repos.aulas,
      feriados: repos.feriados,
      usuarios: repos.usuarios,
      hoje: () => hoje,
      agora: () => agora,
    });

  it('professor vê só os próprios horários; coordenação filtra por professor', async () => {
    assert.equal((await criar().listar({}, PROFESSOR)).length, 8);
    assert.equal((await criar().listar({ professorId: String(carla.id) }, COORDENACAO)).length, 0);
    assert.equal((await criar().listar({}, COORDENACAO)).length, 8);
    await assert.rejects(criar().listar({ professorId: carla.id }, PROFESSOR), ForbiddenError);
    await assert.rejects(criar().listar({ professorId: '1' }, COORDENACAO), ValidationError); // não é professor
    await assert.rejects(criar().listar({ professorId: 'abc' }, COORDENACAO), ValidationError);
  });

  it('professor cadastra horário na própria agenda', async () => {
    const criado = await criar().criar({ diaSemana: '2', horaInicio: '09:00' }, PROFESSOR);
    assert.deepEqual(
      { professorId: criado.professorId, diaSemana: criado.diaSemana, duracaoMin: criado.duracaoMin, disponivel: criado.disponivel },
      { professorId: 2, diaSemana: 2, duracaoMin: 45, disponivel: true },
    );
    await assert.rejects(criar().criar({ diaSemana: 2, horaInicio: '10:00', professorId: carla.id }, PROFESSOR), ForbiddenError);
  });

  it('coordenação precisa escolher o professor', async () => {
    await assert.rejects(criar().criar({ diaSemana: 2, horaInicio: '10:00' }, COORDENACAO), (erro) => {
      assert.ok(erro instanceof ValidationError);
      assert.equal(erro.details[0].campo, 'professorId');
      return true;
    });
    const criado = await criar().criar({ diaSemana: 2, horaInicio: '10:00', professorId: carla.id }, COORDENACAO);
    assert.equal(criado.professorId, carla.id);
  });

  it('recusa horário sobreposto no mesmo dia e dados inválidos', async () => {
    await assert.rejects(criar().criar({ diaSemana: 1, horaInicio: '14:30' }, PROFESSOR), (erro) => {
      assert.ok(erro instanceof ConflictError);
      assert.match(erro.details[0].mensagem, /segunda-feira às 14:00/);
      return true;
    });
    await assert.doesNotReject(criar().criar({ diaSemana: 2, horaInicio: '14:30' }, PROFESSOR)); // outro dia
    await assert.rejects(criar().criar({ diaSemana: 9, horaInicio: '25:00' }, PROFESSOR), ValidationError);
  });

  it('remove horário: professor só o próprio', async () => {
    await criar().remover('1', PROFESSOR);
    assert.equal((await repos.horarios.list({ professorId: 2 })).length, 7);
    const daCarla = await criar().criar({ diaSemana: 2, horaInicio: '10:00', professorId: carla.id }, COORDENACAO);
    await assert.rejects(criar().remover(daCarla.id, PROFESSOR), ForbiddenError);
    await criar().remover(daCarla.id, COORDENACAO);
    await assert.rejects(criar().remover(999, COORDENACAO), NotFoundError);
    await assert.rejects(criar().remover('x', COORDENACAO), ValidationError);
  });

  it('RF05 — vagas livres descontam aulas marcadas; aula cancelada libera a vaga', async () => {
    const livres = await criar().livres(SEMANA, PROFESSOR);
    assert.equal(livres.length, 6); // 8 vagas − Ana (seg 14:00) − Pedro (qua 15:30)
    assert.deepEqual(livres[0], { data: '2026-10-05', hora: '14:45', duracaoMin: 45 });
    await repos.aulas.update(1, { status: 'cancelada' });
    assert.equal((await criar().livres({ ...SEMANA, professorId: '2' }, COORDENACAO)).length, 7);
  });

  it('RF05 — vaga que já passou não é oferecida (dias anteriores e horas de hoje que já foram)', async () => {
    // Segunda 05/10 às 14:50: das vagas de segunda, só 15:30 e 16:15 ainda não começaram.
    const livres = await criar({ agora: '14:50' }).livres(SEMANA, PROFESSOR);
    assert.deepEqual(
      livres.filter((vaga) => vaga.data === '2026-10-05').map((vaga) => vaga.hora),
      ['15:30', '16:15'],
    );
    // Na quarta 07/10, as vagas de segunda já não aparecem.
    const naQuarta = await criar({ hoje: '2026-10-07', agora: '08:00' }).livres(SEMANA, PROFESSOR);
    assert.ok(naQuarta.every((vaga) => vaga.data >= '2026-10-07'));
    assert.equal(naQuarta.length, 3); // quarta: 14:00, 14:45, 16:15 (15:30 é do Pedro)
  });

  it('usa a data e a hora atuais quando nenhum relógio é informado', async () => {
    const semRelogio = createHorarioService({ horarios: repos.horarios, aulas: repos.aulas, usuarios: repos.usuarios, feriados: repos.feriados });
    assert.deepEqual(await semRelogio.livres({ inicio: '2000-01-03', fim: '2000-01-09' }, PROFESSOR), []); // tudo no passado
  });

  it('vagas livres exigem período válido e professor', async () => {
    await assert.rejects(criar().livres(SEMANA, COORDENACAO), ValidationError);
    await assert.rejects(criar().livres({ inicio: '2026-10-11', fim: '2026-10-05' }, PROFESSOR), ValidationError);
    await assert.rejects(criar().livres({}, PROFESSOR), ValidationError);
  });
});

describe('AulaService (RF05, RN08–RN10)', () => {
  const criar = ({ agora = '08:00' } = {}) =>
    createAulaService({
      aulas: repos.aulas,
      solicitacoes: repos.solicitacoes,
      diarios: repos.diarios,
      feriados: repos.feriados,
      alunos: repos.alunos,
      planos: repos.planos,
      usuarios: repos.usuarios,
      hoje: () => '2026-10-05', // segunda-feira da semana do seed
      agora: () => agora,
    });
  const agendamento = { alunoId: 2, professorId: 2, data: '2026-10-05', hora: '14:45' };

  it('coordenação vê toda a agenda, com nomes de aluno e professor', async () => {
    const aulas = await criar().listar(SEMANA, COORDENACAO);
    assert.equal(aulas.length, 2);
    assert.deepEqual(aulas[0].aluno, { id: 1, nome: 'Ana Beatriz', instrumento: 'Violino' });
    assert.deepEqual(aulas[0].professor, { id: 2, nome: 'Luiz' });
    assert.deepEqual((await criar().listar({ ...SEMANA, alunoId: '2' }, COORDENACAO)).map((a) => a.aluno.nome), ['Pedro Henrique']);
    assert.equal((await criar().listar({ ...SEMANA, professorId: carla.id }, COORDENACAO)).length, 0);
  });

  it('professor vê só as próprias aulas; responsável, só as dos seus dependentes', async () => {
    await repos.aulas.createMany([
      { alunoId: 2, professorId: carla.id, data: '2026-10-06', hora: '10:00', duracaoMin: 45, status: 'agendada' },
    ]);
    assert.equal((await criar().listar(SEMANA, PROFESSOR)).length, 2);
    assert.deepEqual((await criar().listar(SEMANA, RESPONSAVEL)).map((a) => a.aluno.nome), ['Ana Beatriz']);
    const semDependentes = await repos.usuarios.create({ nome: 'Rui', email: 'rui@x.com', senhaHash: 'h', papel: 'responsavel' });
    assert.deepEqual(await criar().listar(SEMANA, { id: semDependentes.id, papel: 'responsavel' }), []);
  });

  it('exige período válido de no máximo 62 dias', async () => {
    await assert.rejects(criar().listar({}, COORDENACAO), ValidationError);
    await assert.rejects(criar().listar({ inicio: '2026-01-01', fim: '2026-12-31' }, COORDENACAO), (erro) => {
      assert.match(erro.details[0].mensagem, /62 dias/);
      return true;
    });
  });

  it('agenda série semanal usando a duração do plano do aluno', async () => {
    const criadas = await criar().agendar({ ...agendamento, semanas: '3' });
    assert.deepEqual(criadas.map((a) => a.data), ['2026-10-05', '2026-10-12', '2026-10-19']);
    assert.ok(criadas.every((a) => a.status === 'agendada' && a.duracaoMin === 45 && a.aluno.nome === 'Pedro Henrique'));
    const [longa] = await criar().agendar({ ...agendamento, hora: '09:00', duracaoMin: 90 });
    assert.equal(longa.duracaoMin, 90);
  });

  it('RN09 — recusa conflito com aula do professor e não cria nenhuma aula da série', async () => {
    const antes = (await repos.aulas.list()).length;
    await assert.rejects(criar().agendar({ ...agendamento, hora: '14:30', semanas: 2 }), (erro) => {
      assert.ok(erro instanceof ConflictError);
      assert.equal(erro.details[0].campo, 'hora');
      assert.equal(
        erro.details[0].mensagem,
        '05/10/2026 às 14:30: o professor já tem aula das 14:00 (45 min). Outra data também conflita.',
      );
      return true;
    });
    await assert.rejects(criar().agendar({ ...agendamento, hora: '14:30', semanas: 3 }), (erro) =>
      erro.details[0].mensagem.endsWith('Outras 2 datas também conflitam.'),
    );
    assert.equal((await repos.aulas.list()).length, antes);
  });

  it('RN10 — recusa conflito com outra aula do aluno, mesmo com outro professor', async () => {
    await assert.rejects(criar().agendar({ alunoId: 1, professorId: carla.id, data: '2026-10-05', hora: '14:15' }), {
      message: 'Conflito de agenda.',
    });
    const erro = await criar()
      .agendar({ alunoId: 1, professorId: carla.id, data: '2026-10-05', hora: '14:15' })
      .catch((e) => e);
    assert.match(erro.details[0].mensagem, /o aluno já tem aula das 14:00/);
  });

  it('aula cancelada libera o horário para novo agendamento', async () => {
    await criar().cancelar(1, COORDENACAO);
    const [nova] = await criar().agendar({ ...agendamento, hora: '14:00' });
    assert.equal(nova.hora, '14:00');
  });

  it('RN08 — aluno inativo não pode ter aulas; valida aluno e professor', async () => {
    await repos.alunos.update(2, { status: 'inativo' });
    await assert.rejects(criar().agendar(agendamento), (erro) => erro.details[0].mensagem.includes('inativo'));
    await assert.rejects(criar().agendar({ ...agendamento, alunoId: 99, professorId: 1 }), (erro) => {
      assert.deepEqual(erro.details.map((d) => d.campo), ['alunoId', 'professorId']);
      return true;
    });
    await assert.rejects(criar().agendar({}), ValidationError);
  });

  it('não agenda com professor de acesso desativado', async () => {
    await repos.usuarios.update(2, { ativo: false });
    await assert.rejects(criar().agendar(agendamento), (erro) => {
      assert.deepEqual(erro.details, [{ campo: 'professorId', mensagem: 'Este professor está com o acesso desativado.' }]);
      return true;
    });
  });

  it('usa 45 min quando o plano do aluno não existe mais', async () => {
    const orfao = await repos.alunos.create({ nome: 'Órfão', planoId: 99, status: 'ativo' });
    const [aula] = await criar().agendar({ ...agendamento, alunoId: orfao.id });
    assert.equal(aula.duracaoMin, 45);
  });

  it('cancela aula agendada uma única vez; professor só as próprias', async () => {
    const cancelada = await criar().cancelar('1', PROFESSOR);
    assert.equal(cancelada.status, 'cancelada');
    assert.equal(cancelada.aluno.nome, 'Ana Beatriz');
    await assert.rejects(criar().cancelar(1, COORDENACAO), ConflictError);
    const [daCarla] = await repos.aulas.createMany([
      { alunoId: 2, professorId: carla.id, data: '2026-10-06', hora: '10:00', duracaoMin: 45, status: 'agendada' },
    ]);
    await assert.rejects(criar().cancelar(daCarla.id, PROFESSOR), ForbiddenError);
    await assert.rejects(criar().cancelar(999, COORDENACAO), NotFoundError);
  });

  it('não agenda em data passada, mas aceita hoje', async () => {
    await assert.rejects(criar().agendar({ ...agendamento, data: '2026-10-04' }), (erro) => {
      assert.ok(erro instanceof ValidationError);
      assert.deepEqual(erro.details, [{ campo: 'data', mensagem: 'Escolha uma data a partir de hoje.' }]);
      return true;
    });
    assert.equal((await criar().agendar(agendamento))[0].data, '2026-10-05');
  });

  it('não cancela aula que já começou: de dia anterior ou de hoje, depois do horário', async () => {
    const [passada] = await repos.aulas.createMany([
      { alunoId: 2, professorId: 2, data: '2026-10-02', hora: '10:00', duracaoMin: 45, status: 'agendada' },
    ]);
    const mensagem = { message: 'Esta aula já começou e não pode mais ser cancelada.' };
    await assert.rejects(criar().cancelar(passada.id, COORDENACAO), mensagem);
    // Ana tem aula hoje (05/10) às 14:00 (aula 1).
    await assert.rejects(criar({ agora: '14:00' }).cancelar(1, COORDENACAO), mensagem);
    assert.equal((await criar({ agora: '13:59' }).cancelar(1, COORDENACAO)).status, 'cancelada');
  });

  it('aula cancelada sai da agenda de todos, qualquer que seja o motivo; realizada e falta continuam', async () => {
    await repos.aulas.update(1, { status: 'cancelada', motivoCancelamento: 'inativacao' }); // Ana, 05/10
    await repos.aulas.update(9, { status: 'cancelada', motivoCancelamento: 'manual' }); // Pedro, 07/10
    for (const usuario of [COORDENACAO, PROFESSOR, RESPONSAVEL]) {
      assert.deepEqual(await criar().listar(SEMANA, usuario), [], usuario.papel);
    }
    await repos.aulas.update(1, { status: 'realizada', motivoCancelamento: null });
    await repos.aulas.update(9, { status: 'falta', motivoCancelamento: null });
    assert.deepEqual((await criar().listar(SEMANA, COORDENACAO)).map((aula) => aula.status), ['realizada', 'falta']);
  });

  it('cancelar tira a aula da agenda já na próxima consulta, em qualquer semana', async () => {
    await criar().cancelar(2, COORDENACAO); // Ana, segunda 12/10
    const proximaSemana = await criar().listar({ inicio: '2026-10-12', fim: '2026-10-18' }, COORDENACAO);
    assert.deepEqual(proximaSemana.map((aula) => aula.id), [10]); // só o Pedro, na quarta
    // O registro continua guardado (histórico), como cancelado à mão.
    assert.equal((await repos.aulas.findById(2)).motivoCancelamento, 'manual');
  });

  it('cancelamento na agenda fica registrado como manual (não volta ao reativar o aluno)', async () => {
    await criar().cancelar(1, COORDENACAO);
    assert.equal((await repos.aulas.findById(1)).motivoCancelamento, 'manual');
  });

  it('não agenda num horário de hoje que já passou', async () => {
    await assert.rejects(criar({ agora: '15:00' }).agendar({ ...agendamento, hora: '14:45' }), (erro) => {
      assert.deepEqual(erro.details, [{ campo: 'hora', mensagem: 'Este horário de hoje já passou. Escolha um mais tarde.' }]);
      return true;
    });
    const [nova] = await criar({ agora: '15:00' }).agendar({ ...agendamento, hora: '16:15' });
    assert.deepEqual([nova.data, nova.hora, nova.motivoCancelamento], ['2026-10-05', '16:15', null]);
  });

  it('usa a data atual quando nenhuma é informada', async () => {
    const semRelogio = createAulaService({
      aulas: repos.aulas,
      solicitacoes: repos.solicitacoes,
      diarios: repos.diarios,
      feriados: repos.feriados,
      alunos: repos.alunos,
      planos: repos.planos,
      usuarios: repos.usuarios,
    });
    await assert.rejects(semRelogio.agendar({ ...agendamento, data: '2000-01-03' }), ValidationError);
  });

  it('mantém a aula na listagem mesmo sem aluno ou professor cadastrados', async () => {
    await repos.aulas.createMany([
      { alunoId: 99, professorId: 98, data: '2026-10-06', hora: '08:00', duracaoMin: 45, status: 'agendada' },
    ]);
    const orfa = (await criar().listar(SEMANA, COORDENACAO)).find((aula) => aula.alunoId === 99);
    assert.equal(orfa.aluno, null);
    assert.equal(orfa.professor, null);
  });
});
