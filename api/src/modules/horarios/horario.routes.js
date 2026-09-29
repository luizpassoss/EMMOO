import express from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';

export function horarioRoutes({ controller, authenticate, authorize }) {
  const router = express.Router();
  router.use(authenticate, authorize('coordenacao', 'professor')); // RN01/RN02
  router.get('/', asyncHandler(controller.listar));
  router.get('/livres', asyncHandler(controller.livres));
  router.post('/', asyncHandler(controller.criar));
  router.delete('/:id', asyncHandler(controller.remover));
  return router;
}
