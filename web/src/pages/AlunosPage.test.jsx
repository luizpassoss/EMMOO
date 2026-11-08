import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { responderConfirmacao } from '../apoioTestes.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import AlunosPage from './AlunosPage.jsx';

vi.mock('../api/index.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const ALUNOS = [
  { id: 1, nome: 'Ana Beatriz', contato: '(47) 99999-0001', instrumento: 'Violino', planoId: 1, usuarioRespId: 3, status: 'ativo' },
  { id: 2, nome: 'Pedro Henrique', contato: '(47) 99999-0002', instrumento: 'Violão', planoId: 1, usuarioRespId: null, status: 'ativo' },
  { id: 3, nome: 'Lia', contato: 'lia@email.com', instrumento: 'Canto', planoId: 1, usuarioRespId: null, status: 'inativo' },
];

/** O endereço mostra o painel aberto (?aluno=novo / ?aluno=<id>). */
function MostrarEndereco() {
  const { pathname, search } = useLocation();
  return <span data-testid="endereco">{`${pathname}${search}`}</span>;
}

function renderizar(papel = 'coordenacao', endereco = '/alunos') {
  return render(
    <AuthContext.Provider value={{ autenticado: true, usuario: { id: 1, nome: 'Lucimara', papel } }}>
      <MemoryRouter initialEntries={[endereco]}>
        <Routes>
          <Route path="/alunos" element={<AlunosPage />} />
        </Routes>
        <MostrarEndereco />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const enderecoAtual = () => screen.getByTestId('endereco').textContent;
/** Na lista, a linha inteira do aluno é o botão que abre a edição. */
const abrirAluno = (nome) => fireEvent.click(screen.getByRole('button', { name: new RegExp(nome) }));

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation(async (caminho) => {
    if (caminho === '/alunos') return ALUNOS;
    if (caminho === '/planos') return [{ id: 1, nome: 'Particular · 1 aula por semana' }];
    if (caminho === '/usuarios?papel=responsavel') return [{ id: 3, nome: 'Mary' }];
    throw new Error(`GET não simulado: ${caminho}`);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AlunosPage — lista', () => {
  it('mostra só nome e instrumento dos ativos, sem botões por linha', async () => {
    renderizar();
    const ana = await screen.findByRole('button', { name: /Ana Beatriz/ });
    expect(within(ana).getByText('Violino')).toBeInTheDocument();
    expect(screen.queryByText('Lia')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Inativar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ativos 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Todos 3' })).toBeInTheDocument();
  });

  it('o selo "Inativo" aparece só no filtro "Todos"', async () => {
    renderizar();
    await screen.findByText('Ana Beatriz');
    fireEvent.click(screen.getByRole('button', { name: 'Inativos 1' }));
    expect(screen.getByText('Lia')).toBeInTheDocument();
    expect(screen.queryByText('Inativo')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Todos 3' }));
    expect(screen.getByRole('button', { name: /Lia/ })).toHaveTextContent('Inativo');
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

  it('professor apenas consulta: linhas sem ação e sem cadastro', async () => {
    renderizar('professor');
    expect(await screen.findByText('Ana Beatriz')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ana Beatriz/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Novo aluno' })).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/usuarios?papel=responsavel');
  });
});

describe('AlunosPage — painel do aluno', () => {
  it('tocar no aluno abre a edição, com os dados e o responsável', async () => {
    api.put.mockResolvedValue({});
    renderizar();
    await screen.findByText('Ana Beatriz');
    abrirAluno('Ana Beatriz');

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
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument(); // o painel fecha após salvar
  });

  it('aluno ativo: inativar fica no painel, após confirmação', async () => {
    api.patch.mockResolvedValue({ status: 'inativo', aulasCanceladas: 7 });
    renderizar();
    await screen.findByText('Ana Beatriz');
    abrirAluno('Ana Beatriz');
    expect(screen.queryByRole('button', { name: 'Excluir permanentemente' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Inativar aluno' }));
    expect(api.patch).not.toHaveBeenCalled(); // só depois de confirmar
    await responderConfirmacao('Inativar', {
      name: 'Inativar Ana Beatriz?',
      description: /As próximas aulas serão retiradas da agenda, os horários ficarão disponíveis/,
    });
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/alunos/1/inativar', { cancelarMensalidades: false }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Cadastro de Ana Beatriz inativado. 7 aulas foram retiradas da agenda e os horários ficaram disponíveis.',
    );
  });

  it('com mensalidades em aberto, a confirmação oferece cancelá-las junto', async () => {
    const padrao = api.get.getMockImplementation();
    api.get.mockImplementation(async (caminho) =>
      caminho === '/mensalidades?mes=todos&alunoId=1'
        ? [
            { id: 7, status: 'atrasada', valor: 140 },
            { id: 8, status: 'pendente', valor: 140 },
            { id: 6, status: 'paga', valor: 140 },
          ]
        : padrao(caminho),
    );
    api.patch.mockResolvedValue({ status: 'inativo', aulasCanceladas: 0, mensalidadesCanceladas: 2 });
    renderizar();
    await screen.findByText('Ana Beatriz');
    abrirAluno('Ana Beatriz');
    fireEvent.click(screen.getByRole('button', { name: 'Inativar aluno' }));
    const dialogo = await screen.findByRole('alertdialog', { name: 'Inativar Ana Beatriz?' });
    const opcao = within(dialogo).getByRole('checkbox', { name: /Cancelar também as 2 mensalidades em aberto/ });
    expect(opcao.closest('label')).toHaveTextContent('280,00'); // as duas em aberto (a paga fica de fora)
    expect(opcao).not.toBeChecked();
    fireEvent.click(opcao);
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Inativar' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/alunos/1/inativar', { cancelarMensalidades: true }));
    expect(await screen.findByRole('status')).toHaveTextContent('Cadastro de Ana Beatriz inativado. 2 mensalidades canceladas.');
  });

  it('aluno inativo: reativar no painel, sem aulas para devolver', async () => {
    api.patch.mockResolvedValue({ status: 'ativo', aulasRestauradas: 0, aulasNaoRestauradas: 0 });
    renderizar();
    await screen.findByText('Ana Beatriz');
    fireEvent.click(screen.getByRole('button', { name: 'Inativos 1' }));
    abrirAluno('Lia');
    fireEvent.click(screen.getByRole('button', { name: 'Reativar aluno' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/alunos/3/reativar'));
    expect(await screen.findByRole('status')).toHaveTextContent('Cadastro de Lia reativado. Agende as aulas na Agenda.');
  });

  it('reativar diz quantas aulas retornaram à agenda e quantas não puderam retornar', async () => {
    api.patch.mockResolvedValueOnce({ status: 'ativo', aulasRestauradas: 6, aulasNaoRestauradas: 0 });
    api.patch.mockResolvedValueOnce({ status: 'ativo', aulasRestauradas: 1, aulasNaoRestauradas: 2 });
    renderizar();
    await screen.findByText('Ana Beatriz');
    fireEvent.click(screen.getByRole('button', { name: 'Inativos 1' }));
    abrirAluno('Lia');
    fireEvent.click(screen.getByRole('button', { name: 'Reativar aluno' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Cadastro de Lia reativado. 6 aulas retornaram à agenda.');
    abrirAluno('Lia');
    fireEvent.click(await screen.findByRole('button', { name: 'Reativar aluno' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        'Cadastro de Lia reativado. 1 aula retornou à agenda. 2 horários foram ocupados nesse período; agende novamente na Agenda.',
      ),
    );
  });

  it('aluno inativo: excluir permanentemente após confirmar, e o painel fecha', async () => {
    api.delete.mockResolvedValue({ aulasExcluidas: 4 });
    renderizar();
    await screen.findByText('Ana Beatriz');
    fireEvent.click(screen.getByRole('button', { name: 'Inativos 1' }));
    abrirAluno('Lia');
    fireEvent.click(screen.getByRole('button', { name: 'Excluir permanentemente' }));
    await responderConfirmacao('Excluir', {
      name: 'Excluir Lia permanentemente?',
      description: /não pode ser desfeito/,
    });
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/alunos/3'));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Cadastro de Lia excluído permanentemente. 4 aulas foram apagadas do histórico.',
    );
    await waitFor(() => expect(enderecoAtual()).toBe('/alunos'));
  });

  it('não exclui quando a pessoa desiste; erro da API aparece', async () => {
    renderizar();
    await screen.findByText('Ana Beatriz');
    fireEvent.click(screen.getByRole('button', { name: 'Inativos 1' }));
    abrirAluno('Lia');
    fireEvent.click(screen.getByRole('button', { name: 'Excluir permanentemente' }));
    await responderConfirmacao('Voltar');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.delete).not.toHaveBeenCalled();

    api.delete.mockRejectedValue(new Error('Só é possível excluir aluno inativo. Inative o aluno antes.'));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir permanentemente' }));
    await responderConfirmacao('Excluir');
    expect(await screen.findByRole('alert')).toHaveTextContent('Inative o aluno antes.');
  });

  it('fechar com algo digitado pergunta antes de descartar', async () => {
    renderizar();
    await screen.findByText('Ana Beatriz');
    abrirAluno('Ana Beatriz');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' })); // nada mudou: fecha direto
    await waitFor(() => expect(enderecoAtual()).toBe('/alunos'));

    abrirAluno('Ana Beatriz');
    fireEvent.change(screen.getByLabelText('Instrumento'), { target: { value: 'Viola' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await responderConfirmacao('Voltar', { name: 'Descartar as alterações?' });
    expect(screen.getByLabelText('Instrumento')).toHaveValue('Viola'); // continua editando, nada se perdeu
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await responderConfirmacao('Descartar');
    await waitFor(() => expect(enderecoAtual()).toBe('/alunos'));
    expect(api.put).not.toHaveBeenCalled();
  });

  it('o telefone ganha formato ao sair do campo; a escolha do plano mostra o valor', async () => {
    api.get.mockImplementation(async (caminho) => {
      if (caminho === '/alunos') return ALUNOS;
      if (caminho === '/planos') return [{ id: 1, nome: 'Particular · 1 aula por semana', valor: 140 }];
      if (caminho === '/usuarios?papel=responsavel') return [];
      throw new Error(`GET não simulado: ${caminho}`);
    });
    renderizar();
    await screen.findByText('Ana Beatriz');
    fireEvent.click(screen.getByRole('button', { name: 'Novo aluno' }));
    const contato = screen.getByLabelText('Contato');
    fireEvent.change(contato, { target: { value: '47999990003' } });
    fireEvent.blur(contato);
    expect(contato).toHaveValue('(47) 99999-0003');
    fireEvent.change(contato, { target: { value: ' teo@email.com ' } });
    fireEvent.blur(contato);
    expect(contato).toHaveValue('teo@email.com');
    expect(within(screen.getByLabelText('Plano')).getByRole('option', { name: /^Particular · 1 aula por semana — R\$\s?140$/ })).toBeInTheDocument();
  });

  it('cadastra aluno e mostra erros de validação por campo', async () => {
    api.post.mockRejectedValueOnce({ details: [{ campo: 'nome', mensagem: 'Informe o nome do aluno.' }] });
    api.post.mockResolvedValueOnce({ id: 4 });
    renderizar();
    await screen.findByText('Ana Beatriz');
    fireEvent.click(screen.getByRole('button', { name: 'Novo aluno' }));
    expect(screen.getByRole('heading', { name: 'Novo aluno' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Inativar aluno' })).not.toBeInTheDocument();
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
    expect(await screen.findByRole('status')).toHaveTextContent('Cadastro de Teo concluído.');
  });
});

describe('AlunosPage — voltar com o painel aberto', () => {
  it('o painel fica na URL e fechar volta à lista, sem sair da página', async () => {
    renderizar();
    await screen.findByText('Ana Beatriz');
    fireEvent.click(screen.getByRole('button', { name: 'Novo aluno' }));
    expect(enderecoAtual()).toBe('/alunos?aluno=novo');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(enderecoAtual()).toBe('/alunos'));
    expect(screen.queryByLabelText('Nome')).not.toBeInTheDocument();
    expect(screen.getByText('Ana Beatriz')).toBeInTheDocument();
  });

  it('trocar o aluno em edição não empilha passos: um voltar fecha o painel', async () => {
    renderizar();
    await screen.findByText('Ana Beatriz');
    abrirAluno('Ana Beatriz');
    abrirAluno('Pedro Henrique');
    expect(enderecoAtual()).toBe('/alunos?aluno=2');
    expect(screen.getByLabelText('Nome')).toHaveValue('Pedro Henrique');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(enderecoAtual()).toBe('/alunos'));
  });

  it('abre a edição por link direto e fecha sem sair da página', async () => {
    renderizar('coordenacao', '/alunos?aluno=1');
    expect(await screen.findByRole('heading', { name: 'Editar aluno' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Nome')).toHaveValue('Ana Beatriz'));
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(enderecoAtual()).toBe('/alunos'));
    expect(screen.queryByRole('heading', { name: 'Editar aluno' })).not.toBeInTheDocument();
  });

  it('link para aluno inexistente apenas mostra a lista', async () => {
    renderizar('coordenacao', '/alunos?aluno=99');
    await screen.findByText('Ana Beatriz');
    await waitFor(() => expect(enderecoAtual()).toBe('/alunos'));
    expect(screen.queryByRole('heading', { name: 'Editar aluno' })).not.toBeInTheDocument();
  });
});
