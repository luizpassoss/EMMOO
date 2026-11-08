import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { api as apiPadrao } from '../api/index.js';
import { lerToken, lerUsuario, limparSessao, salvarSessao } from './sessao.js';

export const AuthContext = createContext(null);

/** Mantém a sessão (token + usuário, com a escola) e expõe login/logout para a aplicação. */
export function AuthProvider({ children, api = apiPadrao }) {
  const [sessao, setSessao] = useState(() => ({ token: lerToken(), usuario: lerUsuario() }));

  /** Começa a sessão com um token já emitido pela API (login ou cadastro de escola). */
  const entrar = useCallback(({ token, usuario }) => {
    salvarSessao(token, usuario);
    setSessao({ token, usuario });
    return usuario;
  }, []);

  /** Entra numa escola (código) com o usuário ou o e-mail. */
  const login = useCallback(
    async (escola, identificador, senha) => entrar(await api.post('/auth/login', { escola, login: identificador, senha })),
    [api, entrar],
  );

  const logout = useCallback(() => {
    limparSessao();
    setSessao({ token: null, usuario: null });
  }, []);

  const valor = useMemo(
    () => ({
      token: sessao.token,
      usuario: sessao.usuario,
      autenticado: Boolean(sessao.token),
      login,
      entrar,
      logout,
    }),
    [sessao, login, entrar, logout],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error('useAuth deve ser usado dentro de <AuthProvider>.');
  return contexto;
}
