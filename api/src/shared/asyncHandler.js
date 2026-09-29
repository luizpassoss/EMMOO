/**
 * Encaminha erros de handlers assíncronos (e síncronos) para o middleware de erro.
 * Necessário no Express 4, que não captura Promises rejeitadas automaticamente.
 */
export function asyncHandler(handler) {
  return function asyncHandlerWrapper(req, res, next) {
    Promise.resolve()
      .then(() => handler(req, res, next))
      .catch(next);
  };
}
