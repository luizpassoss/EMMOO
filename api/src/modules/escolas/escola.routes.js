import express from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';

/** Rotas públicas: a tela de login pergunta se o cadastro está aberto, e quem não tem conta cadastra a escola. */
export function escolaRoutes({ controller }) {
  const router = express.Router();
  router.get('/configuracao', asyncHandler(controller.configuracao));
  router.post('/', asyncHandler(controller.cadastrar));
  return router;
}
