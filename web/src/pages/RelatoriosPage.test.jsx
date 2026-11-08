import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { salvarArquivo } from '../utils/arquivo.js';
import RelatoriosPage from './RelatoriosPage.jsx';

vi.mock('../api/index.js', () => ({ api: { get: vi.fn(), baixar: vi.fn() } }));
vi.mock('../utils/arquivo.js', () => ({ salvarArquivo: vi.fn() }));

const RELATORIO = {
  escola: 'Escola de Música EMMOO',
  mes: '2026-10',
  mesNome: 'outubro de 2026',
  geradoEm: '17/10/2026 às 10:00',
  financeiro: { previsto: 252, recebido: 140, emAberto: 112, atrasado: 112, quantidade: { paga: 1, pendente: 0, atrasada: 1 } },
  mensalidades: [
    { aluno: 'Ana Beatriz', vencimento: '2026-10-10', valor: 140, situacao: 'Paga', dataPagamento: '2026-10-05', formaPagamento: 'Pix' },
    { aluno: 'Pedro Henrique', vencimento: '2026-10-10', valor: 112, situacao: 'Atrasada', dataPagamento: null, formaPagamento: null },
  ],
  presenca: {
    percentual: 75,
    porAluno: [{ aluno: 'Ana Beatriz', aulas: 4, presencas: 3, faltas: 1, reposicoes: 1, percentual: 75 }],
  },
};

function renderizar(inicio = '/relatorios') {
  return render(
    <MemoryRouter initialEntries={[inicio]}>
      <Routes>
        <Route path="/relatorios" element={<RelatoriosPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 17, 10, 0));
  vi.clearAllMocks();
  api.get.mockImplementation(async (caminho) =>
    caminho.endsWith('2026-10') ? RELATORIO : { ...RELATORIO, mes: '2026-09', mensalidades: [], presenca: { percentual: null, porAluno: [] } },
  );
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RelatoriosPage (RF15)', () => {
  it('mostra o financeiro e a presença do mês', async () => {
    renderizar();
    expect(await screen.findByRole('heading', { name: 'Mensalidades de outubro de 2026' })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/relatorios/mensal?mes=2026-10');
    expect(screen.getByText('Recebido').nextSibling).toHaveTextContent(/R\$\s140,00/);
    expect(screen.getByText('1 mensalidade paga')).toBeInTheDocument();
    expect(screen.getByText(/R\$\s112,00 em atraso/)).toBeInTheDocument();
    expect(screen.getByText('Presença', { selector: '.indicador-rotulo' }).nextSibling).toHaveTextContent('75%');

    const [financeiro, presenca] = screen.getAllByRole('table');
    expect(within(financeiro).getAllByRole('row')).toHaveLength(3);
    expect(within(financeiro).getByText('05/10/2026 · Pix')).toBeInTheDocument();
    expect(within(financeiro).getByText('Atrasada')).toHaveClass('pill-atrasada');
    expect(within(presenca).getByRole('rowheader', { name: 'Ana Beatriz' })).toBeInTheDocument();
    expect(screen.getByText(/Gerado em 17\/10\/2026 às 10:00/)).toBeInTheDocument();
  });

  it('navega entre meses; mês sem dados diz isso', async () => {
    renderizar();
    await screen.findByText('Outubro de 2026');
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(await screen.findByText('Nenhuma mensalidade neste mês.')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma aula neste mês.')).toBeInTheDocument();
    expect(api.get).toHaveBeenLastCalledWith('/relatorios/mensal?mes=2026-09');
  });

  it('baixa o PDF do relatório', async () => {
    const pdf = new Blob(['%PDF']);
    api.baixar.mockResolvedValue({ conteudo: pdf, arquivo: 'relatorio-2026-10.pdf' });
    renderizar();
    await screen.findAllByText('Ana Beatriz', { selector: 'th' });
    fireEvent.click(screen.getAllByRole('button', { name: 'Baixar PDF' })[0]);
    await waitFor(() => expect(salvarArquivo).toHaveBeenCalledWith(pdf, 'relatorio-2026-10.pdf'));
    expect(api.baixar).toHaveBeenCalledWith('/relatorios/mensal/pdf?mes=2026-10');
  });

  it('erro ao carregar ou ao gerar o PDF aparece na página', async () => {
    api.baixar.mockRejectedValue(new Error('O servidor não respondeu.'));
    renderizar();
    await screen.findByText('Outubro de 2026');
    await screen.findByRole('heading', { name: 'Mensalidades de outubro de 2026' });
    fireEvent.click(screen.getByRole('button', { name: 'Baixar PDF' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('O servidor não respondeu.');
  });

  it('planilhas (CSV) de mensalidades e de presença para a contabilidade', async () => {
    const csv = new Blob(['Aluno;Valor'], { type: 'text/csv' });
    api.baixar.mockResolvedValue({ conteudo: csv, arquivo: 'mensalidades-2026-10.csv' });
    renderizar();
    fireEvent.click(await screen.findByRole('button', { name: 'Baixar planilha de mensalidades (CSV)' }));
    await waitFor(() => expect(salvarArquivo).toHaveBeenCalledWith(csv, 'mensalidades-2026-10.csv'));
    expect(api.baixar).toHaveBeenCalledWith('/relatorios/mensal/csv?mes=2026-10&tipo=mensalidades', 'text/csv, application/json');

    api.baixar.mockResolvedValue({ conteudo: csv, arquivo: null });
    fireEvent.click(screen.getByRole('button', { name: 'Baixar planilha de presença (CSV)' }));
    await waitFor(() => expect(salvarArquivo).toHaveBeenLastCalledWith(csv, 'presenca-2026-10.csv'));
  });

  it('valor ajustado e cobrança cancelada aparecem na tabela; a cancelada fica fora do previsto', async () => {
    api.get.mockResolvedValue({
      ...RELATORIO,
      financeiro: { ...RELATORIO.financeiro, quantidade: { paga: 1, pendente: 0, atrasada: 1, cancelada: 1 } },
      mensalidades: [
        { ...RELATORIO.mensalidades[0], valor: 120, valorOriginal: 140, observacao: 'Desconto de irmãos' },
        { aluno: 'Zeca', vencimento: '2026-10-10', valor: 140, situacao: 'Cancelada', dataPagamento: null, formaPagamento: null, observacao: 'Aluno saiu' },
      ],
    });
    renderizar();
    const [financeiro] = await screen.findAllByRole('table');
    expect(within(financeiro).getByText(/ajustado \(era R\$\s140,00\)/)).toBeInTheDocument();
    const zeca = within(financeiro).getByText('Zeca').closest('tr');
    expect(within(zeca).getByText('Cancelada')).toHaveClass('pill-cancelada');
    expect(within(zeca).getByText('Aluno saiu')).toBeInTheDocument();
    expect(screen.getByText('1 cancelada fora da conta')).toBeInTheDocument();
  });
});
