import express from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';

export function horarioRoutes({ controller, authenticate, authorize }) {
  const router = express.Router();
  const agenda = authorize('coordenacao', 'professor'); // RN01/RN02
  router.use(authenticate);
  router.get('/', agenda, asyncHandler(controller.listar));
  // RF05 — o responsável também vê as vagas (do professor dos seus dependentes, conferido no serviço).
  router.get('/livres', authorize('coordenacao', 'professor', 'responsavel'), asyncHandler(controller.livres));
  router.post('/', agenda, asyncHandler(controller.criar));
  router.post('/grade', agenda, asyncHandler(controller.criarGrade)); // vários dias e horários de uma vez
  router.delete('/:id', agenda, asyncHandler(controller.remover));
  return router;
}
