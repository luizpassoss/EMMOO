import express from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';

/** RF07 — o responsável (dos próprios dependentes, RN03) e a coordenação pedem reposições. */
export function reposicaoRoutes({ controller, authenticate, authorize }) {
  const router = express.Router();
  router.use(authenticate, authorize('coordenacao', 'responsavel'));
  router.get('/disponiveis', asyncHandler(controller.disponiveis));
  router.get('/:aulaId/vagas', asyncHandler(controller.vagas));
  router.post('/', asyncHandler(controller.solicitar));
  return router;
}
