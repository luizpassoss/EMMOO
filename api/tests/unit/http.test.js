import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAuthMiddleware } from '../../src/middlewares/auth.js';
import { createErrorHandler, notFound } from '../../src/middlewares/errorHandler.js';
import { createAlunoController } from '../../src/modules/alunos/aluno.controller.js';
import { createAulaController } from '../../src/modules/aulas/aula.controller.js';
import { createAuthController } from '../../src/modules/auth/auth.controller.js';
import { createHorarioController } from '../../src/modules/horarios/horario.controller.js';
import { createPlanoController } from '../../src/modules/planos/plano.controller.js';
import { createUsuarioController } from '../../src/modules/usuarios/usuario.controller.js';
import { asyncHandler } from '../../src/shared/asyncHandler.js';
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../src/shared/errors.js';
import { aguardarTick, criarRespostaFake, tokenServiceFake } from '../helpers/fakes.js';

function capturarNext() {
  const chamadas = [];
  const next = (erro) => chamadas.push(erro);
  return { next, chamadas };
}

describe('middleware authenticate', () => {
  const { authenticate } = createAuthMiddleware(tokenServiceFake);

  it('recusa requisição sem token ou com esquema errado', () => {
    for (const authorization of [undefined, 'Basic abc', 'Bearer']) {
      const { next, chamadas } = capturarNext();
      authenticate({ headers: { authorization } }, {}, next);
      assert.ok(chamadas[0] instanceof UnauthorizedError);
    }
  });
  it('trata requisição sem cabeçalhos', () => {
    const { next, chamadas } = capturarNext();
    authenticate({}, {}, next);
    assert.ok(chamadas[0] instanceof UnauthorizedError);
  });
  it('preenche req.usuario com token válido', () => {
    const req = { headers: { authorization: 'bearer token:7:professor' } };
    const { next, chamadas } = capturarNext();
    authenticate(req, {}, next);
    assert.deepEqual(req.usuario, { id: 7, papel: 'professor' });
    assert.equal(chamadas[0], undefined);
  });
  it('propaga erro de token inválido', () => {
    const { next, chamadas } = capturarNext();
    authenticate({ headers: { authorization: 'Bearer lixo' } }, {}, next);
    assert.ok(chamadas[0] instanceof UnauthorizedError);
  });
});

describe('middleware authorize', () => {
  const { authorize } = createAuthMiddleware(tokenServiceFake);
  const soCoordenacao = authorize('coordenacao');

  it('exige autenticação prévia', () => {
    const { next, chamadas } = capturarNext();
    soCoordenacao({}, {}, next);
    assert.ok(chamadas[0] instanceof UnauthorizedError);
  });
  it('bloqueia papel sem permissão', () => {
    const { next, chamadas } = capturarNext();
    soCoordenacao({ usuario: { id: 2, papel: 'professor' } }, {}, next);
    assert.ok(chamadas[0] instanceof ForbiddenError);
  });
  it('libera papel permitido', () => {
    const { next, chamadas } = capturarNext();
    soCoordenacao({ usuario: { id: 1, papel: 'coordenacao' } }, {}, next);
    assert.equal(chamadas[0], undefined);
  });
});

describe('tratamento de erros', () => {
  const logs = [];
  const errorHandler = createErrorHandler({ logger: { error: (erro) => logs.push(erro) } });

  it('tem 4 parâmetros (requisito do Express para middleware de erro)', () => {
    assert.equal(errorHandler.length, 4);
  });
  it('converte AppError com detalhes', () => {
    const res = criarRespostaFake();
    errorHandler(new ValidationError([{ campo: 'nome', mensagem: 'obrigatório' }]), {}, res, () => {});
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body.error.details, [{ campo: 'nome', mensagem: 'obrigatório' }]);
  });
  it('converte AppError sem detalhes', () => {
    const res = criarRespostaFake();
    errorHandler(new NotFoundError('Aluno não encontrado.'), {}, res, () => {});
    assert.deepEqual(res.body, { error: { code: 'NOT_FOUND', message: 'Aluno não encontrado.' } });
  });
  it('responde 400 para JSON malformado', () => {
    const res = criarRespostaFake();
    errorHandler(Object.assign(new SyntaxError('x'), { type: 'entity.parse.failed', status: 400 }), {}, res, () => {});
    assert.equal(res.body.error.code, 'INVALID_JSON');
  });
  it('preserva status 4xx de outras bibliotecas', () => {
    const res = criarRespostaFake();
    errorHandler(Object.assign(new Error('grande'), { statusCode: 413 }), {}, res, () => {});
    assert.equal(res.statusCode, 413);
  });
  it('esconde detalhes de erros inesperados e registra no log', () => {
    const res = criarRespostaFake();
    errorHandler(new Error('falha interna'), {}, res, () => {});
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.error.message, 'Erro interno do servidor.');
    assert.equal(logs.length, 1);
  });
  it('responde 503 quando o banco de dados está fora do ar', () => {
    const erros = [
      Object.assign(new Error("Can't reach database server"), { name: 'PrismaClientInitializationError' }),
      Object.assign(new Error('Timed out'), { code: 'P1002' }),
    ];
    for (const erro of erros) {
      const res = criarRespostaFake();
      errorHandler(erro, {}, res, () => {});
      assert.equal(res.statusCode, 503);
      assert.equal(res.body.error.code, 'DATABASE_UNAVAILABLE');
    }
  });
  it('usa console como logger padrão', () => {
    assert.equal(typeof createErrorHandler(), 'function');
  });
  it('notFound responde 404', () => {
    const res = criarRespostaFake();
    notFound({}, res);
    assert.equal(res.statusCode, 404);
  });
});

describe('asyncHandler', () => {
  it('não chama next quando o handler conclui', async () => {
    const { next, chamadas } = capturarNext();
    asyncHandler(async () => {})({}, {}, next);
    await aguardarTick();
    assert.equal(chamadas.length, 0);
  });
  it('encaminha rejeições e exceções síncronas para next', async () => {
    const { next, chamadas } = capturarNext();
    asyncHandler(async () => {
      throw new Error('assíncrono');
    })({}, {}, next);
    asyncHandler(() => {
      throw new Error('síncrono');
    })({}, {}, next);
    await aguardarTick();
    assert.deepEqual(chamadas.map((e) => e.message).sort(), ['assíncrono', 'síncrono']);
  });
});

describe('controllers', () => {
  it('AuthController delega login e perfil', async () => {
    const controller = createAuthController({
      login: async (dados) => ({ recebido: dados }),
      perfil: async (id) => ({ id }),
    });
    const res1 = criarRespostaFake();
    await controller.login({}, res1);
    assert.deepEqual(res1.body, { recebido: {} });
    const res2 = criarRespostaFake();
    await controller.perfil({ usuario: { id: 5 } }, res2);
    assert.deepEqual(res2.body, { id: 5 });
  });

  it('PlanoController lista e cria (201)', async () => {
    const controller = createPlanoController({ listar: async () => ['p'], criar: async (d) => ({ ...d, id: 1 }) });
    const lista = criarRespostaFake();
    await controller.listar({}, lista);
    assert.deepEqual(lista.body, ['p']);
    const criado = criarRespostaFake();
    await controller.criar({ body: { nome: 'X' } }, criado);
    assert.equal(criado.statusCode, 201);
    const semCorpo = criarRespostaFake();
    await controller.criar({}, semCorpo);
    assert.deepEqual(semCorpo.body, { id: 1 });
  });

  it('AlunoController repassa query, params e corpo', async () => {
    const service = {
      listar: async (filtro) => filtro,
      buscar: async (id) => ({ id }),
      criar: async (dados) => dados,
      atualizar: async (id, dados) => ({ id, ...dados }),
      inativar: async (id) => ({ id, status: 'inativo' }),
      reativar: async (id) => ({ id, status: 'ativo' }),
    };
    const controller = createAlunoController(service);
    const cenarios = [
      ['listar', { query: { status: 'ativo' } }, { status: 'ativo' }, 200],
      ['listar', {}, { status: undefined }, 200],
      ['buscar', { params: { id: '3' } }, { id: '3' }, 200],
      ['criar', { body: { nome: 'Ana' } }, { nome: 'Ana' }, 201],
      ['criar', {}, {}, 201],
      ['atualizar', { params: { id: '3' }, body: { nome: 'B' } }, { id: '3', nome: 'B' }, 200],
      ['atualizar', { params: { id: '3' } }, { id: '3' }, 200],
      ['inativar', { params: { id: '3' } }, { id: '3', status: 'inativo' }, 200],
      ['reativar', { params: { id: '3' } }, { id: '3', status: 'ativo' }, 200],
    ];
    for (const [metodo, req, esperado, status] of cenarios) {
      const res = criarRespostaFake();
      await controller[metodo](req, res);
      assert.deepEqual(res.body, esperado, metodo);
      assert.equal(res.statusCode, status, metodo);
    }
  });

  it('UsuarioController repassa o filtro de papel', async () => {
    const controller = createUsuarioController({ listar: async (filtro) => filtro });
    const res = criarRespostaFake();
    await controller.listar({ query: { papel: 'professor' } }, res);
    assert.deepEqual(res.body, { papel: 'professor' });
    const semQuery = criarRespostaFake();
    await controller.listar({}, semQuery);
    assert.deepEqual(semQuery.body, { papel: undefined });
  });

  it('HorarioController repassa usuário logado e responde 201/204', async () => {
    const usuario = { id: 2, papel: 'professor' };
    const chamadas = [];
    const controller = createHorarioController({
      listar: async (query, u) => ({ query, u }),
      livres: async (query, u) => ({ query, u }),
      criar: async (dados, u) => ({ dados, u }),
      remover: async (id, u) => chamadas.push([id, u]),
    });
    const lista = criarRespostaFake();
    await controller.listar({ query: { professorId: '2' }, usuario }, lista);
    assert.deepEqual(lista.body, { query: { professorId: '2' }, u: usuario });
    const livres = criarRespostaFake();
    await controller.livres({ usuario }, livres);
    assert.deepEqual(livres.body, { query: {}, u: usuario });
    const semQuery = criarRespostaFake();
    await controller.listar({ usuario }, semQuery);
    assert.deepEqual(semQuery.body.query, {});
    const criado = criarRespostaFake();
    await controller.criar({ usuario }, criado);
    assert.equal(criado.statusCode, 201);
    assert.deepEqual(criado.body.dados, {});
    const removido = criarRespostaFake();
    await controller.remover({ params: { id: '5' }, usuario }, removido);
    assert.equal(removido.statusCode, 204);
    assert.equal(removido.finalizada, true);
    assert.deepEqual(chamadas, [['5', usuario]]);
  });

  it('AulaController lista, agenda (201) e cancela', async () => {
    const usuario = { id: 1, papel: 'coordenacao' };
    const controller = createAulaController({
      listar: async (query, u) => ({ query, u }),
      agendar: async (dados) => [dados],
      cancelar: async (id, u) => ({ id, u, status: 'cancelada' }),
    });
    const lista = criarRespostaFake();
    await controller.listar({ query: { inicio: 'a' }, usuario }, lista);
    assert.deepEqual(lista.body, { query: { inicio: 'a' }, u: usuario });
    const semQuery = criarRespostaFake();
    await controller.listar({ usuario }, semQuery);
    assert.deepEqual(semQuery.body.query, {});
    const agendada = criarRespostaFake();
    await controller.agendar({ body: { hora: '14:00' } }, agendada);
    assert.equal(agendada.statusCode, 201);
    assert.deepEqual(agendada.body, [{ hora: '14:00' }]);
    const semCorpo = criarRespostaFake();
    await controller.agendar({}, semCorpo);
    assert.deepEqual(semCorpo.body, [{}]);
    const cancelada = criarRespostaFake();
    await controller.cancelar({ params: { id: '9' }, usuario }, cancelada);
    assert.deepEqual(cancelada.body, { id: '9', u: usuario, status: 'cancelada' });
  });
});
