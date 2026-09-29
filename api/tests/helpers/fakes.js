import { UnauthorizedError } from '../../src/shared/errors.js';

/** Resposta HTTP falsa que registra status e corpo (para testar controllers e middlewares). */
export function criarRespostaFake() {
  return {
    statusCode: 200,
    body: undefined,
    finalizada: false,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(corpo) {
      this.body = corpo;
      this.finalizada = true;
      return this;
    },
    end() {
      this.finalizada = true;
      return this;
    },
  };
}

/** Hasher determinístico, sem custo de CPU do bcrypt. */
export const hasherFake = {
  hash: async (senha) => `hash:${senha}`,
  compare: async (senha, hash) => hash === `hash:${senha}`,
};

/** Serviço de token falso no formato "token:<sub>:<papel>". */
export const tokenServiceFake = {
  sign: (payload) => `token:${payload.sub}:${payload.papel}`,
  verify(token) {
    const [prefixo, sub, papel] = String(token).split(':');
    if (prefixo !== 'token' || !sub || !papel) throw new UnauthorizedError('Token inválido ou expirado.');
    return { sub, papel };
  },
};

/** Aguarda a fila de microtarefas (útil para handlers assíncronos). */
export const aguardarTick = () => new Promise((resolve) => setImmediate(resolve));
