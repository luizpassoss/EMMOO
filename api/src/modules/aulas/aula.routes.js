import express from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';

export function aulaRoutes({ controller, authenticate, authorize }) {
  const router = express.Router();
  const escola = authorize('coordenacao', 'professor'); // RN02: o professor, nas próprias aulas (serviço)
  const familia = authorize('coordenacao', 'responsavel'); // RN03: o responsável, nas dos dependentes (serviço)
  router.use(authenticate);
  router.get('/', asyncHandler(controller.listar)); // cada papel vê só a sua parte (filtro no serviço)
  router.get('/:id', asyncHandler(controller.detalhe));
  router.post('/', authorize('coordenacao'), asyncHandler(controller.agendar)); // RN01
  router.patch('/:id/cancelar', escola, asyncHandler(controller.cancelar));
  router.patch('/:id/remarcar', escola, asyncHandler(controller.remarcar)); // nova data e horário, mesma aula
  router.post('/:id/falta', familia, asyncHandler(controller.avisarFalta)); // RF06
  router.patch('/:id/presenca', escola, asyncHandler(controller.registrarPresenca)); // RF08
  router.put('/:id/diario', escola, asyncHandler(controller.salvarDiario)); // RF09
  return router;
}
