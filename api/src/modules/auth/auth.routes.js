import express from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';

/** Entrar, ver o próprio perfil, trocar a própria senha e recuperá-la por e-mail (sem sessão). */
export function authRoutes({ controller, authenticate }) {
  const router = express.Router();
  router.post('/login', asyncHandler(controller.login));
  router.get('/me', authenticate, asyncHandler(controller.perfil));
  router.put('/senha', authenticate, asyncHandler(controller.trocarSenha));
  router.post('/esqueci', asyncHandler(controller.esqueciSenha));
  router.post('/redefinir', asyncHandler(controller.redefinirSenha));
  return router;
}
