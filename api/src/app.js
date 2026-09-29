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
import { createHorarioController } from './modules/horarios/horario.controller.js';
import { horarioRoutes } from './modules/horarios/horario.routes.js';
import { createPlanoController } from './modules/planos/plano.controller.js';
import { planoRoutes } from './modules/planos/plano.routes.js';
import { createUsuarioController } from './modules/usuarios/usuario.controller.js';
import { usuarioRoutes } from './modules/usuarios/usuario.routes.js';

/** Monta a aplicação Express (sem abrir porta), o que permite testá-la de ponta a ponta. */
export function createApp({ services, tokenService, corsOrigin = ['http://localhost:5173'], logger = console }) {
  const app = express();
  app.use(helmet());
  app.use(cors({ origin: corsOrigin }));
  app.use(express.json({ limit: '100kb' }));

  const { authenticate, authorize } = createAuthMiddleware(tokenService);
  const protegidas = { authenticate, authorize };

  // Observabilidade: endpoint de saúde usado por monitoramento e pelo pipeline de deploy.
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', servico: 'emmoo-api', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes({ controller: createAuthController(services.auth), authenticate }));
  app.use('/api/usuarios', usuarioRoutes({ controller: createUsuarioController(services.usuarios), ...protegidas }));
  app.use('/api/planos', planoRoutes({ controller: createPlanoController(services.planos), ...protegidas }));
  app.use('/api/alunos', alunoRoutes({ controller: createAlunoController(services.alunos), ...protegidas }));
  app.use('/api/horarios', horarioRoutes({ controller: createHorarioController(services.horarios), ...protegidas }));
  app.use('/api/aulas', aulaRoutes({ controller: createAulaController(services.aulas), ...protegidas }));

  app.use(notFound);
  app.use(createErrorHandler({ logger }));
  return app;
}
