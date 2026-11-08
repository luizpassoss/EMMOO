import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from './AuthContext.jsx';
import { CHAVE_ESCOLA, CHAVE_TOKEN, CHAVE_USUARIO, esquecerEscola, lerEscola } from './sessao.js';

const ESCOLA = { id: 1, nome: 'Escola de Música EMMOO', codigo: 'emmoo' };

function Consumidor() {
  const { autenticado, usuario, login, entrar, logout } = useAuth();
  return (
    <div>
      <p>{autenticado ? `Logado: ${usuario.nome}` : 'Deslogado'}</p>
      <button type="button" onClick={() => login('emmoo', 'admin', 'admin')}>
        entrar
      </button>
      <button type="button" onClick={() => entrar({ token: 'tk2', usuario: { id: 9, nome: 'Rita', escola: { codigo: 'sol', nome: 'Sol' } } })}>
        sessao pronta
      </button>
      <button type="button" onClick={logout}>
        sair
      </button>
    </div>
  );
}

describe('AuthProvider', () => {
  it('entra na escola, persiste a sessão e lembra a escola mesmo depois de sair', async () => {
    const api = { post: vi.fn().mockResolvedValue({ token: 'tk', usuario: { id: 1, nome: 'Lucimara', escola: ESCOLA } }) };
    render(
      <AuthProvider api={api}>
        <Consumidor />
      </AuthProvider>,
    );
    expect(screen.getByText('Deslogado')).toBeInTheDocument();

    fireEvent.click(screen.getByText('entrar'));
    expect(await screen.findByText('Logado: Lucimara')).toBeInTheDocument();
    expect(api.post).toHaveBeenCalledWith('/auth/login', { escola: 'emmoo', login: 'admin', senha: 'admin' });
    expect(localStorage.getItem(CHAVE_TOKEN)).toBe('tk');

    fireEvent.click(screen.getByText('sair'));
    expect(await screen.findByText('Deslogado')).toBeInTheDocument();
    expect(localStorage.getItem(CHAVE_TOKEN)).toBeNull();
    expect(lerEscola()).toEqual({ codigo: 'emmoo', nome: 'Escola de Música EMMOO' });
  });

  it('começa a sessão com um token já emitido (cadastro de escola)', async () => {
    render(
      <AuthProvider api={{ post: vi.fn() }}>
        <Consumidor />
      </AuthProvider>,
    );
    fireEvent.click(screen.getByText('sessao pronta'));
    expect(await screen.findByText('Logado: Rita')).toBeInTheDocument();
    expect(localStorage.getItem(CHAVE_TOKEN)).toBe('tk2');
    expect(lerEscola()).toEqual({ codigo: 'sol', nome: 'Sol' });
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

  it('escola lembrada: ignora registro inválido e pode ser esquecida', () => {
    localStorage.setItem(CHAVE_ESCOLA, '{"nome":"sem código"}');
    expect(lerEscola()).toBeNull();
    localStorage.setItem(CHAVE_ESCOLA, '{corrompido');
    expect(lerEscola()).toBeNull();
    localStorage.setItem(CHAVE_ESCOLA, '{"codigo":"sol"}');
    expect(lerEscola()).toEqual({ codigo: 'sol' });
    esquecerEscola();
    expect(lerEscola()).toBeNull();
  });
});
