import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { api as apiPadrao } from '../api/index.js';
import { lerToken, lerUsuario, limparSessao, salvarSessao } from './sessao.js';

export const AuthContext = createContext(null);

/** Mantém a sessão (token + usuário) e expõe login/logout para a aplicação. */
export function AuthProvider({ children, api = apiPadrao }) {
  const [sessao, setSessao] = useState(() => ({ token: lerToken(), usuario: lerUsuario() }));

  const login = useCallback(
    async (email, senha) => {
      const { token, usuario } = await api.post('/auth/login', { email, senha });
      salvarSessao(token, usuario);
      setSessao({ token, usuario });
      return usuario;
    },
    [api],
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
      logout,
    }),
    [sessao, login, logout],
  );

  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const contexto = useContext(AuthContext);
  if (!contexto) throw new Error('useAuth deve ser usado dentro de <AuthProvider>.');
  return contexto;
}
