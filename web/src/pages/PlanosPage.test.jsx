import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import PlanosPage from './PlanosPage.jsx';

vi.mock('../api/index.js', () => ({ api: { get: vi.fn(), post: vi.fn() } }));

const PLANO = { id: 1, nome: 'Particular 1x/semana', tipo: 'particular', valor: 140, freqSemanal: 1, duracaoMin: 45 };

function renderizar(papel = 'coordenacao') {
  return render(
    <AuthContext.Provider value={{ autenticado: true, usuario: { id: 1, nome: 'Lucimara', papel } }}>
      <PlanosPage />
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue([PLANO]);
});

describe('PlanosPage', () => {
  it('lista os planos com tipo, frequência, duração e valor', async () => {
    renderizar();
    expect(await screen.findByText('Particular 1x/semana')).toBeInTheDocument();
    expect(screen.getByText('Particular · 1x por semana · 45 min')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s?140,00/)).toBeInTheDocument();
  });

  it('cadastra plano convertendo os números e confirma', async () => {
    api.post.mockResolvedValue({ id: 2 });
    renderizar();
    await screen.findByText('Particular 1x/semana');
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Grupo 2x' } });
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'grupo' } });
    fireEvent.change(screen.getByLabelText('Valor (R$)'), { target: { value: '99.9' } });
    fireEvent.change(screen.getByLabelText('Aulas por semana'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar plano' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/planos', {
        nome: 'Grupo 2x',
        tipo: 'grupo',
        valor: 99.9,
        freqSemanal: 2,
        duracaoMin: 45,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Plano "Grupo 2x" cadastrado.');
    expect(screen.getByLabelText('Nome')).toHaveValue('');
  });

  it('mostra os erros de validação em cada campo', async () => {
    api.post.mockRejectedValue({ details: [{ campo: 'valor', mensagem: 'O valor deve ser um número maior que zero.' }] });
    renderizar();
    await screen.findByText('Particular 1x/semana');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar plano' }));
    expect(await screen.findByText('O valor deve ser um número maior que zero.')).toBeInTheDocument();
    expect(screen.getByLabelText('Valor (R$)')).toHaveAttribute('aria-invalid', 'true');
  });

  it('outros perfis só consultam; lista vazia e erro de carregamento', async () => {
    api.get.mockResolvedValueOnce([]);
    const { unmount } = renderizar('responsavel');
    expect(await screen.findByText('Nenhum plano cadastrado.')).toBeInTheDocument();
    expect(screen.queryByText('Novo plano')).not.toBeInTheDocument();
    unmount();

    api.get.mockRejectedValueOnce(new Error('Falha ao carregar.'));
    renderizar('professor');
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao carregar.');
  });
});
