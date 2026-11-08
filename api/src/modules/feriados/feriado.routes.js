import express from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';

/** Todos veem os dias sem aula na agenda; só a coordenação cadastra e remove (à mão ou os nacionais do ano). */
export function feriadoRoutes({ controller, authenticate, authorize }) {
  const router = express.Router();
  const coordenacao = authorize('coordenacao');
  router.use(authenticate);
  router.get('/', asyncHandler(controller.listar));
  router.post('/', coordenacao, asyncHandler(controller.criar));
  router.get('/nacionais', coordenacao, asyncHandler(controller.nacionais));
  router.post('/nacionais', coordenacao, asyncHandler(controller.cadastrarNacionais));
  router.delete('/:id', coordenacao, asyncHandler(controller.remover));
  return router;
}
