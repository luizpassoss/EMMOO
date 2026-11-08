import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { createContainer } from '../../src/container.js';

let server;
let baseUrl;

before(async () => {
  const env = loadEnv({ NODE_ENV: 'test', DB_DRIVER: 'memory', JWT_SECRET: 'segredo-de-teste' });
  const { auth, escolas, servicosDaEscola, tokenService } = await createContainer(env);
  const app = createApp({ auth, escolas, servicosDaEscola, tokenService, corsOrigin: env.corsOrigin, logger: { error() {} } });
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(() => new Promise((resolve) => server.close(resolve)));

async function chamar(metodo, caminho, { token, corpo, corpoBruto } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (corpoBruto !== undefined || corpo !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = corpoBruto ?? JSON.stringify(corpo);
  }
  const resposta = await fetch(`${baseUrl}${caminho}`, { method: metodo, headers, body });
  const texto = await resposta.text();
  return { status: resposta.status, body: texto ? JSON.parse(texto) : null };
}

/** Data local "AAAA-MM-DD" daqui a N dias (o seed parte da semana atual). */
function hojeLocal(dias = 0) {
  const data = new Date();
  data.setDate(data.getDate() + dias);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

/** Entra numa escola (por padrão, a de demonstração) e devolve o token. */
async function logar(login, senha, escola = 'emmoo') {
  const { status, body } = await chamar('POST', '/auth/login', { corpo: { escola, login, senha } });
  assert.equal(status, 200);
  return body.token;
}

describe('API EMMOO — ponta a ponta', () => {
  let coordenacao;
  let professor;
  let responsavel;

  before(async () => {
    coordenacao = await logar('admin', 'admin');
    professor = await logar('luiz', 'Luiz123');
    responsavel = await logar('mary@emmoo.com.br', 'emmoo123');
  });

  it('GET /health responde ok', async () => {
    const { status, body } = await chamar('GET', '/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
  });

  it('login: credenciais inválidas (401), campos ausentes (400) e sucesso sem expor senha', async () => {
    const entrar = (corpo) => chamar('POST', '/auth/login', { corpo });
    assert.equal((await entrar({ escola: 'emmoo', login: 'admin', senha: 'x' })).status, 401);
    assert.equal((await entrar({ escola: 'emmoo', login: 'admin', senha: 'emmoo123' })).status, 401);
    const outraEscola = await entrar({ escola: 'nao-existe', login: 'admin', senha: 'admin' });
    assert.deepEqual([outraEscola.status, outraEscola.body.error.message], [401, 'Escola, usuário ou senha inválidos.']);
    const invalido = await entrar({});
    assert.equal(invalido.status, 400);
    assert.equal(invalido.body.error.code, 'VALIDATION_ERROR');
    assert.deepEqual(invalido.body.error.details.map((d) => d.campo), ['escola', 'login', 'senha']);
    assert.equal((await entrar({ login: 'admin', senha: 'admin' })).status, 400); // sem escola

    const ok = await entrar({ escola: 'EMMOO', login: 'ADMIN', senha: 'admin' });
    assert.equal(ok.body.usuario.papel, 'coordenacao');
    assert.equal(ok.body.usuario.senhaHash, undefined);
    assert.deepEqual(ok.body.usuario.escola, { id: 1, nome: 'Escola de Música EMMOO', codigo: 'emmoo' });
    // O e-mail continua valendo, inclusive no campo antigo "email".
    const porEmail = await entrar({ escola: 'emmoo', email: 'lucimara@emmoo.com.br', senha: 'admin' });
    assert.equal(porEmail.status, 200);
    const luiz = await entrar({ escola: 'emmoo', login: 'luiz', senha: 'Luiz123' });
    assert.equal(luiz.body.usuario.papel, 'professor');
  });

  it('GET /auth/me exige token válido e devolve a escola', async () => {
    assert.equal((await chamar('GET', '/auth/me')).status, 401);
    assert.equal((await chamar('GET', '/auth/me', { token: 'invalido' })).status, 401);
    const { status, body } = await chamar('GET', '/auth/me', { token: professor });
    assert.equal(status, 200);
    assert.deepEqual([body.nome, body.escola.codigo], ['Luiz', 'emmoo']);
  });

  it('planos: todos listam, só a coordenação cria (RN01)', async () => {
    const lista = await chamar('GET', '/planos', { token: responsavel });
    assert.equal(lista.status, 200);
    assert.equal(lista.body.find((plano) => plano.id === 1).valor, 140);
    const novo = { nome: 'Grupo · 3 aulas por semana', tipo: 'grupo', valor: 250, freqSemanal: 3 };
    assert.equal((await chamar('POST', '/planos', { token: professor, corpo: novo })).status, 403);
    const criado = await chamar('POST', '/planos', { token: coordenacao, corpo: novo });
    assert.equal(criado.status, 201);
    assert.equal(criado.body.duracaoMin, 45);
    const invalido = await chamar('POST', '/planos', { token: coordenacao, corpo: { nome: 'X' } });
    assert.equal(invalido.status, 400);
    assert.ok(invalido.body.error.details.length > 0);
  });

  it('alunos: permissões de leitura por papel', async () => {
    assert.equal((await chamar('GET', '/alunos')).status, 401);
    assert.equal((await chamar('GET', '/alunos', { token: responsavel })).status, 403);
    const lista = await chamar('GET', '/alunos', { token: professor });
    assert.equal(lista.status, 200);
    assert.equal(lista.body.length, 2);
  });

  it('alunos: ciclo completo de cadastro, edição e inativação (RF02, RN08)', async () => {
    const dados = { nome: 'Lia', contato: 'lia@email.com', instrumento: 'Canto', planoId: 1 };
    assert.equal((await chamar('POST', '/alunos', { token: professor, corpo: dados })).status, 403);
    const criado = await chamar('POST', '/alunos', { token: coordenacao, corpo: dados });
    assert.equal(criado.status, 201);
    assert.equal(criado.body.status, 'ativo');
    const id = criado.body.id;

    assert.equal((await chamar('GET', `/alunos/${id}`, { token: professor })).body.nome, 'Lia');
    assert.equal((await chamar('GET', '/alunos/999', { token: coordenacao })).status, 404);
    assert.equal((await chamar('GET', '/alunos/abc', { token: coordenacao })).status, 400);

    const editado = await chamar('PUT', `/alunos/${id}`, { token: coordenacao, corpo: { ...dados, instrumento: 'Piano' } });
    assert.equal(editado.body.instrumento, 'Piano');

    assert.equal((await chamar('PATCH', `/alunos/${id}/inativar`, { token: coordenacao })).body.status, 'inativo');
    assert.equal((await chamar('PATCH', `/alunos/${id}/inativar`, { token: coordenacao })).status, 409);

    const inativos = await chamar('GET', '/alunos?status=inativo', { token: coordenacao });
    assert.deepEqual(inativos.body.map((a) => a.nome), ['Lia']);
    assert.equal((await chamar('GET', '/alunos?status=pausado', { token: coordenacao })).status, 400);
  });

  it('alunos: referência a plano inexistente é recusada', async () => {
    const resposta = await chamar('POST', '/alunos', {
      token: coordenacao,
      corpo: { nome: 'Teo', contato: '(47) 90000-0000', instrumento: 'Bateria', planoId: 999 },
    });
    assert.equal(resposta.status, 400);
    assert.equal(resposta.body.error.details[0].campo, 'planoId');
  });

  it('rota inexistente (404) e JSON malformado (400)', async () => {
    assert.equal((await chamar('GET', '/nao-existe')).status, 404);
    const malformado = await chamar('POST', '/auth/login', { corpoBruto: '{"email":' });
    assert.equal(malformado.status, 400);
    assert.equal(malformado.body.error.code, 'INVALID_JSON');
  });
});

describe('API EMMOO — agenda ponta a ponta (RF04, RF05)', () => {
  // Datas em 2031 para não colidir com as aulas de demonstração, que partem da semana atual.
  const SEMANA = 'inicio=2031-03-03&fim=2031-03-09'; // segunda a domingo
  let coordenacao;
  let professor;
  let responsavel;

  before(async () => {
    coordenacao = await logar('admin', 'admin');
    professor = await logar('luiz', 'Luiz123');
    responsavel = await logar('mary@emmoo.com.br', 'emmoo123');
  });

  it('usuários: só a coordenação lista, com filtro por papel', async () => {
    const { status, body } = await chamar('GET', '/usuarios?papel=professor', { token: coordenacao });
    assert.equal(status, 200);
    assert.deepEqual(body.map((u) => u.nome), ['Luiz']);
    assert.equal(body[0].senhaHash, undefined);
    assert.equal((await chamar('GET', '/usuarios', { token: professor })).status, 403);
    assert.equal((await chamar('GET', '/usuarios?papel=x', { token: coordenacao })).status, 400);
  });

  it('horários: professor gerencia a própria agenda; responsável não acessa', async () => {
    assert.equal((await chamar('GET', '/horarios', { token: professor })).body.length, 8);
    assert.equal((await chamar('GET', '/horarios', { token: responsavel })).status, 403);

    const criado = await chamar('POST', '/horarios', { token: professor, corpo: { diaSemana: 5, horaInicio: '10:00' } });
    assert.equal(criado.status, 201);
    assert.equal(criado.body.professorId, 2);
    const sobreposto = await chamar('POST', '/horarios', { token: professor, corpo: { diaSemana: 5, horaInicio: '10:30' } });
    assert.equal(sobreposto.status, 409);
    assert.equal(sobreposto.body.error.details[0].campo, 'horaInicio');

    assert.equal((await chamar('DELETE', `/horarios/${criado.body.id}`, { token: professor })).status, 204);
    assert.equal((await chamar('DELETE', `/horarios/${criado.body.id}`, { token: professor })).status, 404);
  });

  it('aulas: agenda série semanal, bloqueia conflito e atualiza as vagas livres', async () => {
    const livresAntes = await chamar('GET', `/horarios/livres?${SEMANA}&professorId=2`, { token: coordenacao });
    assert.equal(livresAntes.status, 200);
    assert.equal(livresAntes.body.length, 8);

    const pedido = { alunoId: 2, professorId: 2, data: '2031-03-03', hora: '14:00', semanas: 2 };
    assert.equal((await chamar('POST', '/aulas', { token: professor, corpo: pedido })).status, 403);
    const criadas = await chamar('POST', '/aulas', { token: coordenacao, corpo: pedido });
    assert.equal(criadas.status, 201);
    assert.deepEqual(criadas.body.map((a) => a.data), ['2031-03-03', '2031-03-10']);
    assert.equal(criadas.body[0].aluno.nome, 'Pedro Henrique');

    const conflito = await chamar('POST', '/aulas', { token: coordenacao, corpo: { ...pedido, alunoId: 1, hora: '14:30' } });
    assert.equal(conflito.status, 409);
    assert.match(conflito.body.error.details[0].mensagem, /professor já tem aula das 14:00/);

    const livresDepois = await chamar('GET', `/horarios/livres?${SEMANA}`, { token: professor });
    assert.equal(livresDepois.body.length, 7);
    assert.equal((await chamar('GET', `/horarios/livres?${SEMANA}`, { token: coordenacao })).status, 400);
  });

  it('aulas: cada papel vê só a sua parte da agenda', async () => {
    assert.equal((await chamar('GET', `/aulas?${SEMANA}`, { token: coordenacao })).body.length, 1);
    assert.equal((await chamar('GET', `/aulas?${SEMANA}`, { token: professor })).body.length, 1);
    assert.deepEqual((await chamar('GET', `/aulas?${SEMANA}`, { token: responsavel })).body, []); // Pedro não é dependente da Mary
    assert.equal((await chamar('GET', '/aulas', { token: coordenacao })).status, 400);
    assert.equal((await chamar('GET', `/aulas?${SEMANA}`)).status, 401);
  });

  it('aulas: professor cancela a própria aula uma única vez', async () => {
    const [aula] = (await chamar('GET', `/aulas?${SEMANA}`, { token: professor })).body;
    assert.equal((await chamar('PATCH', `/aulas/${aula.id}/cancelar`, { token: responsavel })).status, 403);
    const cancelada = await chamar('PATCH', `/aulas/${aula.id}/cancelar`, { token: professor });
    assert.equal(cancelada.status, 200);
    assert.equal(cancelada.body.status, 'cancelada');
    assert.equal((await chamar('PATCH', `/aulas/${aula.id}/cancelar`, { token: professor })).status, 409);
    // Cancelada sai do calendário de todos — e o horário volta a aparecer como livre.
    for (const token of [professor, coordenacao]) {
      const semana = (await chamar('GET', `/aulas?${SEMANA}`, { token })).body;
      assert.ok(semana.every((outra) => outra.id !== aula.id));
    }
    const livres = await chamar('GET', `/horarios/livres?${SEMANA}`, { token: professor });
    assert.ok(livres.body.some((vaga) => vaga.data === aula.data && vaga.hora === aula.hora));
  });

  it('alunos: inativar tira as próximas aulas da agenda, libera os horários, e reativar as devolve', async () => {
    const periodo = `alunoId=1&inicio=${hojeLocal()}&fim=${hojeLocal(56)}`;
    const antes = (await chamar('GET', `/aulas?${periodo}`, { token: coordenacao })).body;

    const inativado = await chamar('PATCH', '/alunos/1/inativar', { token: coordenacao });
    assert.equal(inativado.body.status, 'inativo');
    assert.ok(inativado.body.aulasCanceladas >= 7); // série de 8 semanas a partir da semana atual

    const agendarInativo = await chamar('POST', '/aulas', {
      token: coordenacao,
      corpo: { alunoId: 1, professorId: 2, data: '2031-03-05', hora: '14:00' },
    });
    assert.equal(agendarInativo.status, 400);

    // As aulas canceladas pela inativação somem da agenda — de todos os perfis.
    const durante = (await chamar('GET', `/aulas?${periodo}`, { token: coordenacao })).body;
    assert.equal(durante.length, antes.length - inativado.body.aulasCanceladas); // sobra só a de hoje, se já começou
    assert.ok(durante.every((aula) => aula.status === 'agendada'));
    const daMary = (await chamar('GET', `/aulas?inicio=${hojeLocal()}&fim=${hojeLocal(56)}`, { token: responsavel })).body;
    assert.ok(daMary.every((aula) => aula.alunoId !== 1));

    // E o horário fica livre para outro aluno.
    const saiu = antes.find((aula) => !durante.some((ficou) => ficou.id === aula.id));
    const livres = await chamar('GET', `/horarios/livres?professorId=2&inicio=${saiu.data}&fim=${saiu.data}`, { token: coordenacao });
    assert.ok(livres.body.some((vaga) => vaga.hora === saiu.hora));

    assert.equal((await chamar('PATCH', '/alunos/1/reativar', { token: professor })).status, 403);
    const reativado = await chamar('PATCH', '/alunos/1/reativar', { token: coordenacao });
    assert.deepEqual(
      [reativado.body.status, reativado.body.aulasRestauradas, reativado.body.aulasNaoRestauradas],
      ['ativo', inativado.body.aulasCanceladas, 0],
    );
    // Ao reativar, a agenda volta a ser a de antes — sem aula duplicada nem cancelada sobrando.
    const depois = (await chamar('GET', `/aulas?${periodo}`, { token: coordenacao })).body;
    assert.deepEqual(
      depois.map((aula) => aula.id),
      antes.map((aula) => aula.id),
    );
    assert.ok(depois.every((aula) => aula.status === 'agendada' && aula.motivoCancelamento === null));
    assert.equal((await chamar('PATCH', '/alunos/1/reativar', { token: coordenacao })).status, 409);
  });

  it('alunos: exclusão permanente só de inativos, levando o histórico de aulas', async () => {
    const { body: teo } = await chamar('POST', '/alunos', {
      token: coordenacao,
      corpo: { nome: 'Teo', contato: '(47) 90000-0000', instrumento: 'Bateria', planoId: 1 },
    });
    const aula = await chamar('POST', '/aulas', {
      token: coordenacao,
      corpo: { alunoId: teo.id, professorId: 2, data: '2031-03-04', hora: '10:00' },
    });
    assert.equal(aula.status, 201);

    assert.equal((await chamar('DELETE', `/alunos/${teo.id}`, { token: professor })).status, 403);
    const ativo = await chamar('DELETE', `/alunos/${teo.id}`, { token: coordenacao });
    assert.equal(ativo.status, 409);
    assert.match(ativo.body.error.message, /Inative o aluno antes/);

    await chamar('PATCH', `/alunos/${teo.id}/inativar`, { token: coordenacao });
    const excluido = await chamar('DELETE', `/alunos/${teo.id}`, { token: coordenacao });
    assert.equal(excluido.status, 200);
    assert.deepEqual(excluido.body, { aulasExcluidas: 1 });
    assert.equal((await chamar('GET', `/alunos/${teo.id}`, { token: coordenacao })).status, 404);
    const semana = await chamar('GET', '/aulas?inicio=2031-03-03&fim=2031-03-09', { token: coordenacao });
    assert.ok(semana.body.every((a) => a.alunoId !== teo.id));
  });

  it('planos: edita e exclui, protegendo os que estão em uso', async () => {
    const lista = await chamar('GET', '/planos', { token: coordenacao });
    const particular = lista.body.find((plano) => plano.id === 1);
    assert.ok(particular.totalAlunos >= 2);

    const edicao = { nome: 'Particular · 1 aula por semana', tipo: 'particular', valor: 150, freqSemanal: 1, duracaoMin: 50 };
    assert.equal((await chamar('PUT', '/planos/1', { token: professor, corpo: edicao })).status, 403);
    const editado = await chamar('PUT', '/planos/1', { token: coordenacao, corpo: edicao });
    assert.equal(editado.status, 200);
    assert.deepEqual([editado.body.valor, editado.body.duracaoMin], [150, 50]);
    assert.equal((await chamar('PUT', '/planos/1', { token: coordenacao, corpo: { nome: '' } })).status, 400);

    assert.equal((await chamar('DELETE', '/planos/1', { token: coordenacao })).status, 409);
    const { body: avulso } = await chamar('POST', '/planos', {
      token: coordenacao,
      corpo: { nome: 'Particular · 3 aulas por semana', tipo: 'particular', valor: 370, freqSemanal: 3 },
    });
    assert.equal((await chamar('DELETE', `/planos/${avulso.id}`, { token: professor })).status, 403);
    assert.equal((await chamar('DELETE', `/planos/${avulso.id}`, { token: coordenacao })).status, 204);
    assert.equal((await chamar('DELETE', `/planos/${avulso.id}`, { token: coordenacao })).status, 404);
  });
});

describe('API EMMOO — usuários da escola (coordenação)', () => {
  let coordenacao;
  let professor;
  let bia;

  before(async () => {
    coordenacao = await logar('admin', 'admin');
    professor = await logar('luiz', 'Luiz123');
  });

  it('cadastra professor, que já entra com o usuário criado', async () => {
    const dados = { nome: 'Bia', email: 'bia@emmoo.com.br', login: 'bia', senha: 'violino1', papel: 'professor' };
    assert.equal((await chamar('POST', '/usuarios', { token: professor, corpo: dados })).status, 403);
    const criado = await chamar('POST', '/usuarios', { token: coordenacao, corpo: dados });
    assert.equal(criado.status, 201);
    assert.deepEqual([criado.body.nome, criado.body.login, criado.body.senhaHash], ['Bia', 'bia', undefined]);
    bia = criado.body;

    const sessao = await chamar('POST', '/auth/login', { corpo: { escola: 'emmoo', login: 'bia', senha: 'violino1' } });
    assert.equal(sessao.body.usuario.papel, 'professor');
    const professores = await chamar('GET', '/usuarios?papel=professor', { token: coordenacao });
    assert.deepEqual(professores.body.map((u) => u.nome), ['Bia', 'Luiz']);
  });

  it('recusa dados inválidos (400) e e-mail ou usuário repetidos na escola (409)', async () => {
    const invalido = await chamar('POST', '/usuarios', { token: coordenacao, corpo: { nome: 'X' } });
    assert.deepEqual(invalido.body.error.details.map((d) => d.campo), ['nome', 'email', 'senha', 'papel']);
    const base = { nome: 'Outra', senha: 'segredo', papel: 'responsavel' };
    const email = await chamar('POST', '/usuarios', { token: coordenacao, corpo: { ...base, email: 'BIA@emmoo.com.br' } });
    assert.deepEqual([email.status, email.body.error.message], [409, 'E-mail já cadastrado nesta escola.']);
    const login = await chamar('POST', '/usuarios', { token: coordenacao, corpo: { ...base, email: 'o@a.com', login: 'luiz' } });
    assert.deepEqual([login.status, login.body.error.message], [409, 'Usuário já cadastrado nesta escola.']);
  });

  it('edita dados e senha; senha em branco mantém a atual', async () => {
    const edicao = { nome: 'Beatriz', email: 'bia@emmoo.com.br', login: 'bia', senha: '', papel: 'professor' };
    assert.equal((await chamar('PUT', `/usuarios/${bia.id}`, { token: professor, corpo: edicao })).status, 403);
    const editado = await chamar('PUT', `/usuarios/${bia.id}`, { token: coordenacao, corpo: edicao });
    assert.equal(editado.body.nome, 'Beatriz');
    assert.equal((await chamar('POST', '/auth/login', { corpo: { escola: 'emmoo', login: 'bia', senha: 'violino1' } })).status, 200);

    await chamar('PUT', `/usuarios/${bia.id}`, { token: coordenacao, corpo: { ...edicao, senha: 'cello123' } });
    assert.equal((await chamar('POST', '/auth/login', { corpo: { escola: 'emmoo', login: 'bia', senha: 'violino1' } })).status, 401);
    assert.equal((await chamar('POST', '/auth/login', { corpo: { escola: 'emmoo', login: 'bia', senha: 'cello123' } })).status, 200);
    assert.equal((await chamar('PUT', '/usuarios/999', { token: coordenacao, corpo: edicao })).status, 404);
  });

  it('a coordenação não muda o próprio perfil', async () => {
    const eu = (await chamar('GET', '/auth/me', { token: coordenacao })).body;
    const resposta = await chamar('PUT', `/usuarios/${eu.id}`, {
      token: coordenacao,
      corpo: { nome: eu.nome, email: eu.email, login: eu.login, papel: 'professor' },
    });
    assert.equal(resposta.status, 400);
    assert.equal(resposta.body.error.details[0].mensagem, 'Você não pode mudar o seu próprio perfil.');
  });

  it('desativar o acesso encerra a sessão aberta na hora e impede o login', async () => {
    const entrarBia = (senha = 'cello123') =>
      chamar('POST', '/auth/login', { corpo: { escola: 'emmoo', login: 'bia', senha } });
    const sessaoBia = (await entrarBia()).body.token;
    assert.equal((await chamar('GET', '/auth/me', { token: sessaoBia })).status, 200);

    assert.equal((await chamar('PATCH', `/usuarios/${bia.id}/desativar`, { token: professor })).status, 403);
    const desativada = await chamar('PATCH', `/usuarios/${bia.id}/desativar`, { token: coordenacao });
    assert.deepEqual([desativada.status, desativada.body.ativo], [200, false]);

    const depois = await chamar('GET', '/auth/me', { token: sessaoBia });
    assert.deepEqual([depois.status, depois.body.error.message], [401, 'Sessão encerrada. Entre novamente.']);
    const login = await entrarBia();
    assert.deepEqual([login.status, login.body.error.message], [403, 'Seu acesso foi desativado. Entre em contato com a coordenação da escola.']);
    assert.equal((await entrarBia('errada')).status, 401); // senha errada: a mensagem de sempre

    const eu = (await chamar('GET', '/auth/me', { token: coordenacao })).body;
    assert.equal((await chamar('PATCH', `/usuarios/${eu.id}/desativar`, { token: coordenacao })).status, 409);

    assert.equal((await chamar('PATCH', `/usuarios/${bia.id}/reativar`, { token: coordenacao })).body.ativo, true);
    assert.equal((await entrarBia()).status, 200);
  });

  it('trocar o perfil de alguém encerra a sessão dela; o novo perfil vale no próximo login', async () => {
    const sessaoBia = (await chamar('POST', '/auth/login', { corpo: { escola: 'emmoo', login: 'bia', senha: 'cello123' } })).body.token;
    const comoResponsavel = { nome: 'Beatriz', email: 'bia@emmoo.com.br', login: 'bia', papel: 'responsavel' };
    assert.equal((await chamar('PUT', `/usuarios/${bia.id}`, { token: coordenacao, corpo: comoResponsavel })).status, 200);
    assert.equal((await chamar('GET', '/alunos', { token: sessaoBia })).status, 401); // o token de professora não vale mais
    const nova = await chamar('POST', '/auth/login', { corpo: { escola: 'emmoo', login: 'bia', senha: 'cello123' } });
    assert.equal(nova.body.usuario.papel, 'responsavel');
    assert.equal((await chamar('GET', '/alunos', { token: nova.body.token })).status, 403); // responsável não lista alunos
  });
});

describe('API EMMOO — várias escolas (multi-tenant)', () => {
  const cadastro = { nomeEscola: 'Escola Sol', codigo: 'sol', nome: 'Rita', email: 'rita@sol.com', login: 'admin', senha: 'solsol' };
  let emmoo;
  let sol;

  before(async () => {
    emmoo = await logar('admin', 'admin');
  });

  it('informa se o cadastro de escolas está aberto (desenvolvimento: aberto)', async () => {
    const { status, body } = await chamar('GET', '/escolas/configuracao');
    assert.deepEqual([status, body], [200, { cadastroDeEscolas: true, recuperacaoDeSenha: false }]);
  });

  it('cadastra uma escola nova e já entra como coordenação dela', async () => {
    const invalido = await chamar('POST', '/escolas', { corpo: { ...cadastro, codigo: 'S' } });
    assert.deepEqual([invalido.status, invalido.body.error.details[0].campo], [400, 'codigo']);
    const repetido = await chamar('POST', '/escolas', { corpo: { ...cadastro, codigo: 'emmoo' } });
    assert.equal(repetido.status, 409);

    const criada = await chamar('POST', '/escolas', { corpo: cadastro });
    assert.equal(criada.status, 201);
    assert.deepEqual([criada.body.usuario.papel, criada.body.usuario.escola.codigo], ['coordenacao', 'sol']);
    sol = criada.body.token;
    assert.equal((await chamar('GET', '/auth/me', { token: sol })).body.nome, 'Rita');
  });

  it('o mesmo usuário "admin" entra em cada escola com a própria senha', async () => {
    const naSol = await chamar('POST', '/auth/login', { corpo: { escola: 'sol', login: 'admin', senha: 'solsol' } });
    assert.equal(naSol.body.usuario.nome, 'Rita');
    assert.equal((await chamar('POST', '/auth/login', { corpo: { escola: 'sol', login: 'admin', senha: 'admin' } })).status, 401);
    assert.equal((await chamar('POST', '/auth/login', { corpo: { escola: 'emmoo', login: 'admin', senha: 'solsol' } })).status, 401);
  });

  it('a escola nova começa vazia e não enxerga nada da EMMOO', async () => {
    assert.deepEqual((await chamar('GET', '/alunos', { token: sol })).body, []);
    assert.deepEqual((await chamar('GET', '/planos', { token: sol })).body, []);
    assert.deepEqual((await chamar('GET', '/horarios', { token: sol })).body, []);
    assert.deepEqual((await chamar('GET', '/aulas?inicio=2031-03-01&fim=2031-03-31', { token: sol })).body, []);
    assert.deepEqual((await chamar('GET', '/usuarios', { token: sol })).body.map((u) => u.nome), ['Rita']);
  });

  it('ids da EMMOO não existem para a Sol: nem ler, nem editar, nem excluir', async () => {
    const [aula] = (await chamar('GET', '/aulas?inicio=2031-03-01&fim=2031-03-31', { token: emmoo })).body;
    const tentativas = [
      ['GET', '/alunos/1'],
      ['PUT', '/alunos/1', { nome: 'Invasor', contato: 'x@x.com', instrumento: 'Piano', planoId: 1 }],
      ['PATCH', '/alunos/1/inativar'],
      ['DELETE', '/alunos/1'],
      ['PUT', '/planos/1', { nome: 'Invasor', tipo: 'grupo', valor: 1, freqSemanal: 1 }],
      ['DELETE', '/planos/1'],
      ['PATCH', `/aulas/${aula.id}/cancelar`],
      ['PUT', '/usuarios/2', { nome: 'Invasor', email: 'x@x.com', papel: 'coordenacao' }],
    ];
    for (const [metodo, caminho, corpo] of tentativas) {
      assert.equal((await chamar(metodo, caminho, { token: sol, corpo })).status, 404, `${metodo} ${caminho}`);
    }
    // Nem como referência: o plano 1 e o professor 2 são da EMMOO.
    const aluno = await chamar('POST', '/alunos', {
      token: sol,
      corpo: { nome: 'Teo', contato: 'teo@sol.com', instrumento: 'Bateria', planoId: 1 },
    });
    assert.deepEqual([aluno.status, aluno.body.error.details[0].campo], [400, 'planoId']);

    // E a EMMOO segue intacta.
    const aluno1 = (await chamar('GET', '/alunos/1', { token: emmoo })).body;
    assert.deepEqual([aluno1.nome !== 'Invasor', aluno1.status], [true, 'ativo']);
    assert.equal((await chamar('GET', '/planos', { token: emmoo })).body.find((p) => p.id === 1).nome, 'Particular · 1 aula por semana');
    assert.equal((await chamar('GET', '/auth/me', { token: await logar('luiz', 'Luiz123') })).body.nome, 'Luiz');
  });

  it('a Sol monta a própria escola do zero', async () => {
    const plano = await chamar('POST', '/planos', {
      token: sol,
      corpo: { nome: 'Violão em grupo', tipo: 'grupo', valor: 80, freqSemanal: 1 },
    });
    assert.equal(plano.status, 201);
    const aluno = await chamar('POST', '/alunos', {
      token: sol,
      corpo: { nome: 'Teo', contato: 'teo@sol.com', instrumento: 'Violão', planoId: plano.body.id },
    });
    assert.equal(aluno.status, 201);
    assert.deepEqual((await chamar('GET', '/alunos', { token: sol })).body.map((a) => a.nome), ['Teo']);
    assert.ok((await chamar('GET', '/alunos', { token: emmoo })).body.every((a) => a.nome !== 'Teo'));
  });
});

describe('API EMMOO — feriados e recessos da escola', () => {
  let coordenacao;
  let professor;
  let responsavel;
  const MARCO = 'inicio=2032-03-01&fim=2032-03-21';

  before(async () => {
    coordenacao = await logar('admin', 'admin');
    professor = await logar('luiz', 'Luiz123');
    responsavel = await logar('mary@emmoo.com.br', 'emmoo123');
    // Pedro: três segundas seguidas às 10:00.
    const serie = await chamar('POST', '/aulas', {
      token: coordenacao,
      corpo: { alunoId: 2, professorId: 2, data: '2032-03-01', hora: '10:00', semanas: 3 },
    });
    assert.equal(serie.status, 201);
  });

  it('só a coordenação cadastra; as aulas do dia saem da agenda e a data não aceita aula', async () => {
    const carnaval = { descricao: 'Carnaval', inicio: '2032-03-08', fim: '2032-03-09' };
    assert.equal((await chamar('POST', '/feriados', { token: professor, corpo: carnaval })).status, 403);
    const criado = await chamar('POST', '/feriados', { token: coordenacao, corpo: carnaval });
    assert.deepEqual([criado.status, criado.body.descricao, criado.body.aulasCanceladas], [201, 'Carnaval', 1]);

    const agenda = (await chamar('GET', `/aulas?${MARCO}&alunoId=2`, { token: coordenacao })).body;
    assert.deepEqual(agenda.map((aula) => aula.data), ['2032-03-01', '2032-03-15']);

    const naData = await chamar('POST', '/aulas', {
      token: coordenacao,
      corpo: { alunoId: 2, professorId: 2, data: '2032-03-08', hora: '15:00' },
    });
    assert.deepEqual([naData.status, naData.body.error.details[0].mensagem], [400, '08/03/2032 é "Carnaval": não há aula nesse dia.']);
    const livres = await chamar('GET', '/horarios/livres?professorId=2&inicio=2032-03-08&fim=2032-03-08', { token: coordenacao });
    assert.deepEqual(livres.body, []);
  });

  it('todos os perfis veem os dias sem aula', async () => {
    for (const token of [coordenacao, professor, responsavel]) {
      const { status, body } = await chamar('GET', `/feriados?${MARCO}`, { token });
      assert.deepEqual([status, body.map((f) => f.descricao)], [200, ['Carnaval']]);
    }
    assert.equal((await chamar('GET', '/feriados')).status, 401);
    assert.equal((await chamar('GET', '/feriados?inicio=2032-03-01', { token: coordenacao })).status, 400);
  });

  it('cada escola tem os seus feriados', async () => {
    const lua = await chamar('POST', '/escolas', {
      corpo: { nomeEscola: 'Escola Lua', codigo: 'lua', nome: 'Davi', email: 'davi@lua.com', senha: 'lualua' },
    });
    const tokenLua = lua.body.token;
    assert.deepEqual((await chamar('GET', `/feriados?${MARCO}`, { token: tokenLua })).body, []);
    const [carnaval] = (await chamar('GET', `/feriados?${MARCO}`, { token: coordenacao })).body;
    assert.equal((await chamar('DELETE', `/feriados/${carnaval.id}`, { token: tokenLua })).status, 404);
  });

  it('remover o feriado devolve as aulas à agenda', async () => {
    const [carnaval] = (await chamar('GET', `/feriados?${MARCO}`, { token: coordenacao })).body;
    assert.equal((await chamar('DELETE', `/feriados/${carnaval.id}`, { token: professor })).status, 403);
    const removido = await chamar('DELETE', `/feriados/${carnaval.id}`, { token: coordenacao });
    assert.deepEqual([removido.status, removido.body.aulasRestauradas], [200, 1]);
    const agenda = (await chamar('GET', `/aulas?${MARCO}&alunoId=2`, { token: coordenacao })).body;
    assert.deepEqual(agenda.map((aula) => aula.data), ['2032-03-01', '2032-03-08', '2032-03-15']);
    assert.equal((await chamar('DELETE', `/feriados/${carnaval.id}`, { token: coordenacao })).status, 404);
  });
});
