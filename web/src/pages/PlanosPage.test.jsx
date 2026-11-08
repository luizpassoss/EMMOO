import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { responderConfirmacao } from '../apoioTestes.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import PlanosPage from './PlanosPage.jsx';

vi.mock('../api/index.js', () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() } }));

const PLANOS = [
  { id: 3, nome: 'Grupo · 1 aula por semana', tipo: 'grupo', valor: 90, freqSemanal: 1, duracaoMin: 60, totalAlunos: 0, alunosAtivos: 0 },
  { id: 2, nome: 'Particular · 2 aulas por semana', tipo: 'particular', valor: 260.5, freqSemanal: 2, duracaoMin: 45, totalAlunos: 1, alunosAtivos: 1 },
  { id: 1, nome: 'Particular · 1 aula por semana', tipo: 'particular', valor: 140, freqSemanal: 1, duracaoMin: 45, totalAlunos: 3, alunosAtivos: 2 },
  { id: 4, nome: 'Musicalização', tipo: 'grupo', valor: 120, freqSemanal: 2, duracaoMin: 50, totalAlunos: 0, alunosAtivos: 0 },
];

function renderizar(papel = 'coordenacao', endereco = '/planos') {
  return render(
    <AuthContext.Provider value={{ autenticado: true, usuario: { id: 1, nome: 'Lucimara', papel } }}>
      <MemoryRouter initialEntries={[endereco]}>
        <Routes>
          <Route path="/planos" element={<PlanosPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

/** Na lista, a linha inteira do plano é o botão que abre a edição. */
const linhaDoPlano = (nome) => screen.getByRole('button', { name: new RegExp(`^${nome}`) });

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue(PLANOS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PlanosPage — lista', () => {
  it('cada plano numa linha: nome, só o que o nome não diz e o valor', async () => {
    renderizar();
    const particularSemanal = await screen.findByRole('button', { name: /^Particular · 1 aula por semana/ });
    expect(within(particularSemanal).getByText('Aulas de 45 minutos')).toBeInTheDocument(); // tipo e frequência já estão no nome
    expect(within(particularSemanal).getByText(/R\$\s?140$/)).toBeInTheDocument(); // valor redondo, sem centavos
    expect(within(linhaDoPlano('Particular · 2 aulas por semana')).getByText(/R\$\s?260,50/)).toBeInTheDocument();
    // Nome livre: o tipo e a frequência entram no detalhe.
    expect(within(linhaDoPlano('Musicalização')).getByText('Grupo · 2 aulas semanais de 50 minutos')).toBeInTheDocument();
    // Particular antes de grupo; dentro do tipo, da menor para a maior frequência.
    expect(screen.getAllByRole('button', { name: /semana|Musicalização/ }).map((b) => b.querySelector('strong').textContent)).toEqual([
      'Particular · 1 aula por semana',
      'Particular · 2 aulas por semana',
      'Grupo · 1 aula por semana',
      'Musicalização',
    ]);
    expect(screen.queryByText(/por aula/)).not.toBeInTheDocument(); // sem excesso de informação na lista
  });

  it('outros perfis só consultam: linhas sem ação', async () => {
    renderizar('professor');
    await screen.findByText('Particular · 1 aula por semana');
    expect(screen.queryByRole('button', { name: /Particular · 1 aula/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Novo plano' })).not.toBeInTheDocument();
  });

  it('nome no padrão antigo ("1x/semana") não repete a frequência no detalhe', async () => {
    api.get.mockResolvedValue([{ ...PLANOS[2], nome: 'Particular 1x/semana' }]);
    renderizar();
    expect(await screen.findByText('Aulas de 45 minutos')).toBeInTheDocument();
  });

  it('lista vazia e erro de carregamento', async () => {
    api.get.mockResolvedValueOnce([]);
    const { unmount } = renderizar('responsavel');
    expect(await screen.findByText('Nenhum plano cadastrado.')).toBeInTheDocument();
    unmount();
    api.get.mockRejectedValueOnce(new Error('Falha ao carregar.'));
    renderizar('professor');
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao carregar.');
  });
});

describe('PlanosPage — painel', () => {
  it('cadastra plano escolhendo tipo e frequência, com nome sugerido e valor por aula', async () => {
    api.post.mockResolvedValue({ id: 5 });
    renderizar();
    await screen.findByText('Particular · 1 aula por semana');
    fireEvent.click(screen.getByRole('button', { name: 'Novo plano' }));
    expect(screen.queryByRole('button', { name: 'Excluir plano' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Grupo'));
    fireEvent.click(screen.getByLabelText('3'));
    fireEvent.change(screen.getByLabelText('Valor mensal (R$)'), { target: { value: '240' } });
    expect(screen.getByLabelText('Nome (opcional)')).toHaveAttribute('placeholder', 'Grupo · 3 aulas por semana');
    expect(screen.getByText(/Equivale a cerca de R\$\s?20,00 por aula\./)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar plano' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/planos', {
        nome: 'Grupo · 3 aulas por semana',
        tipo: 'grupo',
        valor: 240,
        freqSemanal: 3,
        duracaoMin: 45,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Plano "Grupo · 3 aulas por semana" cadastrado.');
    expect(screen.queryByRole('heading', { name: 'Novo plano' })).not.toBeInTheDocument();
  });

  it('usa o nome digitado quando há um', async () => {
    api.post.mockResolvedValue({ id: 5 });
    renderizar();
    await screen.findByText('Particular · 1 aula por semana');
    fireEvent.click(screen.getByRole('button', { name: 'Novo plano' }));
    fireEvent.change(screen.getByLabelText('Nome (opcional)'), { target: { value: 'Coral' } });
    fireEvent.change(screen.getByLabelText('Valor mensal (R$)'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar plano' }));
    await waitFor(() => expect(api.post.mock.calls[0][1].nome).toBe('Coral'));
  });

  it('tocar no plano abre a edição já preenchida', async () => {
    api.put.mockResolvedValue({});
    renderizar();
    await screen.findByText('Particular · 1 aula por semana');
    fireEvent.click(linhaDoPlano('Particular · 2 aulas por semana'));

    expect(screen.getByRole('heading', { name: 'Editar plano' })).toBeInTheDocument();
    expect(screen.getByLabelText('2')).toBeChecked();
    expect(screen.getByLabelText('Particular')).toBeChecked();
    expect(screen.getByLabelText('Valor mensal (R$)')).toHaveValue(260.5);
    fireEvent.change(screen.getByLabelText('Valor mensal (R$)'), { target: { value: '280' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/planos/2', {
        nome: 'Particular · 2 aulas por semana',
        tipo: 'particular',
        valor: 280,
        freqSemanal: 2,
        duracaoMin: 45,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Plano "Particular · 2 aulas por semana" atualizado.');
  });

  it('plano antigo com 6 aulas por semana continua editável', async () => {
    api.get.mockResolvedValue([{ ...PLANOS[0], id: 9, nome: 'Intensivo', freqSemanal: 6 }]);
    renderizar('coordenacao', '/planos?plano=9');
    expect(await screen.findByLabelText('6')).toBeChecked();
  });

  it('excluir fica na edição: sem alunos, confirma e exclui', async () => {
    api.delete.mockResolvedValue(null);
    renderizar();
    await screen.findByText('Particular · 1 aula por semana');
    fireEvent.click(linhaDoPlano('Grupo · 1 aula por semana'));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir plano' }));
    await responderConfirmacao('Excluir', { name: 'Excluir o plano "Grupo · 1 aula por semana"?' });
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/planos/3'));
    expect(await screen.findByRole('status')).toHaveTextContent('Plano "Grupo · 1 aula por semana" excluído.');
    expect(screen.queryByRole('heading', { name: 'Editar plano' })).not.toBeInTheDocument();
  });

  it('plano em uso: não pede confirmação e o painel explica por que não exclui', async () => {
    api.delete.mockRejectedValue(new Error('O plano é usado por 3 alunos (contando os inativos).'));
    renderizar();
    await screen.findByText('Particular · 1 aula por semana');
    fireEvent.click(linhaDoPlano('Particular · 1 aula por semana'));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir plano' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('O plano é usado por 3 alunos');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Editar plano' })).toBeInTheDocument();
  });

  it('não exclui quando a pessoa desiste', async () => {
    renderizar();
    await screen.findByText('Grupo · 1 aula por semana');
    fireEvent.click(linhaDoPlano('Grupo · 1 aula por semana'));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir plano' }));
    await responderConfirmacao('Voltar');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.delete).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Editar plano' })).toBeInTheDocument(); // o painel continua aberto
  });

  it('mostra os erros de validação em cada campo', async () => {
    api.post.mockRejectedValue({ details: [{ campo: 'valor', mensagem: 'O valor deve ser um número maior que zero.' }] });
    renderizar();
    await screen.findByText('Particular · 1 aula por semana');
    fireEvent.click(screen.getByRole('button', { name: 'Novo plano' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar plano' }));
    expect(await screen.findByText('O valor deve ser um número maior que zero.')).toBeInTheDocument();
    expect(screen.getByLabelText('Valor mensal (R$)')).toHaveAttribute('aria-invalid', 'true');
  });
});
