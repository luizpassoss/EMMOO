import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { responderConfirmacao } from '../apoioTestes.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import AgendaPage, { aindaNaoComecou } from './AgendaPage.jsx';

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
    status: 'falta', // a API não manda cancelada; realizada e falta aparecem, com selo
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
      <MemoryRouter initialEntries={['/agenda']}>
        <Routes>
          <Route path="/agenda" element={<AgendaPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const itemDaAula = (nome) => screen.getByText(nome).closest('li');

/** O formulário de agendamento abre pelo botão do cabeçalho. */
async function abrirAgendamento() {
  fireEvent.click(await screen.findByRole('button', { name: 'Agendar aula' }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); // só o relógio: os timers reais mantêm o findBy funcionando
  vi.setSystemTime(new Date(2026, 9, 5, 10, 0)); // segunda, 05/10/2026 — a aula da Ana é hoje
  vi.clearAllMocks();
  simularRotas({
    '/aulas': AULAS,
    '/alunos': [{ id: 2, nome: 'Pedro Henrique', instrumento: 'Violão', planoId: 2 }],
    '/usuarios': [{ id: 2, nome: 'Luiz' }],
    '/planos': [{ id: 2, nome: 'Particular · 2 aulas por semana', freqSemanal: 2, duracaoMin: 45 }],
    '/horarios/livres': [
      { data: '2026-10-12', hora: '14:45', duracaoMin: 45 },
      { data: '2026-10-12', hora: '15:30', duracaoMin: 45 },
    ],
    '/horarios': [{ id: 1, diaSemana: 1, horaInicio: '14:00', duracaoMin: 45 }],
    '/feriados': [],
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('regras de exibição da agenda', () => {
  it('aula ainda não começou: dia seguinte ou hoje depois de agora', () => {
    const aAs14 = { data: '2026-10-05', hora: '14:00' };
    expect(aindaNaoComecou(aAs14, '2026-10-05', '13:59')).toBe(true);
    expect(aindaNaoComecou(aAs14, '2026-10-05', '14:00')).toBe(false);
    expect(aindaNaoComecou(aAs14, '2026-10-04', '23:00')).toBe(true);
    expect(aindaNaoComecou(aAs14, '2026-10-06', '08:00')).toBe(false);
  });
});

describe('AgendaPage — coordenação', () => {
  it('mostra a semana atual com as aulas de cada dia', async () => {
    renderizar('coordenacao');
    expect(await screen.findByText('Ana Beatriz')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/aulas?inicio=2026-10-05&fim=2026-10-11');
    expect(screen.getByText('5 – 11 out 2026')).toBeInTheDocument();

    const ana = itemDaAula('Ana Beatriz');
    expect(within(ana).queryByText('14:45')).not.toBeInTheDocument(); // só o início: o término é ruído
    expect(within(ana).getByText('Violino')).toBeInTheDocument(); // um professor só: o nome dele seria redundante
    expect(within(ana).getByRole('button', { name: 'Cancelar aula de Ana Beatriz às 14:00' })).toBeInTheDocument();

    const pedro = itemDaAula('Pedro Henrique');
    expect(within(pedro).getByText('Falta')).toBeInTheDocument();
    expect(within(pedro).queryByRole('button', { name: /Cancelar aula/ })).not.toBeInTheDocument();

    const segunda = screen.getByRole('heading', { name: 'Segunda, 05/10' }).closest('article');
    expect(segunda).toHaveClass('dia-hoje');
    expect(segunda).toHaveAttribute('aria-current', 'date');
    expect(within(segunda).getByText('Seg')).toBeInTheDocument();
    expect(within(ana).queryByText('Agendada')).not.toBeInTheDocument(); // o normal não ganha selo
    expect(screen.queryByText(/nesta semana/)).not.toBeInTheDocument(); // sem contagem: a lista já mostra
    expect(screen.queryByRole('heading', { name: /Domingo/ })).not.toBeInTheDocument(); // domingo sem aula fica oculto
  });

  it('faixa de dias (celular): resume cada dia e leva até ele', async () => {
    const rolar = vi.fn();
    Element.prototype.scrollIntoView = rolar; // o jsdom não implementa
    try {
      renderizar('coordenacao');
      await screen.findByText('Ana Beatriz');
      const faixa = screen.getByRole('navigation', { name: 'Dias desta janela' });
      const botoes = within(faixa).getAllByRole('button');
      expect(botoes.map((botao) => botao.getAttribute('aria-label'))).toEqual([
        'Segunda, 05/10: 1 aula',
        'Terça, 06/10: sem aulas',
        'Quarta, 07/10: 1 aula',
        'Quinta, 08/10: sem aulas',
        'Sexta, 09/10: sem aulas',
        'Sábado, 10/10: sem aulas', // domingo sem aula fica fora, como na lista
      ]);
      expect(botoes[0]).toHaveClass('hoje', 'com-aula');
      expect(botoes[1]).not.toHaveClass('com-aula');

      const animar = vi.fn();
      Element.prototype.animate = animar;
      fireEvent.click(within(faixa).getByRole('button', { name: 'Quarta, 07/10: 1 aula' }));
      expect(rolar).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
      const quarta = screen.getByRole('heading', { name: 'Quarta, 07/10' });
      expect(quarta).toHaveFocus();
      expect(animar.mock.contexts[0]).toBe(quarta); // um pulso no dia, para mostrar onde se chegou
    } finally {
      delete Element.prototype.scrollIntoView;
      delete Element.prototype.animate;
    }
  });

  it('anda de 7 em 7 dias a partir de hoje e não volta para antes de hoje', async () => {
    renderizar('coordenacao');
    await screen.findByText('Ana Beatriz');
    expect(screen.queryByRole('button', { name: 'Hoje' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semana anterior' })).toBeDisabled(); // a agenda começa hoje

    fireEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));
    expect(await screen.findByText('12 – 18 out 2026')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/aulas?inicio=2026-10-12&fim=2026-10-18');
    expect(screen.getByRole('button', { name: 'Semana anterior' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    expect(await screen.findByText('5 – 11 out 2026')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Semana anterior' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Hoje' }));
    expect(await screen.findByText('5 – 11 out 2026')).toBeInTheDocument();
  });

  it('a nova janela entra deslizando do lado para onde se andou', async () => {
    renderizar('coordenacao');
    await screen.findByText('Ana Beatriz');
    expect(document.querySelector('.semana')).not.toHaveClass('entra-proxima'); // ao abrir, sem deslizar
    fireEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));
    expect(await screen.findByText('12 – 18 out 2026')).toBeInTheDocument();
    expect(document.querySelector('.semana')).toHaveClass('entra-proxima');
    expect(document.querySelector('.tira-dias')).toHaveClass('entra-proxima');
    fireEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    expect(await screen.findByText('5 – 11 out 2026')).toBeInTheDocument();
    expect(document.querySelector('.semana')).toHaveClass('entra-anterior');
  });

  it('dia sem aula: a coordenação agenda direto nele, com a data já preenchida', async () => {
    renderizar('coordenacao');
    await screen.findByText('Ana Beatriz');
    expect(screen.queryByRole('button', { name: 'Agendar aula em Segunda, 05/10' })).not.toBeInTheDocument(); // dia com aula
    fireEvent.click(await screen.findByRole('button', { name: 'Agendar aula em Terça, 06/10' }));
    expect(screen.getByRole('heading', { name: 'Agendar aula' })).toBeInTheDocument();
    expect(screen.getByLabelText('Data')).toHaveValue('2026-10-06');
    // Professor único já escolhido + data: os horários disponíveis do dia já aparecem.
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/horarios/livres?professorId=2&inicio=2026-10-06&fim=2026-10-06'));
    // Nada foi digitado ainda: fechar não pergunta nada.
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('agendamento: consultar datas não pede confirmação; com aluno escolhido, fechar pergunta antes', async () => {
    renderizar('coordenacao');
    await abrirAgendamento();
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-10-12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(); // só consultou as vagas
    await abrirAgendamento();
    fireEvent.change(screen.getByLabelText('Aluno'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await responderConfirmacao('Voltar', { name: 'Descartar as alterações?' });
    expect(screen.getByLabelText('Aluno')).toHaveValue('2');
  });

  it('a aula cancelada encolhe antes de sair, quando o navegador anima', async () => {
    const animar = vi.fn(() => ({ finished: Promise.resolve() }));
    Element.prototype.animate = animar;
    try {
      api.patch.mockResolvedValue({});
      renderizar('coordenacao');
      await screen.findByText('Ana Beatriz');
      fireEvent.click(within(itemDaAula('Ana Beatriz')).getByRole('button', { name: /Cancelar aula/ }));
      await responderConfirmacao('Cancelar aula');
      await waitFor(() => expect(animar).toHaveBeenCalled());
      expect(animar.mock.contexts[0]).toHaveAttribute('data-aula', '1');
      await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('cancelada.'));
    } finally {
      delete Element.prototype.animate;
    }
  });

  it('a janela começa no dia de hoje, não na segunda-feira', async () => {
    vi.setSystemTime(new Date(2026, 9, 8, 10, 0)); // quinta, 08/10
    renderizar('coordenacao');
    expect(await screen.findByText('8 – 14 out 2026')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/aulas?inicio=2026-10-08&fim=2026-10-14');
    expect(screen.queryByRole('heading', { name: 'Segunda, 05/10' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Segunda, 12/10' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Domingo/ })).not.toBeInTheDocument(); // domingo sem aula, oculto
  });

  it('filtra por professor e mostra os horários de atendimento dele', async () => {
    renderizar('coordenacao');
    await screen.findByRole('button', { name: 'Agendar aula' });
    expect(screen.queryByText('Horários de atendimento')).not.toBeInTheDocument();
    const [filtro] = screen.getAllByLabelText('Professor(a)'); // o filtro vem antes do formulário
    fireEvent.change(filtro, { target: { value: '2' } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/aulas?inicio=2026-10-05&fim=2026-10-11&professorId=2'));
    expect(await screen.findByText('Horários de atendimento')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/horarios?professorId=2');
  });

  it('cancela a aula após confirmação: ela some do calendário e um aviso confirma', async () => {
    let cancelada = false;
    simularRotas({
      '/aulas': () => (cancelada ? AULAS.filter((aula) => aula.id !== 1) : AULAS), // a API para de mandar a cancelada
      '/feriados': [],
      '/alunos': [],
      '/usuarios': [{ id: 2, nome: 'Luiz' }],
      '/planos': [],
    });
    api.patch.mockImplementation(async () => {
      cancelada = true;
      return {};
    });
    renderizar('coordenacao');
    await screen.findByText('Ana Beatriz');

    fireEvent.click(within(itemDaAula('Ana Beatriz')).getByRole('button', { name: /Cancelar aula/ }));
    await responderConfirmacao('Cancelar aula', {
      name: 'Cancelar esta aula?',
      description:
        'Ana Beatriz · Segunda, 05/10 às 14:00. O horário ficará disponível para outro aluno. ' +
        'Como o cancelamento é da escola, o aluno poderá repor a aula.',
    });
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/aulas/1/cancelar'));
    await waitFor(() => expect(screen.queryByText('Ana Beatriz')).not.toBeInTheDocument());
    expect(screen.getByRole('status')).toHaveTextContent('Aula de Ana Beatriz em Segunda, 05/10 às 14:00 cancelada.');
    // Ao ir e voltar de semana, ela continua fora.
    fireEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Semana anterior' }));
    expect(await screen.findByText('5 – 11 out 2026')).toBeInTheDocument();
    await screen.findByText('Pedro Henrique');
    expect(screen.queryByText('Ana Beatriz')).not.toBeInTheDocument();
  });

  it('aula em andamento continua visível, mas sem cancelamento', async () => {
    vi.setSystemTime(new Date(2026, 9, 5, 14, 10)); // segunda, 14:10: a aula da Ana (14:00–14:45) está acontecendo
    renderizar('coordenacao');
    await screen.findByText('Ana Beatriz');
    expect(within(itemDaAula('Ana Beatriz')).queryByRole('button', { name: /Cancelar aula/ })).not.toBeInTheDocument();
  });

  it('aula que já terminou some do calendário', async () => {
    vi.setSystemTime(new Date(2026, 9, 5, 14, 45)); // segunda, 14:45: a aula da Ana acabou
    renderizar('coordenacao');
    await screen.findByText('Pedro Henrique'); // a de quarta continua
    expect(screen.queryByText('Ana Beatriz')).not.toBeInTheDocument();
    const segunda = screen.getByRole('heading', { name: 'Segunda, 05/10' }).closest('article');
    expect(within(segunda).getByText('Sem aulas')).toBeInTheDocument();
    expect(segunda).toHaveClass('dia-livre'); // dia sem aula fica mais leve
    expect(screen.getByRole('button', { name: 'Segunda, 05/10: sem aulas' })).not.toHaveClass('com-aula');
  });

  it('dias que já passaram não aparecem nem são pedidos à API', async () => {
    vi.setSystemTime(new Date(2026, 9, 7, 10, 0)); // quarta: a aula de segunda já passou
    renderizar('coordenacao');
    await screen.findByText('Pedro Henrique');
    expect(api.get).toHaveBeenCalledWith('/aulas?inicio=2026-10-07&fim=2026-10-13');
    expect(screen.queryByText('Ana Beatriz')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Segunda, 05/10' })).not.toBeInTheDocument();
    await abrirAgendamento();
    expect(screen.getByLabelText('Data')).toHaveAttribute('min', '2026-10-07');
  });

  it('o formulário de agendamento abre pelo botão e fecha pelo X', async () => {
    renderizar('coordenacao');
    await abrirAgendamento();
    expect(screen.getByRole('heading', { name: 'Agendar aula' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Agendar aula' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('heading', { name: 'Agendar aula' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agendar aula' })).toBeInTheDocument();
  });

  it('não cancela quando o usuário desiste', async () => {
    renderizar('coordenacao');
    await screen.findByText('Ana Beatriz');
    fireEvent.click(within(itemDaAula('Ana Beatriz')).getByRole('button', { name: /Cancelar aula/ }));
    await responderConfirmacao('Voltar');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.patch).not.toHaveBeenCalled();
    expect(screen.getByText('Ana Beatriz')).toBeInTheDocument();
  });

  it('agenda aula escolhendo um horário livre sugerido', async () => {
    api.post.mockResolvedValue([{ id: 30, data: '2026-10-12', hora: '14:45' }]);
    renderizar('coordenacao');
    await abrirAgendamento();

    fireEvent.change(screen.getByLabelText('Aluno'), { target: { value: '2' } });
    // Plano de 2 aulas por semana: o formulário lembra que são dois horários.
    expect(
      screen.getByText('Pedro Henrique tem 2 aulas por semana: agende um horário para cada uma.'),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-10-12' } });
    expect(await screen.findByText('Horários disponíveis em Segunda, 12/10')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/horarios/livres?professorId=2&inicio=2026-10-12&fim=2026-10-12');

    const vaga = screen.getByRole('button', { name: '14:45' });
    fireEvent.click(vaga);
    expect(vaga).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Horário')).toHaveValue('14:45');

    fireEvent.change(screen.getByLabelText('Semanas seguidas'), { target: { value: '4' } });
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
    // Pediu 4 semanas e vieram 1: as outras caíram em feriado ou recesso.
    expect(await screen.findByRole('status')).toHaveTextContent('1 aula agendada. 3 datas não foram agendadas por coincidir com feriado ou recesso.');
    expect(await screen.findByText('12 – 18 out 2026')).toBeInTheDocument(); // vai para a semana da aula
  });

  it('professor sem horários de atendimento: o agendamento explica e leva a definir', async () => {
    simularRotas({
      '/aulas': AULAS,
      '/alunos': [{ id: 2, nome: 'Pedro Henrique', instrumento: 'Violão', planoId: 2 }],
      '/usuarios': [{ id: 5, nome: 'Ronan' }],
      '/planos': [],
      '/horarios/livres': [],
      '/horarios': [],
      '/feriados': [],
    });
    renderizar('coordenacao');
    await abrirAgendamento();
    expect(await screen.findByText(/Ronan ainda não tem horários de atendimento/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Definir os horários' })).toHaveAttribute('href', '/usuarios?usuario=5');
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-10-12' } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/horarios/livres?professorId=5&inicio=2026-10-12&fim=2026-10-12'));
    expect(screen.queryByText('Nenhum horário disponível neste dia.')).not.toBeInTheDocument(); // o aviso já explica
  });

  it('/agenda?professor=2 abre filtrada, com os horários de atendimento dele', async () => {
    simularRotas({
      '/aulas': AULAS,
      '/alunos': [],
      '/usuarios': [
        { id: 2, nome: 'Luiz' },
        { id: 5, nome: 'Ronan' },
      ],
      '/planos': [],
      '/horarios': [{ id: 1, diaSemana: 1, horaInicio: '14:00', duracaoMin: 45 }],
      '/feriados': [],
    });
    render(
      <AuthContext.Provider value={{ autenticado: true, usuario: USUARIOS.coordenacao }}>
        <MemoryRouter initialEntries={['/agenda?professor=2']}>
          <Routes>
            <Route path="/agenda" element={<AgendaPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
    expect(await screen.findByRole('heading', { name: 'Horários de atendimento' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Professor(a)' })).toHaveValue('2'));
    expect(api.get).toHaveBeenCalledWith(expect.stringMatching(/^\/aulas\?inicio=.*&professorId=2$/));
  });

  it('dia de feriado diz o motivo no lugar de "Sem aulas"', async () => {
    simularRotas({
      '/aulas': AULAS,
      '/feriados': [{ id: 1, descricao: 'Recesso', inicio: '2026-10-08', fim: '2026-10-09' }],
      '/alunos': [],
      '/usuarios': [{ id: 2, nome: 'Luiz' }],
      '/planos': [],
    });
    renderizar('professor');
    const quinta = (await screen.findByRole('heading', { name: 'Quinta, 08/10' })).closest('article');
    expect(await within(quinta).findByText('Recesso · sem aula')).toBeInTheDocument();
    expect(within(quinta).queryByText('Sem aulas')).not.toBeInTheDocument();
    const sexta = screen.getByRole('heading', { name: 'Sexta, 09/10' }).closest('article');
    expect(within(sexta).getByText('Recesso · sem aula')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quinta, 08/10: Recesso, sem aulas' })).toHaveClass('feriado');
    expect(api.get).toHaveBeenCalledWith('/feriados?inicio=2026-10-05&fim=2026-10-11');
    expect(screen.queryByText('Feriados e recessos')).not.toBeInTheDocument(); // só a coordenação gerencia
  });

  it('professor com acesso desativado não aparece para agendar aula nova', async () => {
    simularRotas({
      '/aulas': [],
      '/feriados': [],
      '/alunos': [],
      '/usuarios': [
        { id: 2, nome: 'Luiz', ativo: true },
        { id: 5, nome: 'Rui', ativo: false },
      ],
      '/planos': [],
    });
    renderizar('coordenacao');
    await abrirAgendamento();
    // Com o formulário aberto, ele vem antes do filtro da semana (que continua mostrando todos).
    const [doFormulario, filtro] = screen.getAllByLabelText('Professor(a)');
    expect(within(doFormulario).getAllByRole('option').map((opcao) => opcao.textContent)).toEqual(['Selecione…', 'Luiz']);
    expect(within(filtro).getAllByRole('option')).toHaveLength(3);
  });

  it('mostra o conflito de agenda junto ao campo hora', async () => {
    api.post.mockRejectedValue({
      message: 'Conflito de agenda.',
      details: [{ campo: 'hora', mensagem: '12/10/2026 às 14:00: o professor já tem aula das 14:00 (45 min).' }],
    });
    renderizar('coordenacao');
    await abrirAgendamento();
    fireEvent.click(screen.getByRole('button', { name: 'Agendar' }));
    expect(await screen.findByText(/o professor já tem aula das 14:00/)).toBeInTheDocument();
  });

  it('plano de 1 aula por semana não mostra dica: não há nada a acrescentar', async () => {
    simularRotas({
      '/aulas': [],
      '/alunos': [{ id: 1, nome: 'Ana Beatriz', instrumento: 'Violino', planoId: 1 }],
      '/usuarios': [{ id: 2, nome: 'Luiz' }],
      '/planos': [{ id: 1, nome: 'Particular · 1 aula por semana', freqSemanal: 1, duracaoMin: 45 }],
    });
    renderizar('coordenacao');
    await abrirAgendamento();
    fireEvent.change(screen.getByLabelText('Aluno'), { target: { value: '1' } });
    expect(screen.queryByText(/aulas por semana/)).not.toBeInTheDocument();
  });

  it('informa quando não há horário livre no dia', async () => {
    simularRotas({
      '/aulas': [],
      '/alunos': [],
      '/usuarios': [{ id: 2, nome: 'Luiz' }],
      '/planos': [],
      '/horarios/livres': [],
    });
    renderizar('coordenacao');
    await abrirAgendamento();
    expect(screen.getAllByText('Sem aulas')).toHaveLength(6);
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-10-13' } });
    expect(await screen.findByText('Nenhum horário disponível neste dia.')).toBeInTheDocument();
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

    // No fim da agenda, os horários vêm recolhidos (título e total); tocar no título abre.
    const titulo = await screen.findByRole('button', { name: /Horários de atendimento.*1 horário/ });
    expect(titulo).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Remover Segunda 14:00' })).not.toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/horarios');
    fireEvent.click(titulo);
    expect(await screen.findByRole('button', { name: 'Remover Segunda 14:00' })).toBeInTheDocument();

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
    fireEvent.click(await screen.findByRole('button', { name: /Horários de atendimento/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Adicionar horário' }));
    expect(await screen.findByText(/Sobrepõe o horário de segunda-feira/)).toBeInTheDocument();
  });

  it('responsável só consulta as aulas dos dependentes', async () => {
    renderizar('responsavel');
    expect(await screen.findByText('Ana Beatriz')).toBeInTheDocument();
    expect(within(itemDaAula('Ana Beatriz')).getByText('Violino · Prof. Luiz')).toBeInTheDocument(); // o responsável vê o professor
    expect(screen.queryByRole('button', { name: /Cancelar aula/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Agendar aula em/ })).not.toBeInTheDocument(); // só a coordenação agenda
    expect(screen.queryByText('Horários de atendimento')).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/usuarios?papel=professor');
  });

  it('exibe o erro quando a agenda não carrega', async () => {
    api.get.mockRejectedValue(new Error('Não foi possível conectar ao servidor.'));
    renderizar('responsavel');
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível conectar ao servidor.');
  });
});

describe('AgendaPage — agendamento já preenchido (atalho "Alunos para agendar")', () => {
  function renderizarEm(endereco) {
    return render(
      <AuthContext.Provider value={{ autenticado: true, usuario: USUARIOS.coordenacao }}>
        <MemoryRouter initialEntries={[endereco]}>
          <Routes>
            <Route path="/agenda" element={<AgendaPage />} />
          </Routes>
        </MemoryRouter>
      </AuthContext.Provider>,
    );
  }

  it('abre com aluno, professor, data, horário e semanas da renovação; fechar não pergunta nada', async () => {
    renderizarEm('/agenda?aula=2026-10-12&alunoId=2&professorId=2&hora=14:45&semanas=12');
    const form = await screen.findByRole('dialog', { name: 'Agendar aula' });
    expect(within(form).getByLabelText('Aluno')).toHaveValue('2');
    expect(within(form).getByLabelText('Professor(a)')).toHaveValue('2');
    expect(within(form).getByLabelText('Data')).toHaveValue('2026-10-12');
    expect(within(form).getByLabelText('Horário')).toHaveValue('14:45');
    expect(within(form).getByLabelText('Semanas seguidas')).toHaveValue(12);
    expect(await within(form).findByRole('button', { name: '14:45', pressed: true })).toBeInTheDocument();
    fireEvent.click(within(form).getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Agendar aula' })).not.toBeInTheDocument();
    // O preenchimento saiu da URL: abrir de novo começa vazio.
    await abrirAgendamento();
    expect(within(screen.getByRole('dialog', { name: 'Agendar aula' })).getByLabelText('Aluno')).toHaveValue('');
  });

  it('ignora do link o que não existe (aluno inativo, professor desconhecido, horário ou semanas inválidos)', async () => {
    renderizarEm('/agenda?aula=nova&alunoId=99&professorId=7&hora=25:00&semanas=40');
    const form = await screen.findByRole('dialog', { name: 'Agendar aula' });
    expect(within(form).getByLabelText('Aluno')).toHaveValue('');
    expect(within(form).getByLabelText('Professor(a)')).toHaveValue('2'); // o único professor, como sempre
    expect(within(form).getByLabelText('Horário')).toHaveValue('');
    expect(within(form).getByLabelText('Semanas seguidas')).toHaveValue(1);
  });
});
