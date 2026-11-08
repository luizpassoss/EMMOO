import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { responderConfirmacao } from '../apoioTestes.js';
import FeriadosDaEscola from './FeriadosDaEscola.jsx';

vi.mock('../api/index.js', () => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() } }));

const FERIADOS = [
  { id: 1, descricao: 'Finados', inicio: '2026-11-02', fim: '2026-11-02' },
  { id: 2, descricao: 'Recesso de fim de ano', inicio: '2026-12-21', fim: '2027-01-08' },
];

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue(FERIADOS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FeriadosDaEscola', () => {
  it('lista os próximos feriados e recessos com o período', async () => {
    render(<FeriadosDaEscola />);
    expect(await screen.findByText('Finados')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/feriados');
    expect(screen.getByText('2 nov 2026')).toBeInTheDocument();
    expect(screen.getByText('21 dez 2026 – 8 jan 2027')).toBeInTheDocument();
  });

  it('adiciona um feriado, avisa quantas aulas foram retiradas e pede para recarregar a agenda', async () => {
    api.post.mockResolvedValue({ id: 3, descricao: 'Carnaval', aulasCanceladas: 2 });
    const onAlterado = vi.fn();
    render(<FeriadosDaEscola onAlterado={onAlterado} />);
    await screen.findByText('Finados');
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Carnaval' } });
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2027-02-08' } });
    fireEvent.change(screen.getByLabelText('Até (opcional)'), { target: { value: '2027-02-10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/feriados', { descricao: 'Carnaval', inicio: '2027-02-08', fim: '2027-02-10' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Carnaval cadastrado. 2 aulas foram retiradas da agenda.');
    expect(onAlterado).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Nome')).toHaveValue(''); // o formulário limpa
  });

  it('mostra os erros de validação junto aos campos', async () => {
    api.post.mockRejectedValue({
      status: 400,
      message: 'Dados inválidos.',
      details: [{ campo: 'fim', mensagem: 'Este período já passou.' }],
    });
    render(<FeriadosDaEscola />);
    await screen.findByText('Finados');
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(await screen.findByText('Este período já passou.')).toBeInTheDocument();
    expect(screen.getByLabelText('Até (opcional)')).toHaveAttribute('aria-invalid', 'true');
  });

  it('remove após confirmar e diz quantas aulas retornaram', async () => {
    api.delete.mockResolvedValue({ aulasRestauradas: 1, aulasNaoRestauradas: 0 });
    const onAlterado = vi.fn();
    render(<FeriadosDaEscola onAlterado={onAlterado} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remover Finados' }));
    await responderConfirmacao('Remover', {
      name: 'Remover "Finados"?',
      description: 'As aulas futuras desse período retornam à agenda.',
    });
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/feriados/1'));
    expect(await screen.findByRole('status')).toHaveTextContent('Finados removido. 1 aula retornou à agenda.');
    expect(onAlterado).toHaveBeenCalledTimes(1);
  });

  it('não remove quando a pessoa desiste; mostra erro da API', async () => {
    api.delete.mockRejectedValue(new Error('Feriado não encontrado.'));
    render(<FeriadosDaEscola />);
    fireEvent.click(await screen.findByRole('button', { name: 'Remover Finados' }));
    await responderConfirmacao('Voltar');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(api.delete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Remover Finados' }));
    await responderConfirmacao('Remover');
    expect(await screen.findByRole('alert')).toHaveTextContent('Feriado não encontrado.');
  });

  it('lista vazia e erro ao carregar', async () => {
    api.get.mockResolvedValueOnce([]);
    const { unmount } = render(<FeriadosDaEscola />);
    expect(await screen.findByText('Nenhum feriado ou recesso marcado.')).toBeInTheDocument();
    unmount();
    api.get.mockRejectedValueOnce(new Error('Falha de rede.'));
    render(<FeriadosDaEscola />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha de rede.');
  });
});

describe('FeriadosDaEscola — feriados nacionais', () => {
  const nacional = (inicio, descricao, extra = {}) => ({ inicio, fim: inicio, descricao, tipo: 'nacional', passado: false, jaCadastrado: false, ...extra });
  const DE_2026 = {
    ano: 2026,
    feriados: [
      nacional('2026-04-21', 'Tiradentes', { passado: true }),
      nacional('2026-06-04', 'Corpus Christi', { tipo: 'facultativo' }),
      nacional('2026-10-12', 'Nossa Senhora Aparecida'),
      nacional('2026-11-02', 'Finados', { jaCadastrado: true }),
      nacional('2026-12-25', 'Natal'),
    ],
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 4, 20, 10, 0)); // 20/05/2026
    api.get.mockImplementation(async (caminho) => {
      if (caminho === '/feriados') return FERIADOS;
      if (caminho === '/feriados/nacionais?ano=2026') return DE_2026;
      if (caminho === '/feriados/nacionais?ano=2027') return { ano: 2027, feriados: [nacional('2027-01-01', 'Confraternização Universal')] };
      throw new Error(`GET não simulado: ${caminho}`);
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('marca de início os nacionais que ainda vão acontecer; facultativos ficam desmarcados', async () => {
    api.post.mockResolvedValue({ ano: 2026, criados: 3, ignorados: 0, aulasCanceladas: 2 });
    const onAlterado = vi.fn();
    render(<FeriadosDaEscola onAlterado={onAlterado} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Feriados nacionais' }));
    const painel = await screen.findByRole('dialog', { name: 'Feriados nacionais' });
    expect(await within(painel).findByRole('checkbox', { name: /Natal/ })).toBeChecked();
    expect(within(painel).getByRole('checkbox', { name: /Tiradentes/ })).toBeDisabled();
    expect(within(painel).getByText(/já passou/)).toBeInTheDocument();
    expect(within(painel).getByRole('checkbox', { name: /Finados/ })).toBeDisabled();
    expect(within(painel).getByRole('checkbox', { name: /Corpus Christi/ })).not.toBeChecked();
    expect(within(painel).getByText(/ponto facultativo/)).toBeInTheDocument();
    fireEvent.click(within(painel).getByRole('checkbox', { name: /Corpus Christi/ }));
    fireEvent.click(within(painel).getByRole('button', { name: 'Cadastrar 3 feriados' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith('/feriados/nacionais', { ano: 2026, datas: ['2026-10-12', '2026-12-25', '2026-06-04'] }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('3 feriados nacionais cadastrados. 2 aulas foram retiradas da agenda.');
    expect(onAlterado).toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Feriados nacionais' })).not.toBeInTheDocument();
  });

  it('troca de ano; sem nenhum marcado, não cadastra', async () => {
    render(<FeriadosDaEscola />);
    fireEvent.click(await screen.findByRole('button', { name: 'Feriados nacionais' }));
    const painel = await screen.findByRole('dialog', { name: 'Feriados nacionais' });
    fireEvent.click(within(painel).getByRole('button', { name: '2027' }));
    const confraternizacao = await within(painel).findByRole('checkbox', { name: /Confraternização Universal/ });
    fireEvent.click(confraternizacao);
    expect(within(painel).getByRole('button', { name: 'Cadastrar' })).toBeDisabled();
    expect(api.post).not.toHaveBeenCalled();
  });
});
