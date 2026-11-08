import { createMailer } from './infra/email/mailer.js';
import { createMemoryRepositories } from './infra/memory/memoryRepositories.js';
import { seedMemoria } from './infra/memory/seed.js';
import * as documentos from './infra/pdf/documentos.js';
import { gerarQrCodeSvg } from './infra/pix/qrcode.js';
import { createPasswordHasher } from './infra/security/passwordHasher.js';
import { createTokenService } from './infra/security/tokenService.js';
import { createAlunoService } from './modules/alunos/aluno.service.js';
import { createAulaService } from './modules/aulas/aula.service.js';
import { createAuthService } from './modules/auth/auth.service.js';
import { createDadosEscolaService } from './modules/escolas/dadosEscola.service.js';
import { createEscolaService } from './modules/escolas/escola.service.js';
import { createFeriadoService } from './modules/feriados/feriado.service.js';
import { createHistoricoService } from './modules/historico/historico.service.js';
import { createHorarioService } from './modules/horarios/horario.service.js';
import { createIndicadorService } from './modules/indicadores/indicador.service.js';
import { createMensalidadeService } from './modules/mensalidades/mensalidade.service.js';
import { createPlanoService } from './modules/planos/plano.service.js';
import { createRelatorioService } from './modules/relatorios/relatorio.service.js';
import { createReposicaoService } from './modules/reposicoes/reposicao.service.js';
import { createUsuarioService } from './modules/usuarios/usuario.service.js';

/**
 * Raiz de composição: escolhe a implementação dos repositórios e monta os serviços.
 * Trocar memória por MySQL não exige nenhuma mudança nos serviços (inversão de dependência).
 *
 * Multi-tenant: `auth` e `escolas` são globais; os demais serviços existem POR ESCOLA —
 * `servicosDaEscola(id)` os monta sobre repositórios restritos àquela escola (e guarda para reaproveitar).
 */
export async function createContainer(env) {
  const passwordHasher = createPasswordHasher();
  const tokenService = createTokenService({ secret: env.jwtSecret, expiresIn: env.jwtExpiresIn });
  const mailer = createMailer({ smtpUrl: env.smtpUrl, remetente: env.emailRemetente });

  let repositories;
  if (env.dbDriver === 'mysql') {
    const { conectarPrisma, createPrismaRepositories } = await import('./infra/prisma/prismaRepositories.js');
    repositories = createPrismaRepositories(await conectarPrisma());
  } else {
    repositories = createMemoryRepositories();
    await seedMemoria(repositories, passwordHasher);
  }
  const { escolas, redefinicoesDeSenha, paraEscola } = repositories;

  const auth = createAuthService({
    escolas,
    paraEscola,
    passwordHasher,
    tokenService,
    redefinicoesDeSenha,
    mailer,
    appUrl: env.appUrl,
  });
  const escolaService = createEscolaService({
    escolas,
    paraEscola,
    passwordHasher,
    auth,
    cadastroAberto: env.cadastroEscolas,
    recuperacaoDeSenha: mailer.configurado,
  });

  const porEscola = new Map();
  function servicosDaEscola(escolaId) {
    if (!porEscola.has(escolaId)) {
      const { usuarios, planos, alunos, horarios, aulas, feriados, solicitacoes, diarios, mensalidades, alertas } =
        paraEscola(escolaId);
      const escola = () => escolas.findById(escolaId);
      const reposicoes = createReposicaoService({ aulas, alunos, usuarios, horarios, feriados, solicitacoes, diarios });
      porEscola.set(escolaId, {
        usuarios: createUsuarioService({ usuarios, passwordHasher, horarios }),
        planos: createPlanoService({ planos, alunos }),
        alunos: createAlunoService({ alunos, planos, usuarios, aulas, feriados, mensalidades }),
        horarios: createHorarioService({ horarios, aulas, usuarios, feriados, alunos }),
        aulas: createAulaService({ aulas, alunos, planos, usuarios, feriados, solicitacoes, diarios, reposicoes }),
        feriados: createFeriadoService({ feriados, aulas, alunos }),
        reposicoes,
        mensalidades: createMensalidadeService({
          mensalidades,
          alunos,
          planos,
          usuarios,
          alertas,
          escola,
          mailer,
          documentos,
          qrCode: gerarQrCodeSvg,
        }),
        indicadores: createIndicadorService({ alunos, aulas, mensalidades, reposicoes }),
        historico: createHistoricoService({ alunos, aulas, planos, usuarios, diarios, solicitacoes, mensalidades }),
        relatorios: createRelatorioService({ alunos, aulas, mensalidades, usuarios, escola, documentos }),
        escola: createDadosEscolaService({ escolas, escolaId, qrCode: gerarQrCodeSvg }),
      });
    }
    return porEscola.get(escolaId);
  }

  return { repositories, auth, escolas: escolaService, servicosDaEscola, tokenService };
}
