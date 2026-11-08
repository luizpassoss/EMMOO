import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { createAuthMiddleware } from './middlewares/auth.js';
import { createErrorHandler, notFound } from './middlewares/errorHandler.js';
import { createAlunoController } from './modules/alunos/aluno.controller.js';
import { alunoRoutes } from './modules/alunos/aluno.routes.js';
import { createAulaController } from './modules/aulas/aula.controller.js';
import { aulaRoutes } from './modules/aulas/aula.routes.js';
import { createAuthController } from './modules/auth/auth.controller.js';
import { authRoutes } from './modules/auth/auth.routes.js';
import { createDadosEscolaController } from './modules/escolas/dadosEscola.controller.js';
import { dadosEscolaRoutes } from './modules/escolas/dadosEscola.routes.js';
import { createEscolaController } from './modules/escolas/escola.controller.js';
import { escolaRoutes } from './modules/escolas/escola.routes.js';
import { createFeriadoController } from './modules/feriados/feriado.controller.js';
import { feriadoRoutes } from './modules/feriados/feriado.routes.js';
import { createHistoricoController } from './modules/historico/historico.controller.js';
import { createHorarioController } from './modules/horarios/horario.controller.js';
import { horarioRoutes } from './modules/horarios/horario.routes.js';
import { createIndicadorController } from './modules/indicadores/indicador.controller.js';
import { indicadorRoutes } from './modules/indicadores/indicador.routes.js';
import { createMensalidadeController } from './modules/mensalidades/mensalidade.controller.js';
import { mensalidadeRoutes } from './modules/mensalidades/mensalidade.routes.js';
import { createPlanoController } from './modules/planos/plano.controller.js';
import { planoRoutes } from './modules/planos/plano.routes.js';
import { createRelatorioController } from './modules/relatorios/relatorio.controller.js';
import { relatorioRoutes } from './modules/relatorios/relatorio.routes.js';
import { createReposicaoController } from './modules/reposicoes/reposicao.controller.js';
import { reposicaoRoutes } from './modules/reposicoes/reposicao.routes.js';
import { createUsuarioController } from './modules/usuarios/usuario.controller.js';
import { usuarioRoutes } from './modules/usuarios/usuario.routes.js';

/**
 * Monta a aplicação Express (sem abrir porta), o que permite testá-la de ponta a ponta.
 * `auth` e `escolas` são globais; o resto usa os serviços da escola do usuário (`req.servicos`).
 */
export function createApp({
  auth,
  escolas,
  servicosDaEscola,
  tokenService,
  corsOrigin = ['http://localhost:5173'],
  trustProxy = false,
  logger = console,
}) {
  const app = express();
  // Atrás de um proxy (nginx, túnel), o IP de quem acessa vem do X-Forwarded-For: é ele que entra no limite de login.
  app.set('trust proxy', trustProxy);
  app.use(helmet());
  // O nome do arquivo dos PDFs (recibo, relatório) vem no Content-Disposition: o front em outra origem precisa lê-lo.
  app.use(cors({ origin: corsOrigin, exposedHeaders: ['Content-Disposition'] }));
  app.use(express.json({ limit: '100kb' }));

  const { authenticate, authorize } = createAuthMiddleware(tokenService, {
    servicosDaEscola,
    verificarSessao: (sessao) => auth.validarSessao(sessao),
  });
  const protegidas = { authenticate, authorize };
  const daEscola = (nome) => (req) => req.servicos[nome];

  // Observabilidade: endpoint de saúde usado por monitoramento e pelo pipeline de deploy.
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', servico: 'emmoo-api', timestamp: new Date().toISOString() });
  });

  app.use('/api/escolas', escolaRoutes({ controller: createEscolaController(escolas) }));
  app.use('/api/auth', authRoutes({ controller: createAuthController(auth), authenticate }));
  app.use('/api/escola', dadosEscolaRoutes({ controller: createDadosEscolaController(daEscola('escola')), ...protegidas }));
  app.use('/api/usuarios', usuarioRoutes({ controller: createUsuarioController(daEscola('usuarios')), ...protegidas }));
  app.use('/api/planos', planoRoutes({ controller: createPlanoController(daEscola('planos')), ...protegidas }));
  app.use(
    '/api/alunos',
    alunoRoutes({
      controller: createAlunoController(daEscola('alunos')),
      historico: createHistoricoController(daEscola('historico')),
      ...protegidas,
    }),
  );
  app.use('/api/horarios', horarioRoutes({ controller: createHorarioController(daEscola('horarios')), ...protegidas }));
  app.use('/api/aulas', aulaRoutes({ controller: createAulaController(daEscola('aulas')), ...protegidas }));
  app.use('/api/feriados', feriadoRoutes({ controller: createFeriadoController(daEscola('feriados')), ...protegidas }));
  app.use('/api/reposicoes', reposicaoRoutes({ controller: createReposicaoController(daEscola('reposicoes')), ...protegidas }));
  app.use(
    '/api/mensalidades',
    mensalidadeRoutes({ controller: createMensalidadeController(daEscola('mensalidades')), ...protegidas }),
  );
  app.use('/api/indicadores', indicadorRoutes({ controller: createIndicadorController(daEscola('indicadores')), ...protegidas }));
  app.use('/api/relatorios', relatorioRoutes({ controller: createRelatorioController(daEscola('relatorios')), ...protegidas }));

  app.use(notFound);
  app.use(createErrorHandler({ logger }));
  return app;
}
