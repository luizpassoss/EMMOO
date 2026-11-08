import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../../shared/errors.js';

/** Emissão e validação de tokens JWT (RNF03). */
export function createTokenService({ secret, expiresIn = '8h' }) {
  if (!secret) throw new Error('O segredo do JWT é obrigatório.');
  return {
    sign: (payload) => jwt.sign(payload, secret, { expiresIn }),
    verify(token) {
      try {
        return jwt.verify(token, secret);
      } catch {
        throw new UnauthorizedError('Sessão inválida ou expirada. Entre novamente.');
      }
    },
  };
}
