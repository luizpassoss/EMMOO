import { createMemoryRepositories } from './infra/memory/memoryRepositories.js';
import { seedMemoria } from './infra/memory/seed.js';
import { createPasswordHasher } from './infra/security/passwordHasher.js';
import { createTokenService } from './infra/security/tokenService.js';
import { createAlunoService } from './modules/alunos/aluno.service.js';
import { createAulaService } from './modules/aulas/aula.service.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { createHorarioService } from './modules/horarios/horario.service.js';
import { createPlanoService } from './modules/planos/plano.service.js';
import { createUsuarioService } from './modules/usuarios/usuario.service.js';

/**
 * Raiz de composição: escolhe a implementação dos repositórios e monta os serviços.
 * Trocar memória por MySQL não exige nenhuma mudança nos serviços (inversão de dependência).
 */
export async function createContainer(env) {
  const passwordHasher = createPasswordHasher();
  const tokenService = createTokenService({ secret: env.jwtSecret, expiresIn: env.jwtExpiresIn });

  let repositories;
  if (env.dbDriver === 'mysql') {
    const { conectarPrisma, createPrismaRepositories } = await import('./infra/prisma/prismaRepositories.js');
    repositories = createPrismaRepositories(await conectarPrisma());
  } else {
    repositories = createMemoryRepositories();
    await seedMemoria(repositories, passwordHasher);
  }

  const { usuarios, planos, alunos, horarios, aulas } = repositories;
  const services = {
    auth: createAuthService({ usuarios, passwordHasher, tokenService }),
    usuarios: createUsuarioService({ usuarios }),
    planos: createPlanoService({ planos }),
    alunos: createAlunoService({ alunos, planos, usuarios, aulas }),
    horarios: createHorarioService({ horarios, aulas, usuarios }),
    aulas: createAulaService({ aulas, alunos, planos, usuarios }),
  };

  return { repositories, services, tokenService };
}
