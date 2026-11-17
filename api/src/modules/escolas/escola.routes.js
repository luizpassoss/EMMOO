import express from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';

/**
 * Rotas públicas: a tela de login pergunta se o cadastro está aberto, e quem não tem conta cadastra a escola —
 * conferindo antes, enquanto digita, se o código escolhido está livre (?codigo=).
 */
export function escolaRoutes({ controller }) {
  const router = express.Router();
  router.get('/configuracao', asyncHandler(controller.configuracao));
  router.get('/disponibilidade', asyncHandler(controller.disponibilidade));
  router.post('/', asyncHandler(controller.cadastrar));
  return router;
}
