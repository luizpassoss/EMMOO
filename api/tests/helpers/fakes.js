import { createMemoryRepositories } from '../../src/infra/memory/memoryRepositories.js';
import { seedMemoria } from '../../src/infra/memory/seed.js';
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

/**
 * Serviço de token falso no formato "token:<sub>:<papel>:<escola>[:<versão da sessão>]".
 * A escola é opcional (para testar tokens antigos); a versão só aparece quando não é 0.
 */
export const tokenServiceFake = {
  sign: (payload) => `token:${payload.sub}:${payload.papel}:${payload.escola}${payload.v ? `:${payload.v}` : ''}`,
  verify(token) {
    const [prefixo, sub, papel, escola, v] = String(token).split(':');
    if (prefixo !== 'token' || !sub || !papel) throw new UnauthorizedError('Sessão inválida ou expirada. Entre novamente.');
    return { sub, papel, escola, ...(v !== undefined && { v: Number(v) }) };
  },
};

/**
 * Repositórios em memória com a escola de demonstração já semeada.
 * `base` tem `escolas` e `paraEscola`; `repos` são os repositórios da escola EMMOO (os que os serviços usam).
 */
export async function reposDaEscolaDemo(opcoes) {
  const base = createMemoryRepositories();
  const { escola } = await seedMemoria(base, hasherFake, opcoes);
  return { base, escola, repos: base.paraEscola(escola.id) };
}

/** Aguarda a fila de microtarefas (útil para handlers assíncronos). */
export const aguardarTick = () => new Promise((resolve) => setImmediate(resolve));
