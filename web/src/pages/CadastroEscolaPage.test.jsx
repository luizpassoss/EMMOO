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

  describe('código de acesso conferido enquanto se digita', () => {
    const EM_USO = 'Este código de escola já está em uso.';
    beforeEach(() => {
      api.get.mockImplementation(async (caminho) => {
        if (caminho === '/escolas/configuracao') return { cadastroDeEscolas: true };
        const codigo = new URLSearchParams(caminho.split('?')[1]).get('codigo');
        return codigo === 'emmoo' ? { codigo, disponivel: false, mensagem: EM_USO } : { codigo, disponivel: true };
      });
    });
    const campoCodigo = () => screen.getByLabelText('Código de acesso');

    it('o código sugerido pelo nome já é conferido; em uso, o aviso aparece no campo', async () => {
      renderizar();
      await screen.findByLabelText('Nome da escola');
      preencher('Nome da escola', 'Escola Sol');
      await waitFor(() => expect(campoCodigo()).toHaveAccessibleDescription('Código disponível.'));
      expect(api.get).toHaveBeenCalledWith('/escolas/disponibilidade?codigo=escola-sol');
      expect(screen.getByText('Código disponível.', { selector: '.sr-only' })).toBeInTheDocument(); // anunciado

      preencher('Código de acesso', ' EMMOO ');
      await waitFor(() => expect(campoCodigo()).toHaveAccessibleDescription(EM_USO));
      expect(campoCodigo()).toHaveAttribute('aria-invalid', 'true');
      expect(api.get).toHaveBeenCalledWith('/escolas/disponibilidade?codigo=emmoo');
    });

    it('código ainda fora do formato não é consultado (o envio explica a regra)', async () => {
      renderizar();
      await screen.findByLabelText('Código de acesso');
      preencher('Código de acesso', 'ab');
      await new Promise((resolve) => setTimeout(resolve, 500)); // passada a pausa da consulta
      expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/escolas/disponibilidade'));
      expect(campoCodigo()).not.toHaveAccessibleDescription();
    });

    it('o erro "já está em uso" do envio some quando o código muda', async () => {
      api.post.mockRejectedValueOnce({ status: 409, message: EM_USO });
      renderizar();
      await screen.findByLabelText('Código de acesso');
      fireEvent.click(screen.getByRole('button', { name: 'Cadastrar escola' }));
      await waitFor(() => expect(campoCodigo()).toHaveAccessibleDescription(EM_USO));
      preencher('Código de acesso', 'escola-lua');
      expect(campoCodigo()).not.toHaveAttribute('aria-invalid');
      await waitFor(() => expect(campoCodigo()).toHaveAccessibleDescription('Código disponível.'));
    });

    it('a resposta atrasada de um código anterior não vale para o atual', async () => {
      let responderAntiga;
      api.get.mockImplementation((caminho) => {
        if (caminho === '/escolas/configuracao') return Promise.resolve({ cadastroDeEscolas: true });
        if (caminho.endsWith('codigo=sol')) return new Promise((resolve) => (responderAntiga = resolve));
        return Promise.resolve({ codigo: 'lua', disponivel: true });
      });
      renderizar();
      await screen.findByLabelText('Código de acesso');
      preencher('Código de acesso', 'sol');
      await waitFor(() => expect(responderAntiga).toBeTypeOf('function'));
      preencher('Código de acesso', 'lua');
      await waitFor(() => expect(campoCodigo()).toHaveAccessibleDescription('Código disponível.'));
      responderAntiga({ codigo: 'sol', disponivel: false, mensagem: EM_USO });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(campoCodigo()).toHaveAccessibleDescription('Código disponível.');
    });
  });

  it('ícones de ajuda discretos explicam a escola, o código, o acesso e o usuário', async () => {
    renderizar();
    await screen.findByLabelText('Nome da escola');
    const ajudas = screen.getAllByRole('button', { name: /^Ajuda: / }).map((botao) => botao.getAttribute('aria-label'));
    expect(ajudas).toEqual(['Ajuda: Nome da escola', 'Ajuda: Código de acesso', 'Ajuda: Seu acesso', 'Ajuda: Usuário (opcional)']);
    fireEvent.click(screen.getByRole('button', { name: 'Ajuda: Código de acesso' }));
    expect(screen.getByText(/não pode ser alterado depois/)).toBeInTheDocument();
    const outra = screen.getByRole('button', { name: 'Ajuda: Seu acesso' });
    fireEvent.pointerDown(outra); // como no navegador: o toque em outro lugar fecha a anterior
    fireEvent.click(outra);
    expect(screen.queryByText(/não pode ser alterado depois/)).not.toBeInTheDocument();
    expect(screen.getByText(/Você entra como coordenação/)).toBeInTheDocument();
  });

  it('quem já está autenticado vai para o início', () => {
    renderizar({ autenticado: true, entrar: vi.fn() });
    expect(screen.getByText('Início')).toBeInTheDocument();
  });
});
