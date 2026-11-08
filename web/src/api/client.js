/** Erro de API com status HTTP e detalhes de validação (quando houver). */
export class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/** Nome do arquivo indicado pela API no Content-Disposition ('attachment; filename="recibo.pdf"'). */
function nomeDoArquivo(resposta) {
  const disposicao = resposta.headers?.get?.('Content-Disposition') ?? '';
  return /filename="?([^";]+)"?/i.exec(disposicao)?.[1] ?? null;
}

/**
 * Cliente HTTP da API. Dependências injetáveis (token, fetch) para facilitar os testes.
 * Espera respostas no formato de erro { error: { message, details } }.
 */
export function createApiClient({ baseUrl = '/api', getToken = () => null, onUnauthorized, fetchImpl } = {}) {
  const executarFetch = fetchImpl ?? ((...args) => globalThis.fetch(...args));

  async function enviar(metodo, caminho, { corpo, aceita = 'application/json' } = {}) {
    const token = getToken();
    const headers = { Accept: aceita };
    if (corpo !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;

    let resposta;
    try {
      resposta = await executarFetch(`${baseUrl}${caminho}`, {
        method: metodo,
        headers,
        body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      });
    } catch {
      throw new ApiError(0, 'Não foi possível conectar ao servidor.');
    }
    if (!resposta.ok) await lancarErro(resposta, token);
    return resposta;
  }

  async function lerJson(resposta) {
    const texto = await resposta.text();
    if (!texto) return null;
    try {
      return JSON.parse(texto);
    } catch {
      return null;
    }
  }

  async function lancarErro(resposta, token) {
    const dados = await lerJson(resposta);
    // Sessão expirada: só reage se havia token (falha de login não deve redirecionar).
    if (resposta.status === 401 && token && onUnauthorized) onUnauthorized();
    const erro = dados?.error;
    // 5xx sem corpo da API (ex.: proxy sem resposta): mensagem legível em vez de "Erro 502".
    const padrao = resposta.status >= 500 ? 'O servidor não respondeu. Tente novamente em instantes.' : `Erro ${resposta.status}`;
    throw new ApiError(resposta.status, erro?.message ?? padrao, erro?.details ?? null);
  }

  const requisitar = async (metodo, caminho, corpo) => lerJson(await enviar(metodo, caminho, { corpo }));

  return {
    get: (caminho) => requisitar('GET', caminho),
    post: (caminho, corpo = {}) => requisitar('POST', caminho, corpo),
    put: (caminho, corpo = {}) => requisitar('PUT', caminho, corpo),
    patch: (caminho, corpo = {}) => requisitar('PATCH', caminho, corpo),
    delete: (caminho) => requisitar('DELETE', caminho),
    /** Arquivo da API (PDF do recibo, planilha CSV), com a sessão: devolve o conteúdo e o nome sugerido. */
    async baixar(caminho, aceita = 'application/pdf, application/json') {
      const resposta = await enviar('GET', caminho, { aceita });
      return { conteudo: await resposta.blob(), arquivo: nomeDoArquivo(resposta) };
    },
  };
}
