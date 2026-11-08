export const CHAVE_TOKEN = 'emmoo.token';
export const CHAVE_USUARIO = 'emmoo.usuario';
export const CHAVE_ESCOLA = 'emmoo.escola';

export function lerToken() {
  return localStorage.getItem(CHAVE_TOKEN);
}

function lerJson(chave) {
  const bruto = localStorage.getItem(chave);
  if (!bruto) return null;
  try {
    return JSON.parse(bruto);
  } catch {
    return null;
  }
}

export function lerUsuario() {
  return lerJson(CHAVE_USUARIO);
}

export function salvarSessao(token, usuario) {
  localStorage.setItem(CHAVE_TOKEN, token);
  localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
  if (usuario?.escola) lembrarEscola(usuario.escola);
}

/** Sair apaga a sessão, mas não a escola: no próximo login ela já vem preenchida. */
export function limparSessao() {
  localStorage.removeItem(CHAVE_TOKEN);
  localStorage.removeItem(CHAVE_USUARIO);
}

/** Última escola em que se entrou neste aparelho: { codigo, nome }. */
export function lerEscola() {
  const escola = lerJson(CHAVE_ESCOLA);
  return typeof escola?.codigo === 'string' && escola.codigo ? escola : null;
}

export function lembrarEscola({ codigo, nome }) {
  localStorage.setItem(CHAVE_ESCOLA, JSON.stringify({ codigo, nome: nome ?? null }));
}

export function esquecerEscola() {
  localStorage.removeItem(CHAVE_ESCOLA);
}
