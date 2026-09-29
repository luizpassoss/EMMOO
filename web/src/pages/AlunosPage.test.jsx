import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import AlunosPage from './AlunosPage.jsx';

vi.mock('../api/index.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() },
}));

const ALUNOS = [
  { id: 1, nome: 'Ana Beatriz', contato: '(47) 99999-0001', instrumento: 'Violino', planoId: 1, usuarioRespId: 3, status: 'ativo' },
  { id: 2, nome: 'Pedro Henrique', contato: '(47) 99999-0002', instrumento: 'Violão', planoId: 1, usuarioRespId: null, status: 'ativo' },
  { id: 3, nome: 'Lia', contato: 'lia@email.com', instrumento: 'Canto', planoId: 1, usuarioRespId: null, status: 'inativo' },
];

function renderizar(papel = 'coordenacao') {
  return render(
    <AuthContext.Provider value={{ autenticado: true, usuario: { id: 1, nome: 'Lucimara', papel } }}>
      <AlunosPage />
    </AuthContext.Provider>,
  );
}

const itemDoAluno = (nome) => screen.getByText(nome).closest('li');

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(async (caminho) => {
    if (caminho === '/alunos') return ALUNOS;
    if (caminho === '/planos') return [{ id: 1, nome: 'Particular 1x/semana' }];
    if (caminho === '/usuarios?papel=responsavel') return [{ id: 3, nome: 'Mary' }];
    throw new Error(`GET não simulado: ${caminho}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AlunosPage', () => {
  it('lista os ativos por padrão, com plano e responsável', async () => {
    renderizar();
    expect(await screen.findByText('Ana Beatriz')).toBeInTheDocument();
    expect(screen.getByText('Violino · Particular 1x/semana · Resp.: Mary')).toBeInTheDocument();
    expect(screen.queryByText('Lia')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ativos 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Todos 3' })).toBeInTheDocument();
  });

  it('busca por nome ou instrumento ignorando acentos', async () => {
    renderizar();
    await screen.findByText('Ana Beatriz');
    fireEvent.change(screen.getByLabelText('Buscar aluno'), { target: { value: 'violao' } });
    expect(screen.queryByText('Ana Beatriz')).not.toBeInTheDocument();
    expect(screen.getByText('Pedro Henrique')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar aluno'), { target: { value: 'xyz' } });
    expect(screen.getByText('Nenhum aluno encontrado.')).toBeInTheDocument();
  });

  it('reativa aluno inativo', async () => {
    api.patch.mockResolvedValue({});
    renderizar();
    await screen.findByText('Ana Beatriz');
    fireEvent.click(screen.getByRole('button', { name: 'Inativos 1' }));
    fireEvent.click(within(itemDoAluno('Lia')).getByRole('button', { name: 'Reativar' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/alunos/3/reativar'));
    expect(await screen.findByRole('status')).toHaveTextContent('Lia reativado(a).');
  });

  it('inativa após confirmação e informa as aulas canceladas', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.patch.mockResolvedValue({ status: 'inativo', aulasCanceladas: 7 });
    renderizar();
    await screen.findByText('Ana Beatriz');
    fireEvent.click(within(itemDoAluno('Ana Beatriz')).getByRole('button', { name: 'Inativar' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/alunos/1/inativar'));
    expect(await screen.findByRole('status')).toHaveTextContent('Ana Beatriz inativado(a). 7 aulas futuras canceladas.');
  });

  it('edita aluno existente, incluindo o responsável', async () => {
    api.put.mockResolvedValue({});
    renderizar();
    await screen.findByText('Ana Beatriz');
    fireEvent.click(within(itemDoAluno('Ana Beatriz')).getByRole('button', { name: 'Editar' }));

    expect(screen.getByRole('heading', { name: 'Editar aluno' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveValue('Ana Beatriz');
    expect(screen.getByLabelText('Responsável (opcional)')).toHaveValue('3');

    fireEvent.change(screen.getByLabelText('Instrumento'), { target: { value: 'Viola' } });
    fireEvent.change(screen.getByLabelText('Responsável (opcional)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/alunos/1', {
        nome: 'Ana Beatriz',
        contato: '(47) 99999-0001',
        instrumento: 'Viola',
        planoId: 1,
        usuarioRespId: null,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Dados de Ana Beatriz atualizados.');
    expect(screen.getByRole('heading', { name: 'Novo aluno' })).toBeInTheDocument();
  });

  it('cancela a edição e volta ao cadastro', async () => {
    renderizar();
    await screen.findByText('Ana Beatriz');
    fireEvent.click(within(itemDoAluno('Pedro Henrique')).getByRole('button', { name: 'Editar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar edição' }));
    expect(screen.getByLabelText('Nome')).toHaveValue('');
  });

  it('cadastra aluno e mostra erros de validação por campo', async () => {
    api.post.mockRejectedValueOnce({ details: [{ campo: 'nome', mensagem: 'Informe o nome do aluno.' }] });
    api.post.mockResolvedValueOnce({ id: 4 });
    renderizar();
    await screen.findByText('Ana Beatriz');
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar aluno' }));
    expect(await screen.findByText('Informe o nome do aluno.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Teo' } });
    fireEvent.change(screen.getByLabelText('Plano'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar aluno' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenLastCalledWith('/alunos', {
        nome: 'Teo',
        contato: '',
        instrumento: '',
        planoId: 1,
        usuarioRespId: null,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Teo cadastrado(a).');
  });

  it('professor apenas consulta a lista', async () => {
    renderizar('professor');
    expect(await screen.findByText('Ana Beatriz')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByText('Novo aluno')).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/usuarios?papel=responsavel');
  });
});
