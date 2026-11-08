import express from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';

/** RF13 — cada papel recebe os indicadores da sua parte (decidido no serviço). */
export function indicadorRoutes({ controller, authenticate }) {
  const router = express.Router();
  router.use(authenticate);
  router.get('/', asyncHandler(controller.doUsuario));
  return router;
}
