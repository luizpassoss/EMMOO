import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import DashboardPage from './DashboardPage.jsx';

vi.mock('../api/index.js', () => ({ api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn() } }));

const aula = (id, data, hora, status = 'agendada', extra = {}) => ({
  id,
  alunoId: 1,
  data,
  hora,
  duracaoMin: 45,
  status,
  aluno: { id: 1, nome: `Aluno ${id}`, instrumento: 'Violino' },
  ...extra,
});

const INDICADORES = {
  coordenacao: {
    papel: 'coordenacao',
    alunosAtivos: 2,
    aulasHoje: 3,
    aRegistrar: 1,
    presenca: { percentual: 83, dias: 30 },
    inadimplencia: { quantidade: 1, valor: 112 },
    mesAtual: { mes: '2026-10', previsto: 252, recebido: 140, geradas: 2 },
  },
  professor: { papel: 'professor', aulasHoje: 1, aRegistrar: 0, presenca: { percentual: null, dias: 30 } },
  responsavel: {
    papel: 'responsavel',
    dependentes: [
      {
        aluno: { id: 1, nome: 'Ana Beatriz', instrumento: 'Violino' },
        proximaAula: { id: 3, data: '2026-10-08', hora: '14:00' },
        reposicoesDisponiveis: 1,
        mensalidades: { emAberto: 1, valor: 140, atrasadas: 1 },
      },
    ],
  },
};

/** Responde cada GET pelo prefixo do caminho. */
function simular({ indicadores, aulas = [], creditos = [] }) {
  api.get.mockImplementation(async (caminho) => {
    if (caminho === '/indicadores') return indicadores;
    if (caminho.startsWith('/aulas?')) return aulas;
    if (caminho === '/reposicoes/disponiveis') return creditos;
    throw new Error(`GET não simulado: ${caminho}`);
  });
}

function renderizar(papel) {
  return render(
    <AuthContext.Provider value={{ autenticado: true, usuario: { id: 1, nome: 'Lucimara', papel } }}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const valorDe = (rotulo) => screen.getByText(rotulo).nextSibling;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 7, 10, 0)); // quarta, 07/10/2026
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DashboardPage — coordenação e professor (RF13)', () => {
  it('coordenação: agenda, presença e financeiro, cada cartão levando ao assunto', async () => {
    simular({
      indicadores: INDICADORES.coordenacao,
      aulas: [
        aula(4, '2026-10-07', '08:00'), // já terminou (agora são 10:00)
        aula(5, '2026-10-07', '09:30'), // em andamento até 10:15
        aula(1, '2026-10-07', '14:00'),
        aula(2, '2026-10-07', '15:00', 'falta'),
        aula(3, '2026-10-08', '09:00', 'agendada', { reposicao: true }),
      ],
    });
    renderizar('coordenacao');
    expect(await screen.findByText('Aluno 1')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/aulas?inicio=2026-10-07&fim=2026-10-13');
    expect(api.get).not.toHaveBeenCalledWith('/reposicoes/disponiveis');
    expect(valorDe('Aulas hoje')).toHaveTextContent('3');
    expect(valorDe('Alunos ativos')).toHaveTextContent('2');
    expect(valorDe('A registrar')).toHaveTextContent('1');
    expect(valorDe('Presença')).toHaveTextContent('83%');
    expect(valorDe('Em atraso')).toHaveTextContent(/R\$\s112,00/);
    expect(valorDe('Recebido no mês')).toHaveTextContent(/R\$\s140,00/);
    expect(screen.getByText('1 mensalidade')).toBeInTheDocument(); // quantas estão em atraso
    expect(screen.getByText(/^de R\$\s252,00$/)).toBeInTheDocument(); // recebido de quanto estava previsto
    expect(screen.getByRole('link', { name: /A registrar/ })).toHaveAttribute('href', '/aulas');
    expect(screen.getByRole('link', { name: /Em atraso/ })).toHaveAttribute('href', '/mensalidades');
    expect(screen.getByRole('link', { name: /A registrar/ })).toHaveClass('atencao');

    expect(screen.queryByText('Aluno 4')).not.toBeInTheDocument();
    expect(screen.getByText('Aluno 5')).toBeInTheDocument();
    expect(screen.queryByText('Aluno 2')).not.toBeInTheDocument(); // falta não é "próxima aula"
    expect(screen.getByText('Amanhã · Reposição')).toBeInTheDocument();
    expect(screen.getByText('quarta-feira, 7 de outubro')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver agenda' })).toHaveAttribute('href', '/agenda');
    expect(screen.queryByText('Primeiros passos')).not.toBeInTheDocument();
  });

  it('tocar numa próxima aula abre os detalhes dela', async () => {
    simular({ indicadores: INDICADORES.professor, aulas: [aula(1, '2026-10-07', '14:00')] });
    renderizar('professor');
    api.get.mockImplementation(async (caminho) => {
      if (caminho === '/aulas/1') {
        return {
          ...aula(1, '2026-10-07', '14:00'),
          professor: { id: 2, nome: 'Luiz' },
          acoes: { registrar: false, cancelar: true, avisarFalta: false, solicitarReposicao: false },
          horasAteAAula: 4,
        };
      }
      if (caminho === '/indicadores') return INDICADORES.professor;
      return [aula(1, '2026-10-07', '14:00')];
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Aula de Aluno 1, Hoje às 14:00: ver detalhes' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Aula de Aluno 1' });
    expect(within(dialogo).getByRole('button', { name: 'Cancelar aula' })).toBeInTheDocument();
  });

  it('professor: a própria agenda, sem financeiro nem total de alunos', async () => {
    simular({ indicadores: INDICADORES.professor });
    renderizar('professor');
    expect(await screen.findByText('Nenhuma aula agendada nos próximos 7 dias.')).toBeInTheDocument();
    expect(valorDe('Presença')).toHaveTextContent('—'); // ainda sem registro
    expect(screen.queryByText('Alunos ativos')).not.toBeInTheDocument();
    expect(screen.queryByText('Em atraso')).not.toBeInTheDocument();
  });

  it('escola sem alunos: a coordenação vê os primeiros passos, em ordem', async () => {
    simular({ indicadores: { ...INDICADORES.coordenacao, alunosAtivos: 0 } });
    renderizar('coordenacao');
    expect(await screen.findByText('Primeiros passos')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Cadastre os planos/ })).toHaveAttribute('href', '/planos?plano=novo');
    expect(screen.getByRole('link', { name: /Cadastre o acesso dos professores/ })).toHaveAttribute('href', '/usuarios?usuario=novo');
    expect(screen.getByRole('link', { name: /Cadastre os alunos/ })).toHaveAttribute('href', '/alunos?aluno=novo');
  });

  it('exibe erro de carregamento', async () => {
    api.get.mockRejectedValue(new Error('Falha ao carregar.'));
    renderizar('professor');
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao carregar.');
  });
});

describe('DashboardPage — responsável', () => {
  it('cada dependente: próxima aula (avisar falta), reposição a escolher e mensalidades', async () => {
    simular({
      indicadores: INDICADORES.responsavel,
      creditos: [
        { aula: { id: 2, alunoId: 1, data: '2026-10-05' }, permitido: true, prazoAte: '2026-11-04' },
        { aula: { id: 9, alunoId: 1, data: '2026-10-01' }, permitido: false, prazoAte: '2026-10-31' },
      ],
    });
    renderizar('responsavel');
    const cartao = (await screen.findByRole('heading', { name: 'Ana Beatriz' })).closest('article');
    expect(within(cartao).getByText('Amanhã às 14:00')).toBeInTheDocument();
    expect(within(cartao).getByRole('button', { name: 'Avisar falta' })).toBeInTheDocument();
    expect(within(cartao).getByText('Aula de 05/10 · escolha até 04/11')).toBeInTheDocument();
    expect(within(cartao).queryByText(/Aula de 01\/10/)).not.toBeInTheDocument(); // sem direito: não oferece
    expect(within(cartao).getByRole('button', { name: 'Escolher horário' })).toBeInTheDocument();
    expect(within(cartao).getByText(/1 em aberto · R\$\s140,00 \(1 atrasada\)/)).toBeInTheDocument();
    expect(within(cartao).getByRole('link', { name: 'Histórico' })).toHaveAttribute('href', '/alunos/1');
    expect(screen.queryByText('Alunos ativos')).not.toBeInTheDocument();
    // A próxima aula já está no cartão do dependente: sem a lista de próximas aulas da escola.
    expect(screen.queryByRole('heading', { name: 'Próximas aulas' })).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith(expect.stringMatching(/^\/aulas\?/));
  });

  it('sem dependente vinculado, explica o que fazer', async () => {
    simular({ indicadores: { papel: 'responsavel', dependentes: [] } });
    renderizar('responsavel');
    expect(await screen.findByText('Nenhum aluno vinculado ao seu acesso.')).toBeInTheDocument();
  });

  it('mensalidades em dia', async () => {
    const [dependente] = INDICADORES.responsavel.dependentes;
    simular({
      indicadores: {
        papel: 'responsavel',
        dependentes: [{ ...dependente, proximaAula: null, mensalidades: { emAberto: 0, valor: 0, atrasadas: 0 } }],
      },
    });
    renderizar('responsavel');
    expect(await screen.findByText('Em dia')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma aula agendada')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Avisar falta' })).not.toBeInTheDocument();
  });
});

describe('DashboardPage — alunos para agendar (fim da série de aulas)', () => {
  const PARA_AGENDAR = [
    {
      aluno: { id: 7, nome: 'Bruna', instrumento: 'Piano' },
      situacao: 'sem_aulas',
      ultimaAula: null,
      sugestao: null,
    },
    {
      aluno: { id: 1, nome: 'Ana Beatriz', instrumento: 'Violino' },
      situacao: 'sem_aulas',
      ultimaAula: { id: 8, data: '2026-09-28', hora: '14:00', professorId: 2 },
      sugestao: { data: '2026-10-12', hora: '14:00', professorId: 2 },
    },
    {
      aluno: { id: 2, nome: 'Pedro Henrique', instrumento: 'Violão' },
      situacao: 'terminando',
      ultimaAula: { id: 16, data: '2026-10-14', hora: '15:30', professorId: 2 },
      sugestao: { data: '2026-10-21', hora: '15:30', professorId: 2 },
    },
  ];

  it('lista quem está sem aula ou terminando, com o atalho para renovar já preenchido', async () => {
    simular({ indicadores: { ...INDICADORES.coordenacao, alunosParaAgendar: PARA_AGENDAR } });
    renderizar('coordenacao');
    const cartao = (await screen.findByRole('heading', { name: 'Alunos para agendar' })).closest('article');
    expect(within(cartao).getByText('Nenhuma aula marcada ainda')).toBeInTheDocument();
    expect(within(cartao).getByText('Sem aulas marcadas desde 28/09')).toBeInTheDocument();
    expect(within(cartao).getByText('Última aula marcada: Quarta, 14/10')).toBeInTheDocument();
    expect(within(cartao).getByRole('link', { name: /Bruna/ })).toHaveAttribute('href', '/agenda?aula=nova&alunoId=7');
    expect(within(cartao).getByRole('link', { name: /Pedro Henrique/ })).toHaveAttribute(
      'href',
      '/agenda?aula=2026-10-21&alunoId=2&professorId=2&hora=15%3A30&semanas=12',
    );
    expect(within(cartao).getByRole('link', { name: /Pedro Henrique/ })).toHaveTextContent('Renovar');
  });

  it('mostra os 3 primeiros e "Ver todos" abre o resto; sem ninguém, o cartão não aparece', async () => {
    const muitos = Array.from({ length: 8 }, (_, indice) => ({ ...PARA_AGENDAR[0], aluno: { ...PARA_AGENDAR[0].aluno, id: 20 + indice } }));
    simular({ indicadores: { ...INDICADORES.coordenacao, alunosParaAgendar: muitos } });
    const { unmount } = renderizar('coordenacao');
    const cartao = (await screen.findByRole('heading', { name: 'Alunos para agendar' })).closest('article');
    expect(within(cartao).getAllByRole('link')).toHaveLength(3);
    fireEvent.click(within(cartao).getByRole('button', { name: 'Ver todos (8)' }));
    expect(within(cartao).getAllByRole('link')).toHaveLength(8);
    expect(within(cartao).getByRole('button', { name: 'Mostrar menos' })).toHaveAttribute('aria-expanded', 'true');
    unmount();
    simular({ indicadores: { ...INDICADORES.coordenacao, alunosParaAgendar: [] } });
    renderizar('coordenacao');
    await screen.findByText('Alunos ativos');
    expect(screen.queryByRole('heading', { name: 'Alunos para agendar' })).not.toBeInTheDocument();
  });
});
