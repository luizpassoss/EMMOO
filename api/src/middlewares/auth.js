import { ForbiddenError, UnauthorizedError } from '../shared/errors.js';

/**
 * Middlewares de autenticação (JWT) e autorização por papel.
 * O tokenService é injetado para manter o middleware testável sem a biblioteca JWT.
 *
 * Multi-tenant: o token carrega a escola. `authenticate` põe em `req.servicos` os serviços DAQUELA escola
 * (via `servicosDaEscola`), e os controllers só usam esses — nunca há como chegar a outra escola.
 *
 * `verificarSessao` confere no banco se a sessão ainda vale (usuário ativo, mesma versão de sessão):
 * assim, desativar um acesso encerra na hora a sessão aberta, sem esperar o token expirar.
 * O perfil usado é o atual do banco, não o que estava no token.
 */
export function createAuthMiddleware(tokenService, { servicosDaEscola, verificarSessao } = {}) {
  async function authenticate(req, res, next) {
    const [esquema, token] = (req.headers?.authorization ?? '').split(' ');
    if (esquema?.toLowerCase() !== 'bearer' || !token) {
      return next(new UnauthorizedError('Entre no sistema para continuar.'));
    }
    try {
      const payload = tokenService.verify(token);
      const escolaId = Number(payload.escola);
      // Token de antes do multi-tenant (sem escola): pede para entrar de novo.
      if (!Number.isInteger(escolaId) || escolaId <= 0) {
        return next(new UnauthorizedError('Sessão expirada. Entre novamente.'));
      }
      const id = Number(payload.sub);
      let papel = payload.papel;
      if (verificarSessao) {
        const usuario = await verificarSessao({ usuarioId: id, escolaId, versao: Number(payload.v ?? 0) });
        if (!usuario) return next(new UnauthorizedError('Sessão encerrada. Entre novamente.'));
        papel = usuario.papel;
      }
      req.usuario = { id, papel, escolaId };
      if (servicosDaEscola) req.servicos = servicosDaEscola(escolaId);
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
