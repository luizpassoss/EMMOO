import express from 'express';
import { asyncHandler } from '../../shared/asyncHandler.js';

export function authRoutes({ controller, authenticate }) {
  const router = express.Router();
  router.post('/login', asyncHandler(controller.login));
  router.get('/me', authenticate, asyncHandler(controller.perfil));
  return router;
}
