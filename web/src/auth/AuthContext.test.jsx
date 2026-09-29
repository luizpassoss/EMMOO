import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import { CHAVE_TOKEN, CHAVE_USUARIO } from './sessao.js';

function Consumidor() {
  const { autenticado, usuario, login, logout } = useAuth();
  return (
    <div>
      <p>{autenticado ? `Logado: ${usuario.nome}` : 'Deslogado'}</p>
      <button type="button" onClick={() => login('a@a.com', '123')}>
        entrar
      </button>
      <button type="button" onClick={logout}>
        sair
      </button>
    </div>
  );
}

describe('AuthProvider', () => {
  it('faz login, persiste a sessão e faz logout', async () => {
    const api = { post: vi.fn().mockResolvedValue({ token: 'tk', usuario: { id: 1, nome: 'Lucimara' } }) };
    render(
      <AuthProvider api={api}>
        <Consumidor />
      </AuthProvider>,
    );
    expect(screen.getByText('Deslogado')).toBeInTheDocument();

    fireEvent.click(screen.getByText('entrar'));
    expect(await screen.findByText('Logado: Lucimara')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'a@a.com', senha: '123' });
    expect(localStorage.getItem(CHAVE_TOKEN)).toBe('tk');

    fireEvent.click(screen.getByText('sair'));
    expect(await screen.findByText('Deslogado')).toBeInTheDocument();
    expect(localStorage.getItem(CHAVE_TOKEN)).toBeNull();
  });

  it('restaura a sessão salva e ignora dado corrompido', () => {
    localStorage.setItem(CHAVE_TOKEN, 'tk');
    localStorage.setItem(CHAVE_USUARIO, JSON.stringify({ nome: 'Luiz' }));
    const { unmount } = render(
      <AuthProvider api={{ post: vi.fn() }}>
        <Consumidor />
      </AuthProvider>,
    );
    expect(screen.getByText('Logado: Luiz')).toBeInTheDocument();
    unmount();

    localStorage.setItem(CHAVE_USUARIO, '{corrompido');
    localStorage.removeItem(CHAVE_TOKEN);
    render(
      <AuthProvider api={{ post: vi.fn() }}>
        <Consumidor />
      </AuthProvider>,
    );
    expect(screen.getByText('Deslogado')).toBeInTheDocument();
  });
});
