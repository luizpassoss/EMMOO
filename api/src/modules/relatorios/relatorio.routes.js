import express from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';

/** RF15 — relatórios da escola: só a coordenação (RN01). */
export function relatorioRoutes({ controller, authenticate, authorize }) {
  const router = express.Router();
  router.use(authenticate, authorize('coordenacao'));
  router.get('/mensal', asyncHandler(controller.mensal));
  router.get('/mensal/pdf', asyncHandler(controller.pdf));
  router.get('/mensal/csv', asyncHandler(controller.csv)); // planilha para a contabilidade
  return router;
}
