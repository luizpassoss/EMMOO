import { describe, expect, it, vi } from 'vitest';
import { ApiError, createApiClient } from './client.js';

function respostaFake(status, corpo) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (corpo === undefined ? '' : typeof corpo === 'string' ? corpo : JSON.stringify(corpo)),
  };
}

describe('cliente da API', () => {
  it('envia token e corpo JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respostaFake(201, { id: 1 }));
    const api = createApiClient({ baseUrl: '/api', getToken: () => 'tk', fetchImpl });
    await expect(api.post('/alunos', { nome: 'Ana' })).resolves.toEqual({ id: 1 });
    expect(fetchImpl).toHaveBeenCalledWith('/api/alunos', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: 'Bearer tk' },
      body: JSON.stringify({ nome: 'Ana' }),
    });
  });

  it('faz GET sem corpo nem token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respostaFake(200, [1, 2]));
    const api = createApiClient({ fetchImpl });
    await expect(api.get('/planos')).resolves.toEqual([1, 2]);
    expect(fetchImpl.mock.calls[0][1]).toEqual({ method: 'GET', headers: { Accept: 'application/json' }, body: undefined });
  });

  it('converte erro da API em ApiError com detalhes', async () => {
    const detalhes = [{ campo: 'nome', mensagem: 'Obrigatório' }];
    const fetchImpl = vi.fn().mockResolvedValue(respostaFake(400, { error: { message: 'Dados inválidos.', details: detalhes } }));
    const api = createApiClient({ fetchImpl });
    const erro = await api.put('/alunos/1', {}).catch((e) => e);
    expect(erro).toBeInstanceOf(ApiError);
    expect(erro.status).toBe(400);
    expect(erro.details).toEqual(detalhes);
  });

  it('chama onUnauthorized apenas quando havia token', async () => {
    const onUnauthorized = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(respostaFake(401, 'não é json'));
    await createApiClient({ fetchImpl, onUnauthorized }).patch('/x').catch(() => {});
    expect(onUnauthorized).not.toHaveBeenCalled();
    const erro = await createApiClient({ fetchImpl, onUnauthorized, getToken: () => 'tk' }).get('/x').catch((e) => e);
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    expect(erro.message).toBe('Erro 401');
  });

  it('explica erro 5xx sem corpo da API e preserva a mensagem quando existe', async () => {
    const semCorpo = vi.fn().mockResolvedValue(respostaFake(502, '<html>Bad Gateway</html>'));
    const erro = await createApiClient({ fetchImpl: semCorpo }).get('/x').catch((e) => e);
    expect(erro.message).toBe('O servidor não respondeu. Tente novamente em instantes.');

    const comCorpo = vi.fn().mockResolvedValue(respostaFake(503, { error: { message: 'A API não está respondendo.' } }));
    const erroApi = await createApiClient({ fetchImpl: comCorpo }).get('/x').catch((e) => e);
    expect(erroApi.message).toBe('A API não está respondendo.');
  });

  it('informa falha de conexão', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const erro = await createApiClient({ fetchImpl }).get('/x').catch((e) => e);
    expect(erro.status).toBe(0);
    expect(erro.message).toMatch(/conectar/);
  });

  it('aceita resposta vazia (ex.: 204)', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respostaFake(204));
    await expect(createApiClient({ fetchImpl }).post('/x')).resolves.toBeNull();
  });

  it('faz DELETE sem corpo', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(respostaFake(204));
    await expect(createApiClient({ fetchImpl }).delete('/horarios/3')).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledWith('/api/horarios/3', {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
      body: undefined,
    });
  });
});
