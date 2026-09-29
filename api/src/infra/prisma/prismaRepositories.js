import { PrismaClient } from '@prisma/client';
import { paraDataISO, paraDate } from '../../shared/datas.js';

/** Converte o Decimal do Prisma em número para manter a mesma interface dos repositórios em memória. */
const paraPlano = (plano) => (plano ? { ...plano, valor: Number(plano.valor) } : null);

/** A coluna DATE chega como Date; a interface dos repositórios usa "AAAA-MM-DD". */
const paraAula = (aula) => (aula ? { ...aula, data: paraDataISO(aula.data) } : null);

const filtroDeData = (inicio, fim) => {
  if (!inicio && !fim) return undefined;
  return { ...(inicio && { gte: paraDate(inicio) }), ...(fim && { lte: paraDate(fim) }) };
};

/** Linha útil de um erro do Prisma (as mensagens vêm com várias linhas e cabeçalho "Invalid ... invocation"). */
function resumirErro(erro) {
  const linhas = String(erro?.message ?? erro)
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha && !linha.startsWith('Invalid'));
  return linhas[0] ?? 'erro desconhecido';
}

/**
 * Cria o cliente e testa o banco já na inicialização: falha cedo, dizendo o que fazer,
 * em vez de subir a API e responder "erro interno" no primeiro login.
 */
export async function conectarPrisma() {
  let prisma;
  try {
    prisma = new PrismaClient();
  } catch {
    throw new Error('O cliente do Prisma não foi gerado. Na pasta "api", rode: npm run prisma:generate');
  }
  try {
    await prisma.usuario.count(); // conecta e confirma que as tabelas existem
  } catch (erro) {
    await prisma.$disconnect().catch(() => {});
    throw new Error(
      'Não foi possível usar o banco MySQL definido em DATABASE_URL (api/.env). ' +
        'Verifique se o MySQL do XAMPP está ligado e se o banco foi importado (api/prisma/emmoo.sql).\n' +
        `  Detalhe: ${resumirErro(erro)}`,
    );
  }
  return prisma;
}

/**
 * Repositórios persistidos em MySQL via Prisma (DB_DRIVER=mysql).
 * Implementam exatamente a mesma interface dos repositórios em memória.
 */
export function createPrismaRepositories(prisma = new PrismaClient()) {
  return {
    usuarios: {
      list: ({ papel } = {}) => prisma.usuario.findMany({ where: papel ? { papel } : {}, orderBy: { nome: 'asc' } }),
      findByEmail: (email) => prisma.usuario.findUnique({ where: { email: String(email).trim().toLowerCase() } }),
      findById: (id) => prisma.usuario.findUnique({ where: { id } }),
      create: (dados) => prisma.usuario.create({ data: { ...dados, email: dados.email.trim().toLowerCase() } }),
    },
    planos: {
      list: async () => (await prisma.plano.findMany({ orderBy: { nome: 'asc' } })).map(paraPlano),
      findById: async (id) => paraPlano(await prisma.plano.findUnique({ where: { id } })),
      create: async (dados) => paraPlano(await prisma.plano.create({ data: dados })),
    },
    alunos: {
      list: ({ status, usuarioRespId } = {}) =>
        prisma.aluno.findMany({
          where: { ...(status && { status }), ...(usuarioRespId !== undefined && { usuarioRespId }) },
          orderBy: { nome: 'asc' },
        }),
      findById: (id) => prisma.aluno.findUnique({ where: { id } }),
      create: (dados) => prisma.aluno.create({ data: dados }),
      update: (id, dados) => prisma.aluno.update({ where: { id }, data: dados }),
    },
    horarios: {
      list: ({ professorId } = {}) =>
        prisma.horarioDisponivel.findMany({
          where: professorId !== undefined ? { professorId } : {},
          orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }],
        }),
      findById: (id) => prisma.horarioDisponivel.findUnique({ where: { id } }),
      create: (dados) => prisma.horarioDisponivel.create({ data: dados }),
      remove: async (id) => (await prisma.horarioDisponivel.deleteMany({ where: { id } })).count > 0,
    },
    aulas: {
      list: async ({ inicio, fim, professorId, alunoId, alunoIds } = {}) => {
        const aulas = await prisma.aula.findMany({
          where: {
            data: filtroDeData(inicio, fim),
            professorId,
            alunoId: alunoIds !== undefined ? { in: alunoIds } : alunoId,
          },
          orderBy: [{ data: 'asc' }, { hora: 'asc' }],
        });
        return aulas.map(paraAula);
      },
      findById: async (id) => paraAula(await prisma.aula.findUnique({ where: { id } })),
      // Transação: ou todas as aulas da série são criadas, ou nenhuma.
      createMany: async (lista) => {
        const criadas = await prisma.$transaction(
          lista.map((dados) => prisma.aula.create({ data: { ...dados, data: paraDate(dados.data) } })),
        );
        return criadas.map(paraAula);
      },
      update: async (id, dados) => paraAula(await prisma.aula.update({ where: { id }, data: dados })),
    },
  };
}
