import express from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';

/**
 * RF10–RF12 e RF15. A coordenação cuida de tudo; o responsável consulta as dos dependentes, paga pelo Pix
 * da escola e baixa o recibo.
 */
export function mensalidadeRoutes({ controller, authenticate, authorize }) {
  const router = express.Router();
  const coordenacao = authorize('coordenacao');
  const familia = authorize('coordenacao', 'responsavel');
  router.use(authenticate);
  router.get('/', familia, asyncHandler(controller.listar));
  router.get('/pagamentos', familia, asyncHandler(controller.pagamentos)); // histórico
  router.post('/gerar', coordenacao, asyncHandler(controller.gerar));
  router.get('/alertas', coordenacao, asyncHandler(controller.alertas));
  router.post('/alertas/enviar', coordenacao, asyncHandler(controller.enviarAlertas));
  router.patch('/:id/pagamento', coordenacao, asyncHandler(controller.registrarPagamento));
  router.delete('/:id/pagamento', coordenacao, asyncHandler(controller.desfazerPagamento));
  router.patch('/:id/valor', coordenacao, asyncHandler(controller.ajustarValor)); // desconto, bolsa, correção
  router.patch('/:id/cancelar', coordenacao, asyncHandler(controller.cancelar));
  router.patch('/:id/reabrir', coordenacao, asyncHandler(controller.reabrir));
  router.get('/:id/pix', familia, asyncHandler(controller.pix));
  router.get('/:id/recibo', familia, asyncHandler(controller.recibo));
  return router;
}
