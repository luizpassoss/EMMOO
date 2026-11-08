/**
 * Erros de aplicação com status HTTP associado.
 * O middleware de erro converte estas classes em respostas JSON padronizadas:
 * { "error": { "code": "...", "message": "...", "details": [...] } }
 */
export class AppError extends Error {
  constructor(message, { status = 500, code = 'INTERNAL_ERROR', details } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }
}

export class ValidationError extends AppError {
  /** @param {{ campo: string, mensagem: string }[]} details */
  constructor(details, message = 'Dados inválidos.') {
    super(message, { status: 400, code: 'VALIDATION_ERROR', details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Não autenticado.') {
    super(message, { status: 401, code: 'UNAUTHORIZED' });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado para este perfil.') {
    super(message, { status: 403, code: 'FORBIDDEN' });
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado.') {
    super(message, { status: 404, code: 'NOT_FOUND' });
  }
}

/** Muitas tentativas em pouco tempo (ex.: senha errada repetidas vezes): espere antes de tentar de novo. */
export class TooManyRequestsError extends AppError {
  constructor(message = 'Muitas tentativas. Tente novamente em alguns minutos.') {
    super(message, { status: 429, code: 'TOO_MANY_REQUESTS' });
  }
}

export class ConflictError extends AppError {
  /** @param {{ campo: string, mensagem: string }[]} [details] */
  constructor(message = 'Conflito com o estado atual do recurso.', details) {
    super(message, { status: 409, code: 'CONFLICT', details });
  }
}
