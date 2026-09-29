import express from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';

export function alunoRoutes({ controller, authenticate, authorize }) {
  const router = express.Router();
  const gestao = authorize('coordenacao'); // RN01
  const leitura = authorize('coordenacao', 'professor');

  router.use(authenticate);
  router.get('/', leitura, asyncHandler(controller.listar));
  router.get('/:id', leitura, asyncHandler(controller.buscar));
  router.post('/', gestao, asyncHandler(controller.criar));
  router.put('/:id', gestao, asyncHandler(controller.atualizar));
  router.patch('/:id/inativar', gestao, asyncHandler(controller.inativar));
  router.patch('/:id/reativar', gestao, asyncHandler(controller.reativar));
  return router;
}
