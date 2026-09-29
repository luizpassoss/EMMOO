import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import DashboardPage from './DashboardPage.jsx';

vi.mock('../api/index.js', () => ({ api: { get: vi.fn() } }));

const aula = (id, data, hora, status = 'agendada') => ({
  id,
  data,
  hora,
  duracaoMin: 45,
  status,
  aluno: { id: 1, nome: `Aluno ${id}`, instrumento: 'Violino' },
});

function renderizar(papel) {
  return render(
    <AuthContext.Provider value={{ autenticado: true, usuario: { id: 1, nome: 'Lucimara', papel } }}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 7, 10, 0)); // quarta, 07/10/2026
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DashboardPage', () => {
  it('resume aulas de hoje, alunos ativos e próximas aulas', async () => {
    api.get.mockImplementation(async (caminho) => {
      if (caminho === '/planos') return [{ id: 1 }];
      if (caminho === '/alunos?status=ativo') return [{ id: 1 }, { id: 2 }];
      return [
        aula(4, '2026-10-07', '08:00'), // já terminou (agora são 10:00)
        aula(5, '2026-10-07', '09:30'), // em andamento até 10:15
        aula(1, '2026-10-07', '14:00'),
        aula(2, '2026-10-07', '15:00', 'cancelada'),
        aula(3, '2026-10-08', '09:00'),
      ];
    });
    renderizar('coordenacao');
    expect(await screen.findByText('Aluno 1')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/aulas?inicio=2026-10-07&fim=2026-10-13');
    expect(screen.getByText('Aulas hoje').nextSibling).toHaveTextContent('3');
    expect(screen.queryByText('Aluno 4')).not.toBeInTheDocument();
    expect(screen.getByText('Aluno 5')).toBeInTheDocument();
    expect(screen.getByText('Alunos ativos').nextSibling).toHaveTextContent('2');
    expect(screen.getByText('Quinta, 08/10 · Violino')).toBeInTheDocument();
    expect(screen.queryByText('Aluno 2')).not.toBeInTheDocument(); // cancelada não aparece
    expect(screen.getByRole('link', { name: 'Ver agenda' })).toHaveAttribute('href', '/agenda');
  });

  it('responsável não vê o total de alunos; sem aulas mostra aviso', async () => {
    api.get.mockImplementation(async (caminho) => (caminho === '/planos' ? [] : []));
    renderizar('responsavel');
    expect(await screen.findByText('Nenhuma aula agendada nos próximos 7 dias.')).toBeInTheDocument();
    expect(screen.queryByText('Alunos ativos')).not.toBeInTheDocument();
  });

  it('exibe erro de carregamento', async () => {
    api.get.mockRejectedValue(new Error('Falha ao carregar.'));
    renderizar('professor');
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha ao carregar.');
  });
});
