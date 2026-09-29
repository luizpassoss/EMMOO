import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPrismaRepositories } from '../../src/infra/prisma/prismaRepositories.js';

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
    usuario: modelo('usuario'),
    plano: modelo('plano'),
    aluno: modelo('aluno'),
    horarioDisponivel: modelo('horarioDisponivel'),
    aula: modelo('aula'),
    $transaction: (operacoes) => Promise.all(operacoes),
  };
}

const dataDoBanco = (iso) => new Date(`${iso}T00:00:00.000Z`);

describe('repositórios Prisma — mapeamento das consultas', () => {
  it('aulas: filtra período, professor e dependentes e devolve datas "AAAA-MM-DD"', async () => {
    const prisma = criarPrismaFake({
      'aula.findMany': [{ id: 1, data: dataDoBanco('2026-10-05'), hora: '14:00' }],
    });
    const { aulas } = createPrismaRepositories(prisma);

    assert.deepEqual(await aulas.list({ inicio: '2026-10-05', fim: '2026-10-11', professorId: 2 }), [
      { id: 1, data: '2026-10-05', hora: '14:00' },
    ]);
    assert.deepEqual(prisma.chamadas[0][1], {
      where: {
        data: { gte: dataDoBanco('2026-10-05'), lte: dataDoBanco('2026-10-11') },
        professorId: 2,
        alunoId: undefined,
      },
      orderBy: [{ data: 'asc' }, { hora: 'asc' }],
    });

    await aulas.list({ alunoIds: [1, 3] });
    assert.deepEqual(prisma.chamadas[1][1].where, { data: undefined, professorId: undefined, alunoId: { in: [1, 3] } });

    await aulas.list({ inicio: '2026-10-07', alunoId: 4 });
    assert.deepEqual(prisma.chamadas[2][1].where, {
      data: { gte: dataDoBanco('2026-10-07') },
      professorId: undefined,
      alunoId: 4,
    });
  });

  it('aulas: cria a série numa transação convertendo a data, busca e atualiza', async () => {
    const prisma = criarPrismaFake({
      'aula.create': ({ data }) => ({ id: 7, ...data }),
      'aula.findUnique': null,
      'aula.update': ({ where, data }) => ({ id: where.id, data: dataDoBanco('2026-10-05'), ...data }),
    });
    const { aulas } = createPrismaRepositories(prisma);

    const criadas = await aulas.createMany([{ alunoId: 1, professorId: 2, data: '2026-10-05', hora: '14:00' }]);
    assert.deepEqual(prisma.chamadas[0][1].data.data, dataDoBanco('2026-10-05'));
    assert.equal(criadas[0].data, '2026-10-05');

    assert.equal(await aulas.findById(99), null);
    assert.deepEqual(await aulas.update(7, { status: 'cancelada' }), { id: 7, data: '2026-10-05', status: 'cancelada' });
  });

  it('horários: ordena por dia e hora e informa se removeu', async () => {
    let removidos = 1;
    const prisma = criarPrismaFake({ 'horarioDisponivel.deleteMany': () => ({ count: removidos }) });
    const { horarios } = createPrismaRepositories(prisma);

    await horarios.list({ professorId: 2 });
    assert.deepEqual(prisma.chamadas[0][1], {
      where: { professorId: 2 },
      orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }],
    });
    await horarios.list();
    assert.deepEqual(prisma.chamadas[1][1].where, {});

    assert.equal(await horarios.remove(5), true);
    removidos = 0;
    assert.equal(await horarios.remove(5), false);
  });

  it('alunos e usuários: filtros opcionais', async () => {
    const prisma = criarPrismaFake();
    const { alunos, usuarios } = createPrismaRepositories(prisma);

    await alunos.list({ status: 'ativo', usuarioRespId: 3 });
    await alunos.list();
    await usuarios.list({ papel: 'professor' });
    await usuarios.list();
    assert.deepEqual(
      prisma.chamadas.map(([, args]) => args.where),
      [{ status: 'ativo', usuarioRespId: 3 }, {}, { papel: 'professor' }, {}],
    );
  });

  it('planos: converte o Decimal do valor em número', async () => {
    const prisma = criarPrismaFake({ 'plano.findMany': [{ id: 1, valor: { toString: () => '140.00' } }] });
    const [plano] = await createPrismaRepositories(prisma).planos.list();
    assert.equal(plano.valor, 140);
  });
});
