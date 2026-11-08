/**
 * Dados iniciais para o modo MySQL (npm run db:seed). Idempotente: pode rodar mais de uma vez.
 * Tudo é criado dentro da escola de demonstração (código "emmoo").
 * ATENÇÃO: as senhas de demonstração devem ser trocadas antes de uso real.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ESCOLA_DEMO, HORARIOS_DEMO, PLANOS_DEMO, USUARIOS_DEMO } from '../src/infra/memory/seed.js';

const prisma = new PrismaClient();

async function main() {
  const escola = await prisma.escola.upsert({
    where: { codigo: ESCOLA_DEMO.codigo },
    update: {},
    create: ESCOLA_DEMO,
  });
  const escolaId = escola.id;

  // Usuários de demonstração: cria os que faltam e redefine o acesso (usuário e senha) dos que já existem,
  // para as credenciais do README sempre funcionarem. Só afeta estes três e-mails, e só nesta escola.
  for (const { senha, ...usuario } of USUARIOS_DEMO) {
    const senhaHash = await bcrypt.hash(senha, 10);
    await prisma.usuario.upsert({
      where: { escolaId_email: { escolaId, email: usuario.email } },
      update: { login: usuario.login, senhaHash },
      create: { ...usuario, senhaHash, escolaId },
    });
  }

  // Planos de exemplo: só cria os que ainda não existem (pelo nome), sem mexer nos já cadastrados.
  for (const plano of PLANOS_DEMO) {
    const existente = await prisma.plano.findFirst({ where: { escolaId, nome: plano.nome } });
    if (!existente) await prisma.plano.create({ data: { ...plano, escolaId } });
  }

  // Horários de atendimento do professor (RF04) — os mesmos do modo memória.
  const professor = await prisma.usuario.findUnique({
    where: { escolaId_email: { escolaId, email: 'luiz@emmoo.com.br' } },
  });
  for (const { diaSemana, horaInicio, duracaoMin } of HORARIOS_DEMO) {
    await prisma.horarioDisponivel.upsert({
      where: { professorId_diaSemana_horaInicio: { professorId: professor.id, diaSemana, horaInicio } },
      update: {},
      create: { professorId: professor.id, diaSemana, horaInicio, duracaoMin, escolaId },
    });
  }
  console.log(`Seed concluído na escola "${escola.nome}" (código: ${escola.codigo}).`);
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
