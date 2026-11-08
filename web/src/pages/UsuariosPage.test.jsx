import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { responderConfirmacao } from '../apoioTestes.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import UsuariosPage from './UsuariosPage.jsx';

vi.mock('../api/index.js', () => ({ api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn() } }));

const USUARIOS = [
  { id: 3, nome: 'Mary', email: 'mary@emmoo.com.br', login: null, papel: 'responsavel' },
  { id: 2, nome: 'Luiz', email: 'luiz@emmoo.com.br', login: 'luiz', papel: 'professor' },
  { id: 1, nome: 'Lucimara', email: 'lucimara@emmoo.com.br', login: 'admin', papel: 'coordenacao' },
];

function renderizar(endereco = '/usuarios') {
  return render(
    <AuthContext.Provider value={{ autenticado: true, usuario: { id: 1, nome: 'Lucimara', papel: 'coordenacao' } }}>
      <MemoryRouter initialEntries={[endereco]}>
        <Routes>
          <Route path="/usuarios" element={<UsuariosPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const linhas = () => within(screen.getByRole('list')).getAllByRole('button');
/** O que a linha diz (nome, perfil e acesso), sem as iniciais do avatar. */
const textoDaLinha = (linha) => linha.querySelector('.linha-texto').textContent;
const linhaDe = (nome) => screen.getByRole('button', { name: new RegExp(`^${nome}`) });

// O professor Luiz atende segundas e quartas, das 14:00 às 17:00.
const HORARIOS_LUIZ = [1, 3].flatMap((diaSemana) =>
  ['14:00', '14:45', '15:30', '16:15'].map((horaInicio, i) => ({ id: diaSemana * 10 + i, diaSemana, horaInicio, duracaoMin: 45 })),
);
let horariosDoProfessor;

beforeEach(() => {
  vi.clearAllMocks();
  horariosDoProfessor = HORARIOS_LUIZ;
  api.get.mockImplementation(async (caminho) => (caminho.startsWith('/horarios') ? horariosDoProfessor : USUARIOS));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UsuariosPage', () => {
  it('lista por perfil (coordenação, professores, responsáveis) com o usuário ou o e-mail', async () => {
    renderizar();
    await screen.findByText('Luiz');
    expect(linhas().map(textoDaLinha)).toEqual([
      'Lucimara (você)Coordenação · admin',
      'LuizProfessor(a) · luiz',
      'MaryResponsável · mary@emmoo.com.br',
    ]);
  });

  it('cria o acesso de um professor já com a grade de atendimento', async () => {
    api.post.mockResolvedValue({ id: 4, horariosCriados: 25 });
    renderizar();
    await screen.findByText('Luiz');
    fireEvent.click(screen.getByRole('button', { name: 'Novo usuário' }));
    expect(screen.getByRole('radio', { name: 'Professor(a)' })).toBeChecked(); // o perfil mais comum
    // A grade sugerida: segunda a sexta, das 14:00 às 18:00, aulas de 45 minutos.
    const grade = screen.getByRole('region', { name: 'Horários de atendimento' });
    expect(within(grade).getByRole('checkbox', { name: 'Segunda' })).toBeChecked();
    expect(within(grade).getByRole('checkbox', { name: 'Sábado' })).not.toBeChecked();
    expect(within(grade).getByText('5 aulas por dia (14:00, 14:45, 15:30, 16:15 e 17:00) — 25 horários na semana.')).toBeInTheDocument();
    fireEvent.click(within(grade).getByRole('checkbox', { name: 'Sexta' }));
    fireEvent.change(within(grade).getByLabelText('Até'), { target: { value: '17:30' } });
    expect(within(grade).getByText('4 aulas por dia (14:00, 14:45, 15:30 e 16:15) — 16 horários na semana.')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: ' Bia ' } });
    fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'bia@emmoo.com.br' } });
    fireEvent.change(screen.getByLabelText('Usuário (opcional)'), { target: { value: 'bia' } });
    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'violino1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar acesso' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/usuarios', {
        papel: 'professor',
        nome: 'Bia',
        email: 'bia@emmoo.com.br',
        login: 'bia',
        senha: 'violino1',
        horarios: { dias: [1, 2, 3, 4], inicio: '14:00', fim: '17:30', duracaoMin: 45 },
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Acesso de Bia criado, com 25 horários de atendimento.');
    expect(screen.queryByRole('button', { name: 'Criar acesso' })).not.toBeInTheDocument();
    expect(api.get.mock.calls.filter(([caminho]) => caminho === '/usuarios')).toHaveLength(2); // recarrega a lista
  });

  it('responsável não tem grade; professor sem nenhum dia marcado fica sem horários', async () => {
    api.post.mockResolvedValue({ id: 5, horariosCriados: 0 });
    renderizar('/usuarios?usuario=novo');
    await screen.findByText('Luiz');
    fireEvent.click(screen.getByRole('radio', { name: 'Responsável' }));
    expect(screen.queryByRole('region', { name: 'Horários de atendimento' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: 'Professor(a)' }));
    const grade = screen.getByRole('region', { name: 'Horários de atendimento' });
    for (const dia of ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta']) fireEvent.click(within(grade).getByRole('checkbox', { name: dia }));
    expect(within(grade).getByText('Nenhum dia marcado: o professor fica sem horários por enquanto.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Rui' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar acesso' }));
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post.mock.calls[0][1].horarios).toBeUndefined();
    expect(await screen.findByRole('status')).toHaveTextContent('Acesso de Rui criado.');
  });

  it('erro da grade, devolvido pela API, aparece no campo da grade', async () => {
    api.post.mockRejectedValue({
      status: 400,
      message: 'Dados inválidos.',
      details: [{ campo: 'horarios.fim', mensagem: 'O término precisa ser depois do início.' }],
    });
    renderizar('/usuarios?usuario=novo');
    await screen.findByText('Luiz');
    fireEvent.click(screen.getByRole('button', { name: 'Criar acesso' }));
    expect(await screen.findByText('O término precisa ser depois do início.')).toBeInTheDocument();
    expect(screen.getByLabelText('Até')).toHaveAttribute('aria-invalid', 'true');
  });

  it('na edição do professor: o resumo dos horários e a grade para adicionar mais', async () => {
    api.post.mockResolvedValue({ criados: 17, ignorados: 8, horarios: [] });
    renderizar('/usuarios?usuario=2');
    const secao = await screen.findByRole('region', { name: 'Horários de atendimento' });
    expect(await within(secao).findByText('Seg e Qua')).toBeInTheDocument();
    expect(within(secao).getByText('das 14:00 às 17:00 · 8 horários por semana')).toBeInTheDocument();
    expect(within(secao).getByRole('link', { name: 'Ajustar na Agenda' })).toHaveAttribute('href', '/agenda?professor=2');
    fireEvent.click(within(secao).getByRole('button', { name: 'Adicionar mais horários' }));
    fireEvent.click(within(secao).getByRole('button', { name: 'Adicionar estes horários' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/horarios/grade', {
        professorId: 2,
        dias: [1, 2, 3, 4, 5],
        inicio: '14:00',
        fim: '18:00',
        duracaoMin: 45,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      '17 horários de atendimento adicionados para Luiz. 8 já existiam.',
    );
  });

  it('professor sem horários: explica a consequência e oferece definir', async () => {
    horariosDoProfessor = [];
    api.post.mockRejectedValue({ status: 400, message: 'Dados inválidos.', details: [{ campo: 'dias', mensagem: 'Escolha ao menos um dia da semana.' }] });
    renderizar('/usuarios?usuario=2');
    const secao = await screen.findByRole('region', { name: 'Horários de atendimento' });
    expect(await within(secao).findByText(/Luiz ainda não tem horários de atendimento/)).toBeInTheDocument();
    fireEvent.click(within(secao).getByRole('button', { name: 'Definir horários de atendimento' }));
    fireEvent.click(within(secao).getByRole('button', { name: 'Adicionar estes horários' }));
    expect(await within(secao).findByText('Escolha ao menos um dia da semana.')).toBeInTheDocument();
    fireEvent.click(within(secao).getByRole('button', { name: 'Agora não' }));
    expect(within(secao).queryByRole('checkbox', { name: 'Segunda' })).not.toBeInTheDocument();
  });

  it('edita tocando na linha; senha em branco mantém a atual', async () => {
    api.put.mockResolvedValue({});
    renderizar();
    await screen.findByText('Mary');
    fireEvent.click(linhaDe('Mary'));
    expect(screen.getByRole('heading', { name: 'Editar usuário' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nome')).toHaveValue('Mary');
    expect(screen.getByLabelText('Nova senha')).toHaveAccessibleDescription('Em branco, mantém a atual.');
    fireEvent.click(screen.getByRole('radio', { name: 'Professor(a)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    await waitFor(() =>
      expect(api.put).toHaveBeenCalledWith('/usuarios/3', {
        papel: 'professor',
        nome: 'Mary',
        email: 'mary@emmoo.com.br',
        login: '',
        senha: '',
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Dados de Mary atualizados.');
  });

  it('o próprio perfil aparece, mas não pode ser trocado', async () => {
    renderizar('/usuarios?usuario=1');
    expect(await screen.findByLabelText('Nome')).toHaveValue('Lucimara');
    expect(screen.getByRole('radio', { name: 'Coordenação' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Professor(a)' })).toBeDisabled();
    expect(screen.getByText('O seu próprio perfil não pode ser alterado.')).toBeInTheDocument();
  });

  it('e-mail ou usuário repetidos aparecem no campo certo', async () => {
    api.post.mockRejectedValueOnce({ status: 409, message: 'E-mail já cadastrado nesta escola.' });
    api.post.mockRejectedValueOnce({ status: 409, message: 'Usuário já cadastrado nesta escola.' });
    renderizar('/usuarios?usuario=novo');
    await screen.findByText('Luiz');
    fireEvent.click(screen.getByRole('button', { name: 'Criar acesso' }));
    expect(await screen.findByText('E-mail já cadastrado nesta escola.')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Criar acesso' }));
    expect(await screen.findByText('Usuário já cadastrado nesta escola.')).toBeInTheDocument();
    expect(screen.getByLabelText('Usuário (opcional)')).toHaveAttribute('aria-invalid', 'true');
  });

  it('mostra os erros de validação da API junto aos campos', async () => {
    api.post.mockRejectedValue({
      status: 400,
      message: 'Dados inválidos.',
      details: [{ campo: 'senha', mensagem: 'A senha precisa ter pelo menos 6 caracteres.' }],
    });
    renderizar('/usuarios?usuario=novo');
    await screen.findByText('Luiz');
    fireEvent.click(screen.getByRole('button', { name: 'Criar acesso' }));
    expect(await screen.findByText('A senha precisa ter pelo menos 6 caracteres.')).toBeInTheDocument();
  });

  it('link para alguém que não existe fecha o painel', async () => {
    renderizar('/usuarios?usuario=99');
    await screen.findByText('Luiz');
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Editar usuário' })).not.toBeInTheDocument());
  });

  it('desativa o acesso de alguém após confirmar; o próprio acesso não tem o botão', async () => {
    api.patch.mockResolvedValue({ id: 2, ativo: false });
    renderizar();
    await screen.findByText('Luiz');
    fireEvent.click(linhaDe('Lucimara'));
    expect(screen.queryByRole('button', { name: 'Desativar acesso' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    fireEvent.click(await screen.findByRole('button', { name: /^Luiz/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Desativar acesso' }));
    await responderConfirmacao('Desativar', {
      name: 'Desativar o acesso de Luiz?',
      description: /A sessão da pessoa será encerrada imediatamente/,
    });
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/usuarios/2/desativar'));
    expect(await screen.findByRole('status')).toHaveTextContent('Acesso de Luiz desativado.');
  });

  it('acesso desativado aparece no fim da lista, apagado, e pode ser reativado', async () => {
    const comLuizDesativado = [
      ...USUARIOS.filter((u) => u.id !== 2),
      { id: 2, nome: 'Luiz', email: 'luiz@emmoo.com.br', login: 'luiz', papel: 'professor', ativo: false },
    ];
    api.get.mockImplementation(async (caminho) => (caminho.startsWith('/horarios') ? HORARIOS_LUIZ : comLuizDesativado));
    api.patch.mockResolvedValue({ id: 2, ativo: true });
    renderizar();
    await screen.findByText('Luiz');
    expect(linhas().map(textoDaLinha).at(-1)).toBe('LuizProfessor(a) · acesso desativado');
    expect(linhaDe('Luiz')).toHaveClass('linha-inativa');
    fireEvent.click(linhaDe('Luiz'));
    fireEvent.click(screen.getByRole('button', { name: 'Reativar acesso' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/usuarios/2/reativar'));
    expect(await screen.findByRole('status')).toHaveTextContent('Acesso de Luiz reativado.');
  });

  it('não desativa quando a pessoa desiste; erro da API aparece no painel', async () => {
    api.patch.mockRejectedValue(new Error('Este acesso já está desativado.'));
    renderizar('/usuarios?usuario=2');
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar acesso' }));
    await responderConfirmacao('Voltar');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.patch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Desativar acesso' }));
    await responderConfirmacao('Desativar');
    expect(await screen.findByRole('alert')).toHaveTextContent('Este acesso já está desativado.');
  });

  it('erro ao carregar e lista vazia', async () => {
    api.get.mockRejectedValueOnce(new Error('Falha de rede.'));
    const { unmount } = renderizar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha de rede.');
    unmount();
    api.get.mockResolvedValue([]);
    renderizar();
    expect(await screen.findByText('Nenhum usuário cadastrado.')).toBeInTheDocument();
  });
});
