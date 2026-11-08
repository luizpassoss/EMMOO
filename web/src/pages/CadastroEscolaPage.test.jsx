import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import CadastroEscolaPage, { sugerirCodigo } from './CadastroEscolaPage.jsx';

vi.mock('../api/index.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));

function renderizar(auth = { autenticado: false, entrar: vi.fn() }) {
  render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={['/cadastro']}>
        <Routes>
          <Route path="/cadastro" element={<CadastroEscolaPage />} />
          <Route path="/login" element={<p>Tela de login</p>} />
          <Route path="/" element={<p>Início</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return auth;
}

const preencher = (rotulo, valor) => fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ cadastroDeEscolas: true });
});

describe('sugerirCodigo', () => {
  it('transforma o nome num código de acesso', () => {
    expect(sugerirCodigo('Escola de Música Sol')).toBe('escola-de-musica-sol');
    expect(sugerirCodigo('  Ação & Arte!  ')).toBe('acao-arte');
    expect(sugerirCodigo('a'.repeat(39) + ' b')).toBe('a'.repeat(39)); // até 40, sem hífen no fim
  });
});

describe('CadastroEscolaPage', () => {
  it('cadastra a escola e quem a coordena, e já entra', async () => {
    const sessao = { token: 'tk', usuario: { id: 1, nome: 'Rita' } };
    api.post.mockResolvedValue(sessao);
    const { entrar } = renderizar();
    await screen.findByLabelText('Nome da escola'); // depois de consultar se o cadastro está aberto
    preencher('Nome da escola', 'Escola Sol');
    expect(screen.getByLabelText('Código de acesso')).toHaveValue('escola-sol'); // acompanha o nome
    preencher('Código de acesso', 'Sol');
    preencher('Nome da escola', 'Escola Sol Nascente'); // depois de editado, o código não muda mais
    expect(screen.getByLabelText('Código de acesso')).toHaveValue('Sol');
    preencher('Seu nome', 'Rita');
    preencher('E-mail', 'rita@sol.com');
    preencher('Usuário (opcional)', 'admin');
    preencher('Senha', 'solsol');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar escola' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/escolas', {
        nomeEscola: 'Escola Sol Nascente',
        codigo: 'sol',
        nome: 'Rita',
        email: 'rita@sol.com',
        login: 'admin',
        senha: 'solsol',
      }),
    );
    expect(entrar).toHaveBeenCalledWith(sessao);
  });

  it('mostra os erros junto aos campos; código em uso vai para o campo do código', async () => {
    api.post.mockRejectedValueOnce({
      status: 400,
      message: 'Dados inválidos.',
      details: [
        { campo: 'nomeEscola', mensagem: 'Informe o nome da escola (mínimo 3 caracteres).' },
        { campo: 'senha', mensagem: 'A senha precisa ter pelo menos 6 caracteres.' },
      ],
    });
    api.post.mockRejectedValueOnce({ status: 409, message: 'Este código de escola já está em uso.' });
    renderizar();
    fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar escola' }));
    expect(await screen.findByText('Informe o nome da escola (mínimo 3 caracteres).')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByText('Mínimo de 6 caracteres.')).not.toBeInTheDocument(); // o erro substitui a dica

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar escola' }));
    expect(await screen.findByText('Este código de escola já está em uso.')).toBeInTheDocument();
    expect(screen.getByLabelText('Código de acesso')).toHaveAttribute('aria-invalid', 'true');
  });

  it('com o cadastro fechado, explica e leva de volta ao login', async () => {
    api.get.mockResolvedValue({ cadastroDeEscolas: false });
    renderizar();
    expect(await screen.findByText('Cadastro de escolas desativado.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cadastrar escola' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Entrar' }));
    expect(screen.getByText('Tela de login')).toBeInTheDocument();
  });

  it('se a API recusar (403), troca o formulário pelo aviso', async () => {
    api.get.mockRejectedValue(new Error('offline')); // sem a configuração, mostra o formulário
    api.post.mockRejectedValue({ status: 403, message: 'O cadastro de novas escolas está desativado.' });
    renderizar();
    fireEvent.click(await screen.findByRole('button', { name: 'Cadastrar escola' }));
    expect(await screen.findByText('Cadastro de escolas desativado.')).toBeInTheDocument();
  });

  it('quem já está autenticado vai para o início', () => {
    renderizar({ autenticado: true, entrar: vi.fn() });
    expect(screen.getByText('Início')).toBeInTheDocument();
  });
});
