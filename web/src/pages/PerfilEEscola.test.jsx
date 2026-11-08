import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { ApiError } from '../api/client.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import EscolaPage from './EscolaPage.jsx';
import PerfilPage from './PerfilPage.jsx';

vi.mock('../api/index.js', () => ({ api: { get: vi.fn(), put: vi.fn() } }));

const ESCOLA = { id: 1, nome: 'Escola de Música EMMOO', codigo: 'emmoo' };
const USUARIO = { id: 2, nome: 'Luiz Souza', email: 'luiz@emmoo.com.br', login: 'luiz', papel: 'professor', escola: ESCOLA };

function renderizar(pagina, auth = {}) {
  const valor = { autenticado: true, token: 'token-antigo', usuario: USUARIO, entrar: vi.fn(), logout: vi.fn(), ...auth };
  render(
    <AuthContext.Provider value={valor}>
      <MemoryRouter initialEntries={['/pagina']}>
        <Routes>
          <Route path="/pagina" element={pagina} />
          <Route path="/login" element={<p>Tela de login</p>} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
  return valor;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('PerfilPage — minha conta', () => {
  it('mostra os dados de acesso e troca a senha, seguindo com o token novo', async () => {
    const sessao = { token: 'token-novo', usuario: USUARIO };
    api.put.mockResolvedValue(sessao);
    const { entrar } = renderizar(<PerfilPage />);
    expect(screen.getByText('Luiz Souza')).toBeInTheDocument();
    expect(screen.getByText('Professor(a) · Escola de Música EMMOO')).toBeInTheDocument();
    expect(screen.getByText('luiz@emmoo.com.br')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: 'Luiz123' } });
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'violao2026' } });
    fireEvent.change(screen.getByLabelText('Repita a nova senha'), { target: { value: 'violao2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/auth/senha', { senhaAtual: 'Luiz123', novaSenha: 'violao2026' }));
    expect(entrar).toHaveBeenCalledWith(sessao);
    expect(await screen.findByRole('status')).toHaveTextContent('Senha alterada.');
    expect(screen.getByLabelText('Senha atual')).toHaveValue('');
  });

  it('confere os campos antes de enviar e mostra o erro da API no campo', async () => {
    renderizar(<PerfilPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }));
    expect(screen.getByText('Informe a senha atual.')).toBeInTheDocument();
    expect(screen.getByText('A nova senha precisa ter pelo menos 6 caracteres.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: 'errada' } });
    fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: 'violao2026' } });
    fireEvent.change(screen.getByLabelText('Repita a nova senha'), { target: { value: 'outra' } });
    fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }));
    expect(screen.getByText('As duas senhas não são iguais.')).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();

    api.put.mockRejectedValue(new ApiError(400, 'Dados inválidos.', [{ campo: 'senhaAtual', mensagem: 'A senha atual não confere.' }]));
    fireEvent.change(screen.getByLabelText('Repita a nova senha'), { target: { value: 'violao2026' } });
    fireEvent.click(screen.getByRole('button', { name: 'Trocar senha' }));
    expect(await screen.findByText('A senha atual não confere.')).toBeInTheDocument();
  });

  it('mostrar as senhas e sair do sistema', () => {
    const { logout } = renderizar(<PerfilPage />, { usuario: { ...USUARIO, login: null } });
    expect(screen.getByText('— (entra com o e-mail)')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Mostrar as senhas'));
    expect(screen.getByLabelText('Senha atual')).toHaveAttribute('type', 'text');
    fireEvent.click(screen.getByRole('button', { name: 'Sair do sistema' }));
    expect(logout).toHaveBeenCalled();
    expect(screen.getByText('Tela de login')).toBeInTheDocument();
  });
});

describe('EscolaPage — dados da escola e Pix', () => {
  const SEM_PIX = { ...ESCOLA, pix: { configurado: false, tipo: null, chave: null, recebedor: null, cidade: null, exemplo: null } };
  const COM_PIX = {
    ...ESCOLA,
    pix: {
      configurado: true,
      tipo: 'telefone',
      chave: '+5547999990001',
      recebedor: 'Escola de Musica EMMOO',
      cidade: 'Joinville',
      exemplo: { copiaECola: '000201exemplo', qrCodeSvg: '<svg></svg>' },
    },
  };
  const coordenacao = { ...USUARIO, papel: 'coordenacao' };

  it('cadastra o Pix: escolhe o tipo, informa a chave e a cidade, e recebe o exemplo para conferir', async () => {
    api.get.mockResolvedValue(SEM_PIX);
    api.put.mockResolvedValue(COM_PIX);
    renderizar(<EscolaPage />, { usuario: coordenacao });
    expect(await screen.findByLabelText('Nome da escola')).toHaveValue('Escola de Música EMMOO');
    expect(screen.getByLabelText('Código de acesso')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled(); // nada mudou
    expect(screen.queryByLabelText('Chave Pix')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tipo da chave'), { target: { value: 'telefone' } });
    expect(screen.getByLabelText('Chave Pix')).toHaveAttribute('placeholder', '(47) 99999-0001');
    fireEvent.change(screen.getByLabelText('Chave Pix'), { target: { value: '(47) 99999-0001' } });
    fireEvent.change(screen.getByLabelText('Cidade'), { target: { value: 'Joinville' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/escola', {
        nome: 'Escola de Música EMMOO',
        pix: { tipo: 'telefone', chave: '(47) 99999-0001', recebedor: '', cidade: 'Joinville' },
      }),
    );
    expect(await screen.findByText('Dados salvos. O Pix já aparece para as famílias pagarem.')).toHaveAttribute('role', 'status');
    expect(screen.getByLabelText('Chave Pix')).toHaveValue('+5547999990001');
    expect(screen.getByRole('img', { name: 'QR Code do Pix' })).toBeInTheDocument();
    expect(screen.getByLabelText('Pix copia e cola')).toHaveValue('000201exemplo');
  });

  it('erros do Pix aparecem nos campos; tirar o tipo remove o Pix', async () => {
    api.get.mockResolvedValue(COM_PIX);
    renderizar(<EscolaPage />, { usuario: coordenacao });
    fireEvent.change(await screen.findByLabelText('Chave Pix'), { target: { value: '9999' } });
    expect(screen.queryByRole('img', { name: 'QR Code do Pix' })).not.toBeInTheDocument(); // o exemplo é do Pix salvo
    api.put.mockRejectedValueOnce(
      new ApiError(400, 'Dados inválidos.', [{ campo: 'pix.chave', mensagem: 'Informe o celular com DDD.' }]),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(await screen.findByText('Informe o celular com DDD.')).toBeInTheDocument();

    api.put.mockResolvedValueOnce(SEM_PIX);
    fireEvent.change(screen.getByLabelText('Tipo da chave'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(api.put).toHaveBeenLastCalledWith('/escola', { nome: 'Escola de Música EMMOO', pix: null }));
    expect(await screen.findByRole('status')).toHaveTextContent('Dados salvos.');
  });

  it('mudar o nome atualiza o nome da escola guardado na sessão deste aparelho', async () => {
    api.get.mockResolvedValue(SEM_PIX);
    api.put.mockResolvedValue({ ...SEM_PIX, nome: 'Escola EMMOO Centro' });
    const { entrar } = renderizar(<EscolaPage />, { usuario: coordenacao });
    fireEvent.change(await screen.findByLabelText('Nome da escola'), { target: { value: 'Escola EMMOO Centro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(entrar).toHaveBeenCalledWith({
        token: 'token-antigo',
        usuario: { ...coordenacao, escola: { ...ESCOLA, nome: 'Escola EMMOO Centro' } },
      }),
    );
  });

  it('erro ao carregar aparece na página', async () => {
    api.get.mockRejectedValue(new Error('Acesso negado para este perfil.'));
    renderizar(<EscolaPage />, { usuario: coordenacao });
    expect(await screen.findByRole('alert')).toHaveTextContent('Acesso negado para este perfil.');
    expect(within(document.body).queryByLabelText('Nome da escola')).not.toBeInTheDocument();
  });
});
