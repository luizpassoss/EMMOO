/**
 * Dados iniciais para o modo MySQL (npm run db:seed). Idempotente: pode rodar mais de uma vez.
 * ATENÇÃO: a senha de demonstração deve ser trocada antes de uso real.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { HORARIOS_DEMO } from '../src/infra/memory/seed.js';

const prisma = new PrismaClient();

async function main() {
  const senhaHash = await bcrypt.hash('emmoo123', 10);
  const usuarios = [
    { nome: 'Lucimara', email: 'lucimara@emmoo.com.br', papel: 'coordenacao' },
    { nome: 'Luiz', email: 'luiz@emmoo.com.br', papel: 'professor' },
    { nome: 'Mary', email: 'mary@emmoo.com.br', papel: 'responsavel' },
  ];
  for (const usuario of usuarios) {
    await prisma.usuario.upsert({
      where: { email: usuario.email },
      update: {},
      create: { ...usuario, senhaHash },
    });
  }

  const nomePlano = 'Particular 1x/semana';
  const planoExistente = await prisma.plano.findFirst({ where: { nome: nomePlano } });
  if (!planoExistente) {
    await prisma.plano.create({
      data: { nome: nomePlano, tipo: 'particular', valor: 140, freqSemanal: 1, duracaoMin: 45 },
    });
  }

  // Horários de atendimento do professor (RF04) — os mesmos do modo memória.
  const professor = await prisma.usuario.findUnique({ where: { email: 'luiz@emmoo.com.br' } });
  for (const { diaSemana, horaInicio, duracaoMin } of HORARIOS_DEMO) {
    await prisma.horarioDisponivel.upsert({
      where: { professorId_diaSemana_horaInicio: { professorId: professor.id, diaSemana, horaInicio } },
      update: {},
      create: { professorId: professor.id, diaSemana, horaInicio, duracaoMin },
    });
  }
  console.log('Seed concluído.');
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
