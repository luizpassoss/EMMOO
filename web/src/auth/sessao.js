export const CHAVE_TOKEN = 'emmoo.token';
export const CHAVE_USUARIO = 'emmoo.usuario';

export function lerToken() {
  return localStorage.getItem(CHAVE_TOKEN);
}

export function lerUsuario() {
  const bruto = localStorage.getItem(CHAVE_USUARIO);
  if (!bruto) return null;
  try {
    return JSON.parse(bruto);
  } catch {
    return null;
  }
}

export function salvarSessao(token, usuario) {
  localStorage.setItem(CHAVE_TOKEN, token);
  localStorage.setItem(CHAVE_USUARIO, JSON.stringify(usuario));
}

export function limparSessao() {
  localStorage.removeItem(CHAVE_TOKEN);
  localStorage.removeItem(CHAVE_USUARIO);
}
