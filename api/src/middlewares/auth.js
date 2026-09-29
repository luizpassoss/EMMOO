import { ForbiddenError, UnauthorizedError } from '../shared/errors.js';

/**
 * Middlewares de autenticação (JWT) e autorização por papel.
 * O tokenService é injetado para manter o middleware testável sem a biblioteca JWT.
 */
export function createAuthMiddleware(tokenService) {
  function authenticate(req, res, next) {
    const [esquema, token] = (req.headers?.authorization ?? '').split(' ');
    if (esquema?.toLowerCase() !== 'bearer' || !token) {
      return next(new UnauthorizedError('Token de acesso ausente.'));
    }
    try {
      const payload = tokenService.verify(token);
      req.usuario = { id: Number(payload.sub), papel: payload.papel };
      return next();
    } catch (err) {
      return next(err);
    }
  }

  /** Permite o acesso apenas aos papéis informados (ex.: authorize('coordenacao')). */
  function authorize(...papeis) {
    return function authorizeMiddleware(req, res, next) {
      if (!req.usuario) return next(new UnauthorizedError());
      if (!papeis.includes(req.usuario.papel)) return next(new ForbiddenError());
      return next();
    };
  }

  return { authenticate, authorize };
}
