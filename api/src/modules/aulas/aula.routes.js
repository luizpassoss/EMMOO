import express from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';

export function aulaRoutes({ controller, authenticate, authorize }) {
  const router = express.Router();
  router.use(authenticate);
  router.get('/', asyncHandler(controller.listar)); // cada papel vê só a sua parte (filtro no serviço)
  router.post('/', authorize('coordenacao'), asyncHandler(controller.agendar)); // RN01
  router.patch('/:id/cancelar', authorize('coordenacao', 'professor'), asyncHandler(controller.cancelar));
  return router;
}
