import { AppError } from '../shared/errors.js';

// Banco fora do ar (ex.: MySQL desligado): o Prisma lança erro de inicialização ou os códigos P1001/P1002/P1017.
const CODIGOS_BANCO_INDISPONIVEL = ['P1001', 'P1002', 'P1017'];
function bancoIndisponivel(err) {
  return err?.name === 'PrismaClientInitializationError' || CODIGOS_BANCO_INDISPONIVEL.includes(err?.code);
}

/** Resposta padrão para rotas inexistentes. */
export function notFound(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } });
}

/**
 * Converte erros em respostas JSON padronizadas.
 * O Express reconhece middlewares de erro pela assinatura com 4 parâmetros.
 */
export function createErrorHandler({ logger = console } = {}) {
  return function errorHandler(err, req, res, _next) {
    if (err instanceof AppError) {
      const body = { error: { code: err.code, message: err.message } };
      if (err.details) body.error.details = err.details;
      return res.status(err.status).json(body);
    }
    if (err?.type === 'entity.parse.failed') {
      return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'JSON inválido no corpo da requisição.' } });
    }
    const status = Number(err?.status ?? err?.statusCode);
    if (Number.isInteger(status) && status >= 400 && status < 500) {
      return res.status(status).json({ error: { code: 'BAD_REQUEST', message: 'Requisição inválida.' } });
    }
    logger.error(err);
    if (bancoIndisponivel(err)) {
      return res.status(503).json({
        error: { code: 'DATABASE_UNAVAILABLE', message: 'Banco de dados indisponível. Tente novamente em instantes.' },
      });
    }
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Erro interno do servidor.' } });
  };
}
