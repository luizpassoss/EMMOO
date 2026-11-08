import express from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';

/** Dados da própria escola (nome e Pix): só a coordenação (RN01). */
export function dadosEscolaRoutes({ controller, authenticate, authorize }) {
  const router = express.Router();
  router.use(authenticate, authorize('coordenacao'));
  router.get('/', asyncHandler(controller.ver));
  router.put('/', asyncHandler(controller.atualizar));
  return router;
}
