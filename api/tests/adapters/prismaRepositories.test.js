import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPrismaRepositories } from '../../src/infra/prisma/prismaRepositories.js';
import { ConflictError } from '../../src/shared/errors.js';

/**
 * Cliente Prisma falso: registra cada chamada (modelo.método + argumentos) e devolve a resposta configurada.
 * Verifica o mapeamento para as consultas do Prisma sem precisar de MySQL.
 */
function criarPrismaFake(respostas = {}) {
  const chamadas = [];
  const modelo = (nome) =>
    new Proxy(
      {},
      {
        get: (_, metodo) => async (args) => {
          chamadas.push([`${nome}.${metodo}`, args]);
          const resposta = respostas[`${nome}.${metodo}`];
          return typeof resposta === 'function' ? resposta(args) : (resposta ?? null);
        },
      },
    );
  return {
    chamadas,
    escola: modelo('escola'),
    usuario: modelo('usuario'),
    plano: modelo('plano'),
    aluno: modelo('aluno'),
    horarioDisponivel: modelo('horarioDisponivel'),
    aula: modelo('aula'),
    diarioAula: modelo('diarioAula'),
    feriado: modelo('feriado'),
    solicitacao: modelo('solicitacao'),
    mensalidade: modelo('mensalidade'),
    alerta: modelo('alerta'),
    redefinicaoSenha: modelo('redefinicaoSenha'),
    $transaction: (operacoes) => Promise.all(operacoes),
  };
}

const ESCOLA = 4;
const daEscola = (prisma) => createPrismaRepositories(prisma).paraEscola(ESCOLA);
const dataDoBanco = (iso) => new Date(`${iso}T00:00:00.000Z`);
const erroDeUnicidade = (target) => Object.assign(new Error('Unique constraint failed'), { code: 'P2002', meta: { target } });

describe('repositórios Prisma — escolas', () => {
  it('busca por código normalizado e por id', async () => {
    const prisma = criarPrismaFake({ 'escola.findUnique': { id: 1, codigo: 'sol' } });
    const { escolas } = createPrismaRepositories(prisma);
    await escolas.findByCodigo(' SOL ');
    await escolas.findById(1);
    assert.deepEqual(
      prisma.chamadas.map(([, args]) => args.where),
      [{ codigo: 'sol' }, { id: 1 }],
    );
  });

  it('cria com código normalizado; código repetido vira 409', async () => {
    let falhar = false;
    const prisma = criarPrismaFake({
      'escola.create': ({ data }) => {
        if (falhar) throw erroDeUnicidade('escola_codigo_key');
        return { id: 2, ...data };
      },
    });
    const { escolas } = createPrismaRepositories(prisma);
    assert.deepEqual(await escolas.create({ nome: 'Sol', codigo: ' Sol ' }), { id: 2, nome: 'Sol', codigo: 'sol' });
    falhar = true;
    await assert.rejects(escolas.create({ nome: 'Sol', codigo: 'sol' }), {
      name: ConflictError.name,
      message: 'Este código de escola já está em uso.',
    });
  });

  it('outros erros do banco seguem adiante', async () => {
    const prisma = criarPrismaFake({
      'escola.create': () => {
        throw new Error('conexão perdida');
      },
    });
    await assert.rejects(createPrismaRepositories(prisma).escolas.create({ nome: 'Sol', codigo: 'sol' }), {
      message: 'conexão perdida',
    });
  });
});

describe('repositórios Prisma — toda consulta fica na escola', () => {
  it('aulas: filtra período, professor e dependentes e devolve datas "AAAA-MM-DD"', async () => {
    const prisma = criarPrismaFake({
      'aula.findMany': [{ id: 1, data: dataDoBanco('2026-10-05'), hora: '14:00' }],
    });
    const { aulas } = daEscola(prisma);

    assert.deepEqual(await aulas.list({ inicio: '2026-10-05', fim: '2026-10-11', professorId: 2 }), [
      { id: 1, data: '2026-10-05', hora: '14:00' },
    ]);
    assert.deepEqual(prisma.chamadas[0][1], {
      where: {
        data: { gte: dataDoBanco('2026-10-05'), lte: dataDoBanco('2026-10-11') },
        professorId: 2,
        alunoId: undefined,
        escolaId: ESCOLA,
      },
      orderBy: [{ data: 'asc' }, { hora: 'asc' }],
    });

    await aulas.list({ alunoIds: [1, 3] });
    assert.deepEqual(prisma.chamadas[1][1].where, {
      data: undefined,
      professorId: undefined,
      alunoId: { in: [1, 3] },
      escolaId: ESCOLA,
    });

    await aulas.list({ inicio: '2026-10-07', alunoId: 4 });
    assert.deepEqual(prisma.chamadas[2][1].where, {
      data: { gte: dataDoBanco('2026-10-07') },
      professorId: undefined,
      alunoId: 4,
      escolaId: ESCOLA,
    });
  });

  it('aulas: cria a série numa transação (com a escola), busca e atualiza só dentro da escola', async () => {
    const prisma = criarPrismaFake({
      'aula.create': ({ data }) => ({ id: 7, ...data }),
      'aula.findFirst': null,
      'aula.updateMany': ({ where }) => ({ count: where.id === 7 ? 1 : 0 }),
      'aula.findUnique': ({ where }) => ({ id: where.id, data: dataDoBanco('2026-10-05'), status: 'cancelada' }),
    });
    const { aulas } = daEscola(prisma);

    const criadas = await aulas.createMany([{ alunoId: 1, professorId: 2, data: '2026-10-05', hora: '14:00' }]);
    assert.deepEqual(prisma.chamadas[0][1].data.data, dataDoBanco('2026-10-05'));
    assert.equal(prisma.chamadas[0][1].data.escolaId, ESCOLA);
    assert.equal(criadas[0].data, '2026-10-05');

    assert.equal(await aulas.findById(99), null);
    assert.deepEqual(prisma.chamadas[1], ['aula.findFirst', { where: { id: 99, escolaId: ESCOLA } }]);

    assert.deepEqual(await aulas.update(7, { status: 'cancelada' }), { id: 7, data: '2026-10-05', status: 'cancelada' });
    assert.deepEqual(prisma.chamadas[2], ['aula.updateMany', { where: { id: 7, escolaId: ESCOLA }, data: { status: 'cancelada' } }]);
    // Registro de outra escola: o updateMany não acha nada, e nem se busca o registro.
    const antes = prisma.chamadas.length;
    assert.equal(await aulas.update(8, { status: 'cancelada' }), null);
    assert.deepEqual(prisma.chamadas.slice(antes).map(([operacao]) => operacao), ['aula.updateMany']);
  });

  it('feriados: filtra o período pela sobreposição e devolve datas "AAAA-MM-DD"', async () => {
    const prisma = criarPrismaFake({
      'feriado.findMany': [{ id: 1, descricao: 'Recesso', inicio: dataDoBanco('2026-07-06'), fim: dataDoBanco('2026-07-31') }],
      'feriado.findFirst': null,
      'feriado.create': ({ data }) => ({ id: 2, ...data }),
      'feriado.deleteMany': { count: 1 },
    });
    const { feriados } = daEscola(prisma);
    assert.deepEqual(await feriados.list({ inicio: '2026-07-20', fim: '2026-08-10' }), [
      { id: 1, descricao: 'Recesso', inicio: '2026-07-06', fim: '2026-07-31' },
    ]);
    assert.deepEqual(prisma.chamadas[0][1], {
      where: { inicio: { lte: dataDoBanco('2026-08-10') }, fim: { gte: dataDoBanco('2026-07-20') }, escolaId: ESCOLA },
      orderBy: [{ inicio: 'asc' }, { fim: 'asc' }],
    });
    await feriados.list();
    assert.deepEqual(prisma.chamadas[1][1].where, { escolaId: ESCOLA });
    assert.equal(await feriados.findById(5), null);
    assert.deepEqual(prisma.chamadas[2][1].where, { id: 5, escolaId: ESCOLA });
    const criado = await feriados.create({ descricao: 'Finados', inicio: '2026-11-02', fim: '2026-11-02' });
    assert.deepEqual(criado, { id: 2, descricao: 'Finados', inicio: '2026-11-02', fim: '2026-11-02', escolaId: ESCOLA });
    assert.equal(await feriados.remove(2), true);
    assert.deepEqual(prisma.chamadas.at(-1)[1].where, { id: 2, escolaId: ESCOLA });
  });

  it('aulas: alteração em lote é um único UPDATE, dentro da escola', async () => {
    const prisma = criarPrismaFake({ 'aula.updateMany': ({ where }) => ({ count: where.id.in.length }) });
    const { aulas } = daEscola(prisma);
    assert.equal(await aulas.updateMany([3, 4], { status: 'cancelada', motivoCancelamento: 'inativacao' }), 2);
    assert.deepEqual(prisma.chamadas, [
      [
        'aula.updateMany',
        { where: { id: { in: [3, 4] }, escolaId: ESCOLA }, data: { status: 'cancelada', motivoCancelamento: 'inativacao' } },
      ],
    ]);
    assert.equal(await aulas.updateMany([], { status: 'agendada' }), 0);
    assert.equal(prisma.chamadas.length, 1); // lista vazia: nem consulta o banco
  });

  it('horários: ordena por dia e hora, cria na escola e informa se removeu', async () => {
    let removidos = 1;
    const prisma = criarPrismaFake({
      'horarioDisponivel.deleteMany': () => ({ count: removidos }),
      'horarioDisponivel.create': ({ data }) => ({ id: 1, ...data }),
    });
    const { horarios } = daEscola(prisma);

    await horarios.list({ professorId: 2 });
    assert.deepEqual(prisma.chamadas[0][1], {
      where: { professorId: 2, escolaId: ESCOLA },
      orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }],
    });
    await horarios.list();
    assert.deepEqual(prisma.chamadas[1][1].where, { escolaId: ESCOLA });
    assert.equal((await horarios.create({ professorId: 2, diaSemana: 1 })).escolaId, ESCOLA);
    await horarios.findById(3);
    assert.deepEqual(prisma.chamadas[3][1].where, { id: 3, escolaId: ESCOLA });

    assert.equal(await horarios.remove(5), true);
    assert.deepEqual(prisma.chamadas[4][1].where, { id: 5, escolaId: ESCOLA });
    removidos = 0;
    assert.equal(await horarios.remove(5), false);
  });

  it('usuários: busca por e-mail, usuário (login) e id dentro da escola, e normaliza ao criar', async () => {
    const prisma = criarPrismaFake({ 'usuario.create': ({ data }) => ({ id: 1, ...data }) });
    const { usuarios } = daEscola(prisma);
    await usuarios.findByLogin(' Admin ');
    await usuarios.findByEmail(' LU@A.com ');
    await usuarios.findById(2);
    assert.deepEqual(
      prisma.chamadas.map(([operacao, args]) => [operacao, args.where]),
      [
        ['usuario.findFirst', { login: 'admin', escolaId: ESCOLA }],
        ['usuario.findFirst', { email: 'lu@a.com', escolaId: ESCOLA }],
        ['usuario.findFirst', { id: 2, escolaId: ESCOLA }],
      ],
    );
    const criado = await usuarios.create({ nome: 'Lu', email: ' LU@A.COM ', login: ' Luiz ', senhaHash: 'h', papel: 'professor' });
    assert.deepEqual([criado.email, criado.login, criado.escolaId], ['lu@a.com', 'luiz', ESCOLA]);
    const semLogin = await usuarios.create({ nome: 'Ma', email: 'ma@a.com', senhaHash: 'h', papel: 'responsavel' });
    assert.equal(semLogin.login, null);
  });

  it('usuários: edita só na escola e traduz e-mail/usuário repetidos em 409 legível', async () => {
    let erro = null;
    const prisma = criarPrismaFake({
      'usuario.updateMany': () => {
        if (erro) throw erro;
        return { count: 1 };
      },
      'usuario.findUnique': ({ where }) => ({ id: where.id, nome: 'Lu', login: null }),
      'usuario.create': () => {
        throw erro;
      },
    });
    const { usuarios } = daEscola(prisma);
    assert.deepEqual(await usuarios.update(2, { nome: 'Lu', login: '' }), { id: 2, nome: 'Lu', login: null });
    assert.deepEqual(prisma.chamadas[0][1], { where: { id: 2, escolaId: ESCOLA }, data: { nome: 'Lu', login: null } });

    erro = erroDeUnicidade('usuario_escola_id_login_key');
    await assert.rejects(usuarios.update(2, { login: 'admin' }), { name: ConflictError.name, message: 'Usuário já cadastrado nesta escola.' });
    erro = erroDeUnicidade('usuario_escola_id_email_key');
    await assert.rejects(usuarios.create({ nome: 'X', email: 'x@a.com' }), { message: 'E-mail já cadastrado nesta escola.' });
    erro = erroDeUnicidade(undefined);
    await assert.rejects(usuarios.create({ nome: 'X', email: 'x@a.com' }), ConflictError);
  });

  it('alunos e usuários: filtros opcionais, sempre com a escola', async () => {
    const prisma = criarPrismaFake({ 'aluno.create': ({ data }) => ({ id: 1, ...data }) });
    const { alunos, usuarios } = daEscola(prisma);

    await alunos.list({ status: 'ativo', usuarioRespId: 3 });
    await alunos.list();
    await usuarios.list({ papel: 'professor' });
    await usuarios.list();
    await alunos.findById(5);
    assert.deepEqual(
      prisma.chamadas.map(([, args]) => args.where),
      [
        { status: 'ativo', usuarioRespId: 3, escolaId: ESCOLA },
        { escolaId: ESCOLA },
        { papel: 'professor', escolaId: ESCOLA },
        { escolaId: ESCOLA },
        { id: 5, escolaId: ESCOLA },
      ],
    );
    assert.equal((await alunos.create({ nome: 'Ana' })).escolaId, ESCOLA);
  });

  it('alunos: edita só dentro da escola', async () => {
    const prisma = criarPrismaFake({
      'aluno.updateMany': { count: 0 }, // registro de outra escola
    });
    assert.equal(await daEscola(prisma).alunos.update(5, { nome: 'X' }), null);
    assert.deepEqual(prisma.chamadas[0][1].where, { id: 5, escolaId: ESCOLA });
  });

  it('planos: converte o Decimal do valor em número e cria na escola', async () => {
    const prisma = criarPrismaFake({
      'plano.findMany': [{ id: 1, valor: { toString: () => '140.00' } }],
      'plano.findFirst': null,
      'plano.create': ({ data }) => ({ id: 2, ...data, valor: { toString: () => '90.00' } }),
    });
    const { planos } = daEscola(prisma);
    const [plano] = await planos.list();
    assert.equal(plano.valor, 140);
    assert.equal(await planos.findById(9), null);
    const criado = await planos.create({ nome: 'Grupo', valor: 90 });
    assert.deepEqual([criado.valor, criado.escolaId], [90, ESCOLA]);
  });

  it('planos: edita convertendo o valor e informa se removeu', async () => {
    let removidos = 1;
    const prisma = criarPrismaFake({
      'plano.updateMany': { count: 1 },
      'plano.findUnique': ({ where }) => ({ id: where.id, nome: 'P', valor: { toString: () => '150.00' } }),
      'plano.deleteMany': () => ({ count: removidos }),
    });
    const { planos } = daEscola(prisma);
    assert.deepEqual(await planos.update(1, { nome: 'P' }), { id: 1, nome: 'P', valor: 150 });
    assert.equal(await planos.remove(1), true);
    removidos = 0;
    assert.equal(await planos.remove(1), false);
    assert.deepEqual(prisma.chamadas.at(-1)[1].where, { id: 1, escolaId: ESCOLA });
  });

  it('alunos: exclusão apaga, numa transação, tudo o que aponta para o aluno — só na escola', async () => {
    const prisma = criarPrismaFake({ 'aula.deleteMany': { count: 3 }, 'aluno.deleteMany': { count: 1 } });
    const resultado = await daEscola(prisma).alunos.remove(7);
    assert.deepEqual(resultado, { aulasExcluidas: 3 });
    assert.deepEqual(
      prisma.chamadas.map(([operacao, args]) => [operacao, args.where]),
      [
        ['diarioAula.deleteMany', { aula: { alunoId: 7 }, escolaId: ESCOLA }], // diários primeiro: apontam para as aulas
        ['solicitacao.deleteMany', { alunoId: 7, escolaId: ESCOLA }],
        ['mensalidade.deleteMany', { alunoId: 7, escolaId: ESCOLA }],
        ['aula.deleteMany', { alunoId: 7, escolaId: ESCOLA }],
        ['aluno.deleteMany', { id: 7, escolaId: ESCOLA }],
      ],
    );
  });
});

describe('repositórios Prisma — falta, reposição, diário, mensalidades e alertas (RF06–RF12)', () => {
  it('escolas: lista todas em ordem de cadastro (para as rotinas)', async () => {
    const prisma = criarPrismaFake({ 'escola.findMany': [{ id: 1 }, { id: 2 }] });
    assert.deepEqual(await createPrismaRepositories(prisma).escolas.list(), [{ id: 1 }, { id: 2 }]);
    assert.deepEqual(prisma.chamadas[0][1], { orderBy: { id: 'asc' } });
  });

  it('solicitações: filtros na escola; a nova data da reposição vai e volta como "AAAA-MM-DDTHH:MM"', async () => {
    const prisma = criarPrismaFake({
      'solicitacao.findMany': [
        { id: 1, dataSolicitacao: new Date('2026-10-07T11:00:00.000Z'), novaData: new Date('2026-10-14T14:00:00.000Z') },
        { id: 2, dataSolicitacao: new Date('2026-10-07T12:00:00.000Z'), novaData: null },
      ],
      'solicitacao.create': ({ data }) => ({ id: 3, ...data }),
    });
    const { solicitacoes } = daEscola(prisma);
    assert.deepEqual(await solicitacoes.list({ alunoIds: [1, 2], aulaIds: [5], tipo: 'falta' }), [
      { id: 1, dataSolicitacao: '2026-10-07T11:00:00.000Z', novaData: '2026-10-14T14:00', dataAnterior: null },
      { id: 2, dataSolicitacao: '2026-10-07T12:00:00.000Z', novaData: null, dataAnterior: null },
    ]);
    assert.deepEqual(prisma.chamadas[0][1], {
      where: { alunoId: { in: [1, 2] }, aulaId: { in: [5] }, tipo: 'falta', escolaId: ESCOLA },
      orderBy: { id: 'asc' },
    });
    await solicitacoes.list({ alunoId: 4 });
    assert.deepEqual(prisma.chamadas[1][1].where, { alunoId: 4, escolaId: ESCOLA });

    const criada = await solicitacoes.create({
      alunoId: 1,
      aulaId: 5,
      tipo: 'reposicao',
      status: 'aprovada',
      novaData: '2026-10-14T14:00',
      dataSolicitacao: '2026-10-07T11:00:00.000Z',
    });
    assert.deepEqual(prisma.chamadas[2][1].data, {
      alunoId: 1,
      aulaId: 5,
      tipo: 'reposicao',
      status: 'aprovada',
      novaData: new Date('2026-10-14T14:00:00.000Z'),
      dataSolicitacao: new Date('2026-10-07T11:00:00.000Z'),
      escolaId: ESCOLA,
    });
    assert.deepEqual([criada.novaData, criada.dataSolicitacao], ['2026-10-14T14:00', '2026-10-07T11:00:00.000Z']);
  });

  it('diários: um por aula (upsert), sempre na escola', async () => {
    const prisma = criarPrismaFake({ 'diarioAula.upsert': ({ create }) => ({ id: 1, ...create }) });
    const { diarios } = daEscola(prisma);
    await diarios.list({ aulaIds: [1, 2] });
    await diarios.list();
    await diarios.findByAulaId(1);
    const salvo = await diarios.salvar({ aulaId: 1, conteudoMinistrado: 'Escalas' });
    assert.deepEqual(
      prisma.chamadas.slice(0, 3).map(([operacao, args]) => [operacao, args.where]),
      [
        ['diarioAula.findMany', { aulaId: { in: [1, 2] }, escolaId: ESCOLA }],
        ['diarioAula.findMany', { escolaId: ESCOLA }],
        ['diarioAula.findFirst', { aulaId: 1, escolaId: ESCOLA }],
      ],
    );
    assert.deepEqual(prisma.chamadas[3][1], {
      where: { aulaId: 1 },
      create: { aulaId: 1, conteudoMinistrado: 'Escalas', planoProxima: null, escolaId: ESCOLA },
      update: { conteudoMinistrado: 'Escalas', planoProxima: null },
    });
    assert.equal(salvo.planoProxima, null);
  });

  it('mensalidades: Decimal vira número e DATE vira "AAAA-MM-DD"; duplicada vira 409', async () => {
    const doBanco = {
      id: 1,
      valor: '140.00',
      vencimento: dataDoBanco('2026-10-10'),
      dataPagamento: dataDoBanco('2026-10-05'),
      status: 'paga',
    };
    let duplicar = false;
    const prisma = criarPrismaFake({
      'mensalidade.findMany': [doBanco, { ...doBanco, id: 2, dataPagamento: null, status: 'pendente' }],
      'mensalidade.findFirst': doBanco,
      'mensalidade.create': ({ data }) => {
        if (duplicar) throw erroDeUnicidade('mensalidade_aluno_id_mes_referencia_key');
        return { id: 3, ...data };
      },
      'mensalidade.updateMany': { count: 1 },
      'mensalidade.findUnique': { ...doBanco, dataPagamento: null, status: 'pendente' },
    });
    const { mensalidades } = daEscola(prisma);
    const lista = await mensalidades.list({ mes: '2026-10', alunoIds: [1], naoPagas: true });
    assert.deepEqual(lista[0], {
      id: 1,
      valor: 140,
      valorOriginal: null,
      vencimento: '2026-10-10',
      dataPagamento: '2026-10-05',
      status: 'paga',
    });
    assert.equal(lista[1].dataPagamento, null);
    assert.deepEqual(prisma.chamadas[0][1], {
      where: { mesReferencia: '2026-10', alunoId: { in: [1] }, status: { in: ['pendente', 'atrasada'] }, escolaId: ESCOLA },
      orderBy: [{ mesReferencia: 'desc' }, { id: 'asc' }],
    });
    await mensalidades.list();
    assert.deepEqual(prisma.chamadas[1][1].where, { alunoId: undefined, escolaId: ESCOLA });
    assert.equal((await mensalidades.findById(1)).valor, 140);
    assert.deepEqual(prisma.chamadas[2][1].where, { id: 1, escolaId: ESCOLA });

    const criada = await mensalidades.create({ alunoId: 1, mesReferencia: '2026-10', valor: 140, vencimento: '2026-10-10', status: 'pendente' });
    assert.deepEqual(prisma.chamadas[3][1].data, {
      alunoId: 1,
      mesReferencia: '2026-10',
      valor: 140,
      vencimento: dataDoBanco('2026-10-10'),
      status: 'pendente',
      escolaId: ESCOLA,
    });
    assert.equal(criada.vencimento, '2026-10-10');
    duplicar = true;
    await assert.rejects(mensalidades.create({ alunoId: 1, mesReferencia: '2026-10', valor: 140, vencimento: '2026-10-10' }), {
      name: ConflictError.name,
      message: 'Este aluno já tem mensalidade neste mês.',
    });

    const desfeita = await mensalidades.update(1, { status: 'pendente', dataPagamento: null, formaPagamento: null });
    assert.deepEqual(prisma.chamadas.at(-2)[1], {
      where: { id: 1, escolaId: ESCOLA },
      data: { status: 'pendente', dataPagamento: null, formaPagamento: null },
    });
    assert.equal(desfeita.dataPagamento, null);
    await mensalidades.update(1, { dataPagamento: '2026-10-06' });
    assert.deepEqual(prisma.chamadas.at(-2)[1].data, { dataPagamento: dataDoBanco('2026-10-06') });
  });

  it('alertas: datas em ISO, filtros na escola e alerta repetido vira 409', async () => {
    const criadoEm = new Date('2026-10-09T12:00:00.000Z');
    let duplicar = false;
    const prisma = criarPrismaFake({
      'alerta.findMany': [{ id: 1, criadoEm, enviadoEm: null }],
      'alerta.create': ({ data }) => {
        if (duplicar) throw erroDeUnicidade('alerta_mensalidade_id_tipo_key');
        return { id: 2, ...data, criadoEm, enviadoEm: null };
      },
      'alerta.updateMany': { count: 1 },
      'alerta.findUnique': { id: 2, criadoEm, enviadoEm: new Date('2026-10-09T12:05:00.000Z') },
    });
    const { alertas } = daEscola(prisma);
    assert.deepEqual(await alertas.list({ status: 'pendente', mensalidadeIds: [1] }), [
      { id: 1, criadoEm: '2026-10-09T12:00:00.000Z', enviadoEm: null },
    ]);
    assert.deepEqual(prisma.chamadas[0][1].where, { status: 'pendente', mensalidadeId: { in: [1] }, escolaId: ESCOLA });
    await alertas.list();
    assert.deepEqual(prisma.chamadas[1][1].where, { escolaId: ESCOLA });

    await alertas.create({ mensalidadeId: 1, tipo: 'atraso', destinatario: 'mary@a.com' });
    assert.deepEqual(prisma.chamadas[2][1].data, { mensalidadeId: 1, tipo: 'atraso', destinatario: 'mary@a.com', escolaId: ESCOLA });
    duplicar = true;
    await assert.rejects(alertas.create({ mensalidadeId: 1, tipo: 'atraso', destinatario: 'mary@a.com' }), {
      name: ConflictError.name,
      message: 'Este alerta já foi registrado.',
    });

    const enviado = await alertas.update(2, { status: 'enviado', enviadoEm: '2026-10-09T12:05:00.000Z', tentativas: 1 });
    assert.deepEqual(prisma.chamadas.at(-2)[1].data, {
      status: 'enviado',
      tentativas: 1,
      enviadoEm: new Date('2026-10-09T12:05:00.000Z'),
    });
    assert.equal(enviado.enviadoEm, '2026-10-09T12:05:00.000Z');
    await alertas.update(2, { tentativas: 2, ultimoErro: 'falhou' });
    assert.deepEqual(prisma.chamadas.at(-2)[1].data, { tentativas: 2, ultimoErro: 'falhou' });
  });
});

describe('repositórios Prisma — Pix da escola, redefinição de senha, recibo numerado e remarcação', () => {
  it('escolas: edita nome e Pix sem nunca trocar o código', async () => {
    let encontrou = 1;
    const prisma = criarPrismaFake({
      'escola.updateMany': () => ({ count: encontrou }),
      'escola.findUnique': { id: 1, nome: 'Sol', codigo: 'sol' },
    });
    const { escolas } = createPrismaRepositories(prisma);
    assert.deepEqual(await escolas.update(1, { nome: 'Sol', codigo: 'outro', pixChave: 'a@b.com' }), { id: 1, nome: 'Sol', codigo: 'sol' });
    assert.deepEqual(prisma.chamadas[0][1], { where: { id: 1 }, data: { nome: 'Sol', pixChave: 'a@b.com' } });
    encontrou = 0;
    assert.equal(await escolas.update(2, { nome: 'x' }), null);
  });

  it('redefinições de senha: datas em ISO, uso único e limpeza dos vencidos', async () => {
    const doBanco = {
      id: 5,
      escolaId: 1,
      usuarioId: 7,
      tokenHash: 'h',
      expiraEm: new Date('2026-10-07T14:00:00.000Z'),
      usadoEm: null,
      criadoEm: new Date('2026-10-07T13:00:00.000Z'),
    };
    let usados = 1;
    const prisma = criarPrismaFake({
      'redefinicaoSenha.create': ({ data }) => ({ ...doBanco, ...data }),
      'redefinicaoSenha.findUnique': ({ where }) => (where.tokenHash === 'h' ? doBanco : null),
      'redefinicaoSenha.updateMany': () => ({ count: usados }),
      'redefinicaoSenha.deleteMany': { count: 3 },
    });
    const { redefinicoesDeSenha: pedidos } = createPrismaRepositories(prisma);
    const criado = await pedidos.create({ escolaId: 1, usuarioId: 7, tokenHash: 'h', expiraEm: '2026-10-07T14:00:00.000Z' });
    assert.deepEqual(prisma.chamadas[0][1].data.expiraEm, new Date('2026-10-07T14:00:00.000Z'));
    assert.deepEqual([criado.expiraEm, criado.usadoEm, criado.criadoEm], ['2026-10-07T14:00:00.000Z', null, '2026-10-07T13:00:00.000Z']);
    assert.equal((await pedidos.findByTokenHash('h')).id, 5);
    assert.equal(await pedidos.findByTokenHash('outro'), null);
    assert.equal(await pedidos.usar(5, '2026-10-07T13:30:00.000Z'), true);
    assert.deepEqual(prisma.chamadas.at(-1)[1], {
      where: { id: 5, usadoEm: null },
      data: { usadoEm: new Date('2026-10-07T13:30:00.000Z') },
    });
    usados = 0;
    assert.equal(await pedidos.usar(5, '2026-10-07T13:31:00.000Z'), false);
    usados = 2;
    assert.equal(await pedidos.invalidarDoUsuario(7, '2026-10-07T13:32:00.000Z'), 2);
    assert.deepEqual(prisma.chamadas.at(-1)[1].where, { usuarioId: 7, usadoEm: null });
    assert.equal(await pedidos.removerVencidos('2026-10-07T13:00:00.000Z'), 3);
    assert.deepEqual(prisma.chamadas.at(-1)[1], { where: { expiraEm: { lt: new Date('2026-10-07T13:00:00.000Z') } } });
  });

  it('mensalidades: valor antes do ajuste vira número; recibo numerado com o maior + 1 da escola', async () => {
    const mensalidade = {
      id: 9,
      valor: '126.50',
      valorOriginal: '140.00',
      vencimento: dataDoBanco('2026-10-10'),
      dataPagamento: null,
      numeroRecibo: null,
    };
    let numero = null;
    const prisma = criarPrismaFake({
      'mensalidade.findFirst': () => ({ ...mensalidade, numeroRecibo: numero }),
      'mensalidade.aggregate': { _max: { numeroRecibo: 41 } },
      'mensalidade.updateMany': ({ data }) => {
        numero = data.numeroRecibo;
        return { count: 1 };
      },
    });
    const { mensalidades } = daEscola(prisma);
    const numerada = await mensalidades.registrarNumeroRecibo(9);
    assert.deepEqual([numerada.numeroRecibo, numerada.valor, numerada.valorOriginal], [42, 126.5, 140]);
    assert.deepEqual(prisma.chamadas[1][1], { where: { escolaId: ESCOLA }, _max: { numeroRecibo: true } });
    assert.deepEqual(prisma.chamadas[2][1], { where: { id: 9, numeroRecibo: null, escolaId: ESCOLA }, data: { numeroRecibo: 42 } });
    // Já numerada: devolve sem gravar de novo.
    const antes = prisma.chamadas.length;
    assert.equal((await mensalidades.registrarNumeroRecibo(9)).numeroRecibo, 42);
    assert.equal(prisma.chamadas.length, antes + 1);
  });

  it('recibo: número disputado por duas baixas tenta o seguinte; desiste depois de 5 tentativas', async () => {
    let maior = 0;
    let falhas = 1;
    let numero = null;
    const prisma = criarPrismaFake({
      'mensalidade.findFirst': () => ({
        id: 9,
        valor: '140.00',
        vencimento: dataDoBanco('2026-10-10'),
        dataPagamento: null,
        numeroRecibo: numero,
      }),
      'mensalidade.aggregate': () => ({ _max: { numeroRecibo: maior } }),
      'mensalidade.updateMany': ({ data }) => {
        if (falhas > 0) {
          falhas -= 1;
          maior += 1; // outra baixa pegou o número
          throw erroDeUnicidade('mensalidade_escola_id_numero_recibo_key');
        }
        numero = data.numeroRecibo;
        return { count: 1 };
      },
    });
    assert.equal((await daEscola(prisma).mensalidades.registrarNumeroRecibo(9)).numeroRecibo, 2);

    numero = null;
    falhas = 99;
    await assert.rejects(daEscola(prisma).mensalidades.registrarNumeroRecibo(9), {
      name: ConflictError.name,
      message: 'Não foi possível numerar o recibo agora. Tente de novo.',
    });
    const quebrado = criarPrismaFake({
      'mensalidade.findFirst': { id: 9, valor: '1', vencimento: dataDoBanco('2026-10-10'), numeroRecibo: null },
      'mensalidade.aggregate': { _max: { numeroRecibo: null } },
      'mensalidade.updateMany': () => {
        throw new Error('conexão perdida');
      },
    });
    await assert.rejects(daEscola(quebrado).mensalidades.registrarNumeroRecibo(9), /conexão perdida/);
    assert.equal(await daEscola(criarPrismaFake()).mensalidades.registrarNumeroRecibo(9), null); // de outra escola
  });

  it('remarcação: a data da aula vira DATE; a solicitação guarda a data anterior como data e hora', async () => {
    const prisma = criarPrismaFake({
      'aula.updateMany': { count: 1 },
      'aula.findUnique': { id: 2, data: dataDoBanco('2026-10-13'), hora: '15:00' },
      'solicitacao.create': ({ data }) => ({ id: 3, dataSolicitacao: new Date('2026-10-07T13:00:00.000Z'), ...data }),
    });
    const { aulas, solicitacoes } = daEscola(prisma);
    const aula = await aulas.update(2, { data: '2026-10-13', hora: '15:00' });
    assert.deepEqual(prisma.chamadas[0][1].data, { data: dataDoBanco('2026-10-13'), hora: '15:00' });
    assert.equal(aula.data, '2026-10-13');
    await aulas.update(2, { status: 'cancelada' });
    assert.deepEqual(prisma.chamadas[2][1].data, { status: 'cancelada' });

    const criada = await solicitacoes.create({
      alunoId: 1,
      aulaId: 2,
      tipo: 'remarcacao',
      status: 'aprovada',
      novaData: '2026-10-13T15:00',
      dataAnterior: '2026-10-12T14:00',
    });
    assert.deepEqual(prisma.chamadas.at(-1)[1].data.dataAnterior, new Date('2026-10-12T14:00:00.000Z'));
    assert.deepEqual([criada.novaData, criada.dataAnterior], ['2026-10-13T15:00', '2026-10-12T14:00']);
  });
});
