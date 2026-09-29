import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import AgendaPage from './AgendaPage.jsx';

vi.mock('../api/index.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const USUARIOS = {
  coordenacao: { id: 1, nome: 'Lucimara', papel: 'coordenacao' },
  professor: { id: 2, nome: 'Luiz', papel: 'professor' },
  responsavel: { id: 3, nome: 'Mary', papel: 'responsavel' },
};

const AULAS = [
  {
    id: 1,
    data: '2026-10-05',
    hora: '14:00',
    duracaoMin: 45,
    status: 'agendada',
    aluno: { id: 1, nome: 'Ana Beatriz', instrumento: 'Violino' },
    professor: { id: 2, nome: 'Luiz' },
  },
  {
    id: 9,
    data: '2026-10-07',
    hora: '15:30',
    duracaoMin: 45,
    status: 'cancelada',
    aluno: { id: 2, nome: 'Pedro Henrique', instrumento: 'Violão' },
    professor: { id: 2, nome: 'Luiz' },
  },
];

/** Responde cada GET pelo prefixo mais longo que casar com o caminho. */
function simularRotas(rotas) {
  const prefixos = Object.keys(rotas).sort((a, b) => b.length - a.length);
  api.get.mockImplementation(async (caminho) => {
    const prefixo = prefixos.find((p) => caminho.startsWith(p));
    if (!prefixo) throw new Error(`GET não simulado: ${caminho}`);
    const resposta = rotas[prefixo];
    return typeof resposta === 'function' ? resposta(caminho) : resposta;
  });
}

function renderizar(papel) {
  return render(
    <AuthContext.Provider value={{ autenticado: true, usuario: USUARIOS[papel] }}>
      <AgendaPage />
    </AuthContext.Provider>,
  );
}

const itemDaAula = (nome) => screen.getByText(nome).closest('li');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); // só o relógio: os timers reais mantêm o findBy funcionando
  vi.setSystemTime(new Date(2026, 9, 5, 10, 0)); // segunda, 05/10/2026 — a aula da Ana é hoje
  vi.clearAllMocks();
  simularRotas({
    '/aulas': AULAS,
    '/alunos': [{ id: 2, nome: 'Pedro Henrique', instrumento: 'Violão' }],
    '/usuarios': [{ id: 2, nome: 'Luiz' }],
    '/horarios/livres': [
      { data: '2026-10-12', hora: '14:45', duracaoMin: 45 },
      { data: '2026-10-12', hora: '15:30', duracaoMin: 45 },
    ],
    '/horarios': [{ id: 1, diaSemana: 1, horaInicio: '14:00', duracaoMin: 45 }],
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AgendaPage — coordenação', () => {
  it('mostra a semana atual com as aulas de cada dia', async () => {
    renderizar('coordenacao');
    expect(await screen.findByText('Ana Beatriz')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/aulas?inicio=2026-10-05&fim=2026-10-11');
    expect(screen.getByText('5 – 11 out 2026')).toBeInTheDocument();

    const ana = itemDaAula('Ana Beatriz');
    expect(within(ana).getByText('14:45')).toBeInTheDocument(); // término
    expect(within(ana).getByText('Violino · Prof. Luiz')).toBeInTheDocument();
    expect(within(ana).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();

    const pedro = itemDaAula('Pedro Henrique');
    expect(within(pedro).getByText('Cancelada')).toBeInTheDocument();
    expect(within(pedro).queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();

    expect(screen.getByText('Segunda, 05/10').closest('article')).toHaveClass('dia-hoje');
    expect(await screen.findByText('1 aula agendada nesta semana')).toBeInTheDocument();
    expect(screen.queryByText(/Domingo/)).not.toBeInTheDocument(); // domingo sem aula fica oculto
  });

  it('navega entre semanas e volta para hoje', async () => {
    renderizar('coordenacao');
    await screen.findByText('Ana Beatriz');
    expect(screen.queryByRole('button', { name: 'Hoje' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));
    expect(await screen.findByText('12 – 18 out 2026')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/aulas?inicio=2026-10-12&fim=2026-10-18');

    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }));
    expect(await screen.findByText('5 – 11 out 2026')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    expect(await screen.findByText('28 set – 4 out 2026')).toBeInTheDocument();
  });

  it('filtra por professor e mostra os horários de atendimento dele', async () => {
    renderizar('coordenacao');
    await screen.findByText('Agendar aula');
    expect(screen.queryByText('Horários de atendimento')).not.toBeInTheDocument();
    const [filtro] = screen.getAllByLabelText('Professor(a)'); // o filtro vem antes do formulário
    fireEvent.change(filtro, { target: { value: '2' } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/aulas?inicio=2026-10-05&fim=2026-10-11&professorId=2'));
    expect(await screen.findByText('Horários de atendimento')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/horarios?professorId=2');
  });

  it('cancela a aula após confirmação e recarrega a semana', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.patch.mockResolvedValue({});
    renderizar('coordenacao');
    await screen.findByText('Ana Beatriz');
    const chamadasAntes = api.get.mock.calls.filter(([caminho]) => caminho.startsWith('/aulas')).length;

    fireEvent.click(within(itemDaAula('Ana Beatriz')).getByRole('button', { name: 'Cancelar' }));
    expect(window.confirm).toHaveBeenCalledWith('Cancelar a aula de Ana Beatriz em Segunda, 05/10 às 14:00?');
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/aulas/1/cancelar'));
    await waitFor(() =>
      expect(api.get.mock.calls.filter(([caminho]) => caminho.startsWith('/aulas')).length).toBe(chamadasAntes + 1),
    );
  });

  it('aula de dia anterior não oferece cancelamento', async () => {
    vi.setSystemTime(new Date(2026, 9, 7, 10, 0)); // quarta: a aula de segunda já passou
    renderizar('coordenacao');
    await screen.findByText('Ana Beatriz');
    expect(within(itemDaAula('Ana Beatriz')).queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
    expect(await screen.findByLabelText('Data')).toHaveAttribute('min', '2026-10-07');
  });

  it('não cancela quando o usuário desiste', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderizar('coordenacao');
    await screen.findByText('Ana Beatriz');
    fireEvent.click(within(itemDaAula('Ana Beatriz')).getByRole('button', { name: 'Cancelar' }));
    expect(api.patch).not.toHaveBeenCalled();
  });

  it('agenda aula escolhendo um horário livre sugerido', async () => {
    api.post.mockResolvedValue([{ id: 30, data: '2026-10-12', hora: '14:45' }]);
    renderizar('coordenacao');
    await screen.findByText('Agendar aula');

    fireEvent.change(screen.getByLabelText('Aluno'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-10-12' } });
    expect(await screen.findByText('Horários livres — Segunda, 12/10:')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/horarios/livres?professorId=2&inicio=2026-10-12&fim=2026-10-12');

    const vaga = screen.getByRole('button', { name: '14:45' });
    fireEvent.click(vaga);
    expect(vaga).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Hora')).toHaveValue('14:45');

    fireEvent.change(screen.getByLabelText('Repetir por (semanas)'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agendar' }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/aulas', {
        alunoId: 2,
        professorId: 2,
        data: '2026-10-12',
        hora: '14:45',
        semanas: 4,
      }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('1 aula agendada.');
    expect(await screen.findByText('12 – 18 out 2026')).toBeInTheDocument(); // vai para a semana da aula
  });

  it('mostra o conflito de agenda junto ao campo hora', async () => {
    api.post.mockRejectedValue({
      message: 'Conflito de agenda.',
      details: [{ campo: 'hora', mensagem: '12/10/2026 às 14:00: o professor já tem aula das 14:00 (45 min).' }],
    });
    renderizar('coordenacao');
    await screen.findByText('Agendar aula');
    fireEvent.click(screen.getByRole('button', { name: 'Agendar' }));
    expect(await screen.findByText(/o professor já tem aula das 14:00/)).toBeInTheDocument();
  });

  it('informa quando não há horário livre no dia', async () => {
    simularRotas({
      '/aulas': [],
      '/alunos': [],
      '/usuarios': [{ id: 2, nome: 'Luiz' }],
      '/horarios/livres': [],
    });
    renderizar('coordenacao');
    await screen.findByText('Agendar aula');
    expect(screen.getAllByText('Sem aulas')).toHaveLength(6);
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-10-13' } });
    expect(await screen.findByText('nenhum neste dia.')).toBeInTheDocument();
  });
});

describe('AgendaPage — professor e responsável', () => {
  it('professor vê as próprias aulas, sem formulário de agendamento, e gerencia seus horários', async () => {
    api.post.mockResolvedValue({});
    api.delete.mockResolvedValue(null);
    renderizar('professor');
    expect(await screen.findByText('Ana Beatriz')).toBeInTheDocument();
    expect(within(itemDaAula('Ana Beatriz')).getByText('Violino')).toBeInTheDocument(); // sem "Prof. Luiz"
    expect(screen.queryByText('Agendar aula')).not.toBeInTheDocument();

    expect(await screen.findByText('Horários de atendimento')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/horarios');
    expect(await screen.findByText('45 min')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Início'), { target: { value: '09:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar horário' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/horarios', { diaSemana: 1, horaInicio: '09:00', duracaoMin: 45 }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Remover Segunda 14:00' }));
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/horarios/1'));
  });

  it('mostra erro de validação ao adicionar horário', async () => {
    api.post.mockRejectedValue({
      message: 'O horário se sobrepõe a outro já cadastrado.',
      details: [{ campo: 'horaInicio', mensagem: 'Sobrepõe o horário de segunda-feira às 14:00 (45 min).' }],
    });
    renderizar('professor');
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar horário' }));
    expect(await screen.findByText(/Sobrepõe o horário de segunda-feira/)).toBeInTheDocument();
  });

  it('responsável só consulta as aulas dos dependentes', async () => {
    renderizar('responsavel');
    expect(await screen.findByText('Ana Beatriz')).toBeInTheDocument();
    expect(screen.getByText('Aulas dos seus dependentes.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
    expect(screen.queryByText('Horários de atendimento')).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/usuarios?papel=professor');
  });

  it('exibe o erro quando a agenda não carrega', async () => {
    api.get.mockRejectedValue(new Error('Não foi possível conectar ao servidor.'));
    renderizar('responsavel');
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível conectar ao servidor.');
  });
});
