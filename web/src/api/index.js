import { lerToken, limparSessao } from '../auth/sessao.js';
import { createApiClient } from './client.js';

/** Instância única do cliente de API usada pelas páginas. */
export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? '/api',
  getToken: lerToken,
  onUnauthorized: () => {
    limparSessao();
    window.location.assign('/login');
  },
});
