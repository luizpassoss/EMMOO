import { lerToken, limparSessao } from '../auth/sessao.js';
import { createApiClient } from './client.js';

/** Instância única do cliente de API usada pelas páginas. */
export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? '/api',
  getToken: lerToken,
  // Sessão que deixou de valer (expirou ou o acesso foi desativado): volta ao login dizendo por quê.
  onUnauthorized: () => {
    limparSessao();
    window.location.assign('/login?sessao=encerrada');
  },
});
