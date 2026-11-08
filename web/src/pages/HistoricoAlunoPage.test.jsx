import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import { salvarArquivo } from '../utils/arquivo.js';
import HistoricoAlunoPage from './HistoricoAlunoPage.jsx';

vi.mock('../api/index.js', () => ({ api: { get: vi.fn(), baixar: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() } }));
vi.mock('../utils/arquivo.js', () => ({ salvarArquivo: vi.fn() }));

const aula = (id, data, status, extra = {}) => ({
  id,
  alunoId: 1,
  data,
  hora: '14:00',
  duracaoMin: 45,
  status,
  reposicao: false,
  faltaAvisada: false,
  professor: { id: 2, nome: 'Luiz' },
  aluno: { id: 1, nome: 'Ana Beatriz', instrumento: 'Violino' },
  diario: null,
  ...extra,
});

const HISTORICO = {
  aluno: {
    id: 1,
    nome: 'Ana Beatriz',
    instrumento: 'Violino',
    status: 'ativo',
    contato: '(47) 99999-0001',
    plano: { id: 1, nome: 'Particular · 1 aula por semana' },
    responsavel: { id: 3, nome: 'Mary' },
  },
  resumo: { presencas: 1, faltas: 1, percentual: 50, reposicoes: 1, emAberto: { quantidade: 1, valor: 140 } },
  aulas: [
    aula(2, '2026-10-12', 'falta', { faltaAvisada: true }),
    aula(1, '2026-10-05', 'realizada', { diario: { conteudoMinistrado: 'Escalas maiores', planoProxima: 'Arpejos' } }),
  ],
  proximas: [aula(17, '2026-10-19', 'agendada', { reposicao: true, hora: '14:45' })],
  reposicoes: [{ aula: { id: 17, data: '2026-10-19', hora: '14:45' }, de: { id: 2, data: '2026-10-12', hora: '14:00' } }],
  solicitacoes: [
    { id: 3, tipo: 'remarcacao', dataSolicitacao: '2026-10-08T12:00:00.000Z', liberaReposicao: false, novaData: '2026-10-27T15:00', dataAnterior: '2026-10-26T14:00', aula: { id: 4, data: '2026-10-27', hora: '15:00' } },
    { id: 2, tipo: 'reposicao', dataSolicitacao: '2026-10-07T12:00:00.000Z', liberaReposicao: false, novaData: '2026-10-19T14:45', aula: { id: 2, data: '2026-10-12', hora: '14:00' } },
    { id: 1, tipo: 'falta', dataSolicitacao: '2026-10-07T11:00:00.000Z', liberaReposicao: true, novaData: null, aula: { id: 2, data: '2026-10-12', hora: '14:00' } },
  ],
  mensalidades: [
    { id: 1, mesReferencia: '2026-10', valor: 140, vencimento: '2026-10-12', status: 'pendente', dataPagamento: null, formaPagamentoNome: null },
    { id: 0, mesReferencia: '2026-09', valor: 140, vencimento: '2026-09-10', status: 'paga', dataPagamento: '2026-09-08', formaPagamentoNome: 'Pix' },
    { id: -1, mesReferencia: '2026-08', valor: 70, vencimento: '2026-08-10', status: 'cancelada', dataPagamento: null, formaPagamentoNome: null },
  ],
};

function renderizar(papel = 'coordenacao') {
  return render(
    <AuthContext.Provider value={{ autenticado: true, usuario: { id: 1, nome: 'Lucimara', papel } }}>
      <MemoryRouter initialEntries={['/alunos/1']}>
        <Routes>
          <Route path="/alunos/:id" element={<HistoricoAlunoPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 17, 10, 0));
  vi.clearAllMocks();
  api.get.mockResolvedValue(HISTORICO);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HistoricoAlunoPage (RF14)', () => {
  it('reúne presença, diário, reposições, avisos e mensalidades do aluno', async () => {
    renderizar();
    expect(await screen.findByRole('heading', { name: 'Ana Beatriz', level: 1 })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/alunos/1/historico');
    expect(screen.getByText('Violino · Particular · 1 aula por semana · Responsável: Mary')).toBeInTheDocument();
    expect(screen.getByText('Presença').nextSibling).toHaveTextContent('50%');
    expect(screen.getByText('Em aberto').nextSibling).toHaveTextContent(/R\$\s140,00/);
    expect(screen.getByRole('link', { name: '(47) 99999-0001' })).toHaveAttribute('href', 'tel:+5547999990001');
    expect(screen.getByRole('link', { name: 'Editar cadastro' })).toHaveAttribute('href', '/alunos?aluno=1');

    expect(screen.getByText('Escalas maiores')).toBeInTheDocument(); // o diário aparece na aula
    expect(screen.getByText('Falta avisada')).toBeInTheDocument();
    expect(screen.getByText('Prof. Luiz · Reposição')).toBeInTheDocument();
    expect(screen.getByText('Falta avisada da aula de 12/10 às 14:00, com direito a reposição.')).toBeInTheDocument();
    expect(screen.getByText('Reposição da aula de 12/10 às 14:00 marcada para 19/10 às 14:45.')).toBeInTheDocument();
    expect(screen.getByText('Aula remarcada de 26/10 às 14:00 para 27/10 às 15:00.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Faltas, reposições e remarcações' })).toBeInTheDocument();
    expect(screen.getByText('Cobrança cancelada pela escola')).toBeInTheDocument();
    expect(screen.getByText('Setembro de 2026')).toBeInTheDocument();
    expect(screen.getByText('Paga em 08/09/2026 · Pix')).toBeInTheDocument();
  });

  it('baixa o recibo de uma mensalidade paga', async () => {
    api.baixar.mockResolvedValue({ conteudo: new Blob(['%PDF']), arquivo: 'recibo-2026-09-ana-beatriz.pdf' });
    renderizar('responsavel');
    fireEvent.click(await screen.findByRole('button', { name: 'Baixar recibo de setembro de 2026' }));
    await waitFor(() => expect(salvarArquivo).toHaveBeenCalledWith(expect.any(Blob), 'recibo-2026-09-ana-beatriz.pdf'));
    expect(screen.queryByRole('link', { name: 'Editar cadastro' })).not.toBeInTheDocument();
  });

  it('professor: sem financeiro nem edição', async () => {
    const { contato, ...semContato } = HISTORICO.aluno;
    expect(contato).toBeDefined();
    api.get.mockResolvedValue({
      ...HISTORICO,
      aluno: semContato,
      resumo: { ...HISTORICO.resumo, emAberto: undefined },
      mensalidades: [],
    });
    renderizar('professor');
    await screen.findByRole('heading', { name: 'Ana Beatriz', level: 1 });
    expect(screen.queryByRole('heading', { name: 'Mensalidades' })).not.toBeInTheDocument();
    expect(screen.queryByText('Em aberto')).not.toBeInTheDocument();
    expect(screen.queryByText(/Contato:/)).not.toBeInTheDocument();
  });

  it('muitas aulas: mostra as mais recentes e "Ver todas"', async () => {
    const muitas = Array.from({ length: 10 }, (_, i) => aula(100 + i, `2026-09-${String(10 + i).padStart(2, '0')}`, 'realizada'));
    api.get.mockResolvedValue({ ...HISTORICO, aulas: muitas });
    renderizar();
    const lista = (await screen.findByRole('heading', { name: 'Aulas' })).closest('article');
    expect(within(lista).getAllByRole('button', { name: /às 14:00/ })).toHaveLength(8);
    fireEvent.click(within(lista).getByRole('button', { name: 'Ver todas as 10 aulas' }));
    expect(within(lista).getAllByRole('button', { name: /às 14:00/ })).toHaveLength(10);
  });

  it('aluno de outro responsável: a API não encontra, e a página diz isso', async () => {
    api.get.mockRejectedValue(new Error('Aluno não encontrado.'));
    renderizar('responsavel');
    expect(await screen.findByRole('alert')).toHaveTextContent('Aluno não encontrado.');
  });
});
