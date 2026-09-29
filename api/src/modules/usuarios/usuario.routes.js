import express from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';

export function usuarioRoutes({ controller, authenticate, authorize }) {
  const router = express.Router();
  router.use(authenticate);
  router.get('/', authorize('coordenacao'), asyncHandler(controller.listar)); // RN01
  return router;
}
