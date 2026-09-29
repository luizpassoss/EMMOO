import express from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';

export function planoRoutes({ controller, authenticate, authorize }) {
  const router = express.Router();
  router.use(authenticate);
  router.get('/', asyncHandler(controller.listar));
  router.post('/', authorize('coordenacao'), asyncHandler(controller.criar)); // RN01
  return router;
}
