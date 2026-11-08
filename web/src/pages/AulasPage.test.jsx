import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import AulasPage from './AulasPage.jsx';

vi.mock('../api/index.js', () => ({ api: { get: vi.fn(), patch: vi.fn(), put: vi.fn(), post: vi.fn() } }));

const aula = (id, data, hora, status, extra = {}) => ({
  id,
  alunoId: id,
  data,
  hora,
  duracaoMin: 45,
  status,
  temDiario: false,
  reposicao: false,
  aluno: { id, nome: `Aluno ${id}`, instrumento: 'Violino' },
  professor: { id: 2, nome: 'Luiz' },
  ...extra,
});
const AULAS = [
  aula(1, '2026-10-05', '14:00', 'agendada'), // a registrar
  aula(2, '2026-10-06', '10:00', 'realizada'), // sem diário
  aula(3, '2026-10-06', '11:00', 'realizada', { temDiario: true }),
  aula(4, '2026-10-07', '09:00', 'falta', { reposicao: true }),
  aula(5, '2026-10-07', '15:00', 'agendada'), // ainda não começou: fica de fora
];

function renderizar(papel = 'professor', inicio = '/aulas') {
  return render(
    <AuthContext.Provider value={{ autenticado: true, usuario: { id: 2, nome: 'Luiz', papel } }}>
      <MemoryRouter initialEntries={[inicio]}>
        <Routes>
          <Route path="/aulas" element={<AulasPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const segmento = (nome) => within(screen.getByRole('group', { name: 'Filtrar aulas' })).getByRole('button', { name: nome });
const nomesNaLista = () =>
  within(document.querySelector('.card-lista'))
    .getAllByRole('button')
    .map((botao) => botao.querySelector('strong').textContent);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 7, 10, 0)); // quarta, 07/10/2026, 10:00
  vi.clearAllMocks();
  api.get.mockImplementation(async (caminho) => {
    if (caminho.startsWith('/aulas?')) return AULAS;
    if (caminho.startsWith('/usuarios')) return [{ id: 2, nome: 'Luiz' }, { id: 5, nome: 'Carla' }];
    throw new Error(`GET não simulado: ${caminho}`);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AulasPage (RF08/RF09)', () => {
  it('lista as aulas dos últimos 30 dias que já começaram, separando o que falta registrar', async () => {
    renderizar();
    expect(await screen.findByText('Aluno 1')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/aulas?inicio=2026-09-07&fim=2026-10-07');
    expect(nomesNaLista()).toEqual(['Aluno 1']);
    expect(segmento(/A registrar/)).toHaveTextContent('1');
    expect(segmento(/Sem diário/)).toHaveTextContent('1');
    expect(segmento(/Registradas/)).toHaveTextContent('3');
    expect(screen.queryByText('Aluno 5')).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/usuarios?papel=professor'); // professor vê só as próprias

    fireEvent.click(segmento(/Sem diário/));
    expect(nomesNaLista()).toEqual(['Aluno 2']);
    fireEvent.click(segmento(/Registradas/));
    expect(nomesNaLista()).toEqual(['Aluno 4', 'Aluno 3', 'Aluno 2']); // a mais recente primeiro
    expect(screen.getByText(/Hoje · 09:00 · Reposição/)).toBeInTheDocument();
  });

  it('tudo em dia: diz isso', async () => {
    api.get.mockResolvedValue([aula(3, '2026-10-06', '11:00', 'realizada', { temDiario: true })]);
    renderizar('professor', '/aulas?filtro=diario');
    expect(await screen.findByText('Todas as aulas realizadas têm diário.')).toBeInTheDocument();
  });

  it('coordenação filtra por professor', async () => {
    renderizar('coordenacao');
    const seletor = await screen.findByRole('combobox', { name: 'Professor(a)' });
    fireEvent.change(seletor, { target: { value: '5' } });
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/aulas?inicio=2026-09-07&fim=2026-10-07&professorId=5'));
  });

  it('tocar numa aula abre o registro dela', async () => {
    renderizar();
    api.get.mockImplementation(async (caminho) =>
      caminho === '/aulas/1'
        ? {
            ...AULAS[0],
            acoes: { registrar: true, cancelar: false, avisarFalta: false, solicitarReposicao: false },
            horasAteAAula: -44,
          }
        : AULAS,
    );
    fireEvent.click(await screen.findByText('Aluno 1'));
    expect(await screen.findByRole('dialog', { name: 'Aula de Aluno 1' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Presença' })).toBeInTheDocument();
  });

  it('erro ao carregar', async () => {
    api.get.mockRejectedValue(new Error('Falha.'));
    renderizar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha.');
  });
});
