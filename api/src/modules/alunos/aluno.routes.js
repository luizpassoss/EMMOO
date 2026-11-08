import express from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';

export function alunoRoutes({ controller, historico, authenticate, authorize }) {
  const router = express.Router();
  const gestao = authorize('coordenacao'); // RN01
  const leitura = authorize('coordenacao', 'professor');

  router.use(authenticate);
  router.get('/', leitura, asyncHandler(controller.listar));
  router.get('/:id', leitura, asyncHandler(controller.buscar));
  // RF14 — histórico: os três papéis; o serviço restringe (responsável: dependentes; professor: as próprias aulas).
  router.get('/:id/historico', asyncHandler(historico.doAluno));
  router.post('/', gestao, asyncHandler(controller.criar));
  router.put('/:id', gestao, asyncHandler(controller.atualizar));
  router.patch('/:id/inativar', gestao, asyncHandler(controller.inativar));
  router.patch('/:id/reativar', gestao, asyncHandler(controller.reativar));
  router.delete('/:id', gestao, asyncHandler(controller.excluir)); // exclusão permanente (só inativos)
  return router;
}
