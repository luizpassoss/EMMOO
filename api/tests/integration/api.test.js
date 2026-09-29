import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';
import { createContainer } from '../../src/container.js';

let server;
let baseUrl;

before(async () => {
  const env = loadEnv({ NODE_ENV: 'test', DB_DRIVER: 'memory', JWT_SECRET: 'segredo-de-teste' });
  const { services, tokenService } = await createContainer(env);
  const app = createApp({ services, tokenService, corsOrigin: env.corsOrigin, logger: { error() {} } });
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

async function logar(email) {
  const { status, body } = await chamar('POST', '/auth/login', { corpo: { email, senha: 'emmoo123' } });
  assert.equal(status, 200);
  return body.token;
}

describe('API EMMOO — ponta a ponta', () => {
  let coordenacao;
  let professor;
  let responsavel;

  before(async () => {
    coordenacao = await logar('lucimara@emmoo.com.br');
    professor = await logar('luiz@emmoo.com.br');
    responsavel = await logar('mary@emmoo.com.br');
  });

  it('GET /health responde ok', async () => {
    const { status, body } = await chamar('GET', '/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
  });

  it('login: credenciais inválidas (401), campos ausentes (400) e sucesso sem expor senha', async () => {
    assert.equal((await chamar('POST', '/auth/login', { corpo: { email: 'lucimara@emmoo.com.br', senha: 'x' } })).status, 401);
    const invalido = await chamar('POST', '/auth/login', { corpo: {} });
    assert.equal(invalido.status, 400);
    assert.equal(invalido.body.error.code, 'VALIDATION_ERROR');
    const ok = await chamar('POST', '/auth/login', { corpo: { email: 'LUCIMARA@emmoo.com.br', senha: 'emmoo123' } });
    assert.equal(ok.body.usuario.papel, 'coordenacao');
    assert.equal(ok.body.usuario.senhaHash, undefined);
  });

  it('GET /auth/me exige token válido', async () => {
    assert.equal((await chamar('GET', '/auth/me')).status, 401);
    assert.equal((await chamar('GET', '/auth/me', { token: 'invalido' })).status, 401);
    const { status, body } = await chamar('GET', '/auth/me', { token: professor });
    assert.equal(status, 200);
    assert.equal(body.nome, 'Luiz');
  });

  it('planos: todos listam, só a coordenação cria (RN01)', async () => {
    const lista = await chamar('GET', '/planos', { token: responsavel });
    assert.equal(lista.status, 200);
    assert.equal(lista.body[0].valor, 140);
    const novo = { nome: 'Grupo 1x/semana', tipo: 'grupo', valor: 90, freqSemanal: 1 };
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
    coordenacao = await logar('lucimara@emmoo.com.br');
    professor = await logar('luiz@emmoo.com.br');
    responsavel = await logar('mary@emmoo.com.br');
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
  });

  it('alunos: inativar cancela aulas futuras e o aluno pode ser reativado', async () => {
    const inativado = await chamar('PATCH', '/alunos/1/inativar', { token: coordenacao });
    assert.equal(inativado.body.status, 'inativo');
    assert.ok(inativado.body.aulasCanceladas >= 7); // série de 8 semanas a partir da semana atual

    const agendarInativo = await chamar('POST', '/aulas', {
      token: coordenacao,
      corpo: { alunoId: 1, professorId: 2, data: '2031-03-05', hora: '14:00' },
    });
    assert.equal(agendarInativo.status, 400);

    assert.equal((await chamar('PATCH', '/alunos/1/reativar', { token: professor })).status, 403);
    assert.equal((await chamar('PATCH', '/alunos/1/reativar', { token: coordenacao })).body.status, 'ativo');
    assert.equal((await chamar('PATCH', '/alunos/1/reativar', { token: coordenacao })).status, 409);
  });
});
