import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { ApiError } from '../api/client.js';
import { lembrarEscola } from '../auth/sessao.js';
import RecuperarSenhaPage from './RecuperarSenhaPage.jsx';

vi.mock('../api/index.js', () => ({ api: { post: vi.fn() } }));

function renderizar(endereco = '/recuperar-senha') {
  return render(
    <MemoryRouter initialEntries={[endereco]}>
      <Routes>
        <Route path="/recuperar-senha" element={<RecuperarSenhaPage />} />
        <Route path="/login" element={<p>Tela de login</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('RecuperarSenhaPage', () => {
  it('pede o link com a escola e o usuário e mostra a resposta da API (a mesma para todos)', async () => {
    api.post.mockResolvedValue({ mensagem: 'Se a escola e o usuário estiverem certos, enviamos um link para o e-mail cadastrado.' });
    renderizar('/recuperar-senha?escola=emmoo');
    expect(screen.getByLabelText('Escola')).toHaveValue('emmoo');
    fireEvent.change(screen.getByLabelText('Usuário ou e-mail'), { target: { value: ' luiz ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/auth/esqueci', { escola: 'emmoo', login: 'luiz' }));
    expect(await screen.findByRole('status')).toHaveTextContent('enviamos um link para o e-mail cadastrado');
    fireEvent.click(screen.getByRole('link', { name: 'Voltar para o login' }));
    expect(screen.getByText('Tela de login')).toBeInTheDocument();
  });

  it('sem escola no link, usa a última deste aparelho; mostra os erros da API', async () => {
    lembrarEscola({ codigo: 'sol', nome: 'Escola Sol' });
    api.post.mockRejectedValue(new ApiError(400, 'Dados inválidos.', [{ campo: 'login', mensagem: 'Informe o usuário ou e-mail.' }]));
    renderizar();
    expect(screen.getByLabelText('Escola')).toHaveValue('sol');
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o usuário ou e-mail.');
    api.post.mockRejectedValue(new ApiError(429, 'Muitas tentativas. Tente novamente em 15 minutos.'));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar link' }));
    expect(await screen.findByText('Muitas tentativas. Tente novamente em 15 minutos.')).toBeInTheDocument();
  });
});
