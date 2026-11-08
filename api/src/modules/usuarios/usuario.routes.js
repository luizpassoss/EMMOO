import express from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';

/** Só a coordenação gerencia os usuários da própria escola (RN01). */
export function usuarioRoutes({ controller, authenticate, authorize }) {
  const router = express.Router();
  router.use(authenticate, authorize('coordenacao'));
  router.get('/', asyncHandler(controller.listar));
  router.post('/', asyncHandler(controller.criar));
  router.put('/:id', asyncHandler(controller.atualizar));
  router.patch('/:id/desativar', asyncHandler(controller.desativar));
  router.patch('/:id/reativar', asyncHandler(controller.reativar));
  return router;
}
