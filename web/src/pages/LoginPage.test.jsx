import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import { lembrarEscola } from '../auth/sessao.js';
import LoginPage from './LoginPage.jsx';

vi.mock('../api/index.js', () => ({ api: { get: vi.fn() } }));

function renderizar(auth, endereco = '/login') {
  return render(
    <AuthContext.Provider value={auth}>
      <MemoryRouter initialEntries={[endereco]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={<p>Cadastro de escola</p>} />
          <Route path="/recuperar-senha" element={<p>Recuperar senha</p>} />
          <Route path="/" element={<p>Início</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

function preencher({ escola, login, senha }) {
  if (escola !== undefined) fireEvent.change(screen.getByLabelText('Escola'), { target: { value: escola } });
  fireEvent.change(screen.getByLabelText('Usuário ou e-mail'), { target: { value: login } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: senha } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ cadastroDeEscolas: false });
});

describe('LoginPage', () => {
  it('no primeiro acesso, pede a escola, o usuário e a senha', async () => {
    const login = vi.fn().mockResolvedValue({ nome: 'Lucimara' });
    renderizar({ autenticado: false, login });
    preencher({ escola: ' emmoo ', login: ' admin ', senha: 'admin' });
    await waitFor(() => expect(login).toHaveBeenCalledWith('emmoo', 'admin', 'admin'));
  });

  it('com a escola já conhecida, mostra só o nome dela e permite trocar', async () => {
    lembrarEscola({ codigo: 'emmoo', nome: 'Escola de Música EMMOO' });
    const login = vi.fn().mockResolvedValue({});
    renderizar({ autenticado: false, login });
    expect(screen.getByText('Escola de Música EMMOO')).toBeInTheDocument();
    expect(screen.queryByLabelText('Escola')).not.toBeInTheDocument();

    preencher({ login: 'luiz', senha: 'Luiz123' });
    await waitFor(() => expect(login).toHaveBeenCalledWith('emmoo', 'luiz', 'Luiz123'));

    fireEvent.click(screen.getByRole('button', { name: 'Trocar' }));
    expect(screen.getByLabelText('Escola')).toHaveValue('emmoo');
    expect(screen.getByLabelText('Escola')).toHaveFocus();
  });

  it('a escola pode vir no link (?escola=codigo)', async () => {
    lembrarEscola({ codigo: 'outra', nome: 'Outra Escola' });
    const login = vi.fn().mockResolvedValue({});
    renderizar({ autenticado: false, login }, '/login?escola=Sol');
    expect(screen.getByText('sol')).toBeInTheDocument(); // sem o nome, mostra o código
    preencher({ login: 'admin', senha: 'solsol' });
    await waitFor(() => expect(login).toHaveBeenCalledWith('sol', 'admin', 'solsol'));
  });

  it('mostra a mensagem de erro quando o login falha', async () => {
    const login = vi.fn().mockRejectedValue(new Error('Escola, usuário ou senha inválidos.'));
    renderizar({ autenticado: false, login });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escola, usuário ou senha inválidos.');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });

  it('diz quais campos faltam e reabre a escola quando é ela que falta', async () => {
    lembrarEscola({ codigo: 'emmoo', nome: 'EMMOO' });
    const login = vi.fn().mockRejectedValue({
      message: 'Dados inválidos.',
      details: [
        { campo: 'escola', mensagem: 'Informe o código da escola.' },
        { campo: 'senha', mensagem: 'Informe a senha.' },
      ],
    });
    renderizar({ autenticado: false, login });
    fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o código da escola. Informe a senha.');
    expect(screen.getByLabelText('Escola')).toBeInTheDocument();
  });

  it('mostra e oculta a senha', () => {
    renderizar({ autenticado: false, login: vi.fn() });
    const senha = screen.getByLabelText('Senha');
    expect(senha).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha' }));
    expect(senha).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar senha' }));
    expect(senha).toHaveAttribute('type', 'password');
  });

  it('oferece o cadastro de escola só quando a API permite', async () => {
    api.get.mockResolvedValue({ cadastroDeEscolas: true });
    renderizar({ autenticado: false, login: vi.fn() });
    expect(api.get).toHaveBeenCalledWith('/escolas/configuracao');
    fireEvent.click(await screen.findByRole('link', { name: 'Cadastrar escola' }));
    expect(screen.getByText('Cadastro de escola')).toBeInTheDocument();
  });

  it('sem a configuração (API fora do ar), o login segue sem o link de cadastro', async () => {
    api.get.mockRejectedValue(new Error('offline'));
    renderizar({ autenticado: false, login: vi.fn() });
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Cadastrar escola' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeInTheDocument();
  });

  it('redireciona quem já está autenticado', async () => {
    renderizar({ autenticado: true, login: vi.fn() });
    expect(await screen.findByText('Início')).toBeInTheDocument();
  });

  it('avisa quando a sessão terminou (expirou ou o acesso foi desativado)', async () => {
    const login = vi.fn().mockRejectedValue(new Error('Seu acesso foi desativado. Entre em contato com a coordenação da escola.'));
    renderizar({ autenticado: false, login }, '/login?sessao=encerrada');
    expect(screen.getByText('Sua sessão foi encerrada. Entre novamente.')).toBeInTheDocument();
    preencher({ escola: 'emmoo', login: 'luiz', senha: 'Luiz123' });
    // O erro do login toma o lugar do aviso.
    expect(await screen.findByRole('alert')).toHaveTextContent('Seu acesso foi desativado. Entre em contato com a coordenação da escola.');
    expect(screen.queryByText('Sua sessão foi encerrada. Entre novamente.')).not.toBeInTheDocument();
  });

  it('"Esqueci minha senha": com e-mail na API, leva à recuperação levando a escola', async () => {
    api.get.mockResolvedValue({ cadastroDeEscolas: false, recuperacaoDeSenha: true });
    lembrarEscola({ codigo: 'emmoo', nome: 'EMMOO' });
    renderizar({ autenticado: false, login: vi.fn() });
    const link = await screen.findByRole('link', { name: 'Esqueci minha senha' });
    expect(link).toHaveAttribute('href', '/recuperar-senha?escola=emmoo');
    fireEvent.click(link);
    expect(screen.getByText('Recuperar senha')).toBeInTheDocument();
  });

  it('"Esqueci minha senha": sem e-mail na API, orienta a pedir à coordenação', async () => {
    renderizar({ autenticado: false, login: vi.fn() });
    const botao = await screen.findByRole('button', { name: 'Esqueci minha senha' });
    expect(botao).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(botao);
    expect(screen.getByText('A coordenação da escola cria uma senha nova para você: é só pedir.')).toBeInTheDocument();
  });

  it('depois de criar a senha nova pelo link, avisa para entrar com ela; muitas tentativas mostram a espera', async () => {
    const login = vi.fn().mockRejectedValue(new Error('Muitas tentativas. Tente novamente em 15 minutos.'));
    renderizar({ autenticado: false, login }, '/login?escola=emmoo&senha=redefinida');
    expect(screen.getByText('Senha redefinida. Entre com a senha nova.')).toBeInTheDocument();
    preencher({ login: 'luiz', senha: 'errada' });
    expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas. Tente novamente em 15 minutos.');
  });
});
