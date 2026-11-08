import express from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';

export function planoRoutes({ controller, authenticate, authorize }) {
  const router = express.Router();
  const gestao = authorize('coordenacao'); // RN01
  router.use(authenticate);
  router.get('/', asyncHandler(controller.listar));
  router.post('/', gestao, asyncHandler(controller.criar));
  router.put('/:id', gestao, asyncHandler(controller.atualizar));
  router.delete('/:id', gestao, asyncHandler(controller.excluir));
  return router;
}
