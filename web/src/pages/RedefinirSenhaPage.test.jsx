import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { ApiError } from '../api/client.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import RedefinirSenhaPage from './RedefinirSenhaPage.jsx';

vi.mock('../api/index.js', () => ({ api: { post: vi.fn() } }));

const TOKEN = 'a'.repeat(43);

function Login() {
  const { search } = useLocation();
  return <p>Login {search}</p>;
}

function renderizar(endereco = `/redefinir-senha?token=${TOKEN}`) {
  const logout = vi.fn();
  render(
    <AuthContext.Provider value={{ autenticado: false, logout }}>
      <MemoryRouter initialEntries={[endereco]}>
        <Routes>
          <Route path="/redefinir-senha" element={<RedefinirSenhaPage />} />
          <Route path="/recuperar-senha" element={<p>Pedir link</p>} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return logout;
}

const preencher = (senha, confirmacao = senha) => {
  fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: senha } });
  fireEvent.change(screen.getByLabelText('Repita a nova senha'), { target: { value: confirmacao } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar senha nova' }));
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('RedefinirSenhaPage', () => {
  it('cria a senha nova com o link e volta ao login com a escola preenchida', async () => {
    api.post.mockResolvedValue({ mensagem: 'Senha redefinida.', escola: 'emmoo' });
    const logout = renderizar();
    preencher('violao2026');
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/auth/redefinir', { token: TOKEN, novaSenha: 'violao2026' }));
    expect(await screen.findByText('Login ?escola=emmoo&senha=redefinida')).toBeInTheDocument();
    expect(logout).toHaveBeenCalled();
  });

  it('confere a senha antes de enviar', () => {
    renderizar();
    preencher('123');
    expect(screen.getByRole('alert')).toHaveTextContent('A nova senha precisa ter pelo menos 6 caracteres.');
    preencher('violao2026', 'violao2025');
    expect(screen.getByRole('alert')).toHaveTextContent('As duas senhas não são iguais.');
    expect(api.post).not.toHaveBeenCalled();
  });

  it('link inválido ou expirado: explica e oferece pedir outro', async () => {
    const mensagem = 'Este link de redefinição é inválido ou já expirou. Peça um novo em "Esqueci minha senha".';
    api.post.mockRejectedValue(new ApiError(400, mensagem, [{ campo: 'token', mensagem }]));
    renderizar();
    preencher('violao2026');
    expect(await screen.findByRole('alert')).toHaveTextContent('inválido ou já expirou');
    expect(screen.queryByLabelText('Nova senha')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Pedir um link novo' }));
    expect(screen.getByText('Pedir link')).toBeInTheDocument();
  });

  it('erro sem ser do link (ex.: muitas tentativas) mantém o formulário', async () => {
    api.post.mockRejectedValue(new ApiError(429, 'Muitas tentativas. Tente novamente em 15 minutos.'));
    renderizar();
    preencher('violao2026');
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas.');
    expect(screen.getByLabelText('Nova senha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar senha nova' })).toBeEnabled();
  });

  it('sem o token no endereço, nem mostra o formulário', () => {
    renderizar('/redefinir-senha');
    expect(screen.getByRole('alert')).toHaveTextContent('Este link está incompleto.');
    expect(screen.getByRole('link', { name: 'Pedir um link novo' })).toBeInTheDocument();
  });

  it('mostra e oculta as senhas', () => {
    renderizar();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(screen.getByLabelText('Nova senha')).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Repita a nova senha')).toHaveAttribute('type', 'text');
  });
});
