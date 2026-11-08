import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import { salvarArquivo } from '../utils/arquivo.js';
import PagamentosPage from './PagamentosPage.jsx';

vi.mock('../api/index.js', () => ({ api: { get: vi.fn(), baixar: vi.fn() } }));
vi.mock('../utils/arquivo.js', () => ({ salvarArquivo: vi.fn() }));

const pagamento = (id, aluno, mes, dataPagamento, forma, valor = 140) => ({
  id,
  mesReferencia: mes,
  valor,
  vencimento: `${mes}-10`,
  status: 'paga',
  dataPagamento,
  formaPagamento: forma,
  formaPagamentoNome: forma === 'pix' ? 'Pix' : 'Dinheiro',
  aluno,
});
const ANA = { id: 1, nome: 'Ana Beatriz', instrumento: 'Violino' };
const PEDRO = { id: 2, nome: 'Pedro Henrique', instrumento: 'Violão' };
// Da API: do mais recente ao mais antigo.
const PAGAMENTOS = [
  pagamento(3, ANA, '2026-11', '2026-11-08', 'dinheiro'),
  pagamento(2, PEDRO, '2026-10', '2026-10-09', 'pix', 112),
  pagamento(1, ANA, '2026-10', '2026-10-05', 'pix'),
];

function renderizar(papel = 'coordenacao', inicio = '/mensalidades/pagamentos') {
  return render(
    <AuthContext.Provider value={{ autenticado: true, usuario: { id: 1, nome: 'Lucimara', papel } }}>
      <MemoryRouter initialEntries={[inicio]}>
        <Routes>
          <Route path="/mensalidades/pagamentos" element={<PagamentosPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

const valorDe = (rotulo) => screen.getByText(rotulo, { selector: '.indicador-rotulo' }).nextSibling;

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ pagamentos: PAGAMENTOS, totais: {} });
});

describe('PagamentosPage (RF11)', () => {
  it('lista os pagamentos por mês, com o total e quanto entrou por Pix e em dinheiro', async () => {
    renderizar();
    expect(await screen.findByRole('heading', { name: 'Novembro de 2026' })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/mensalidades/pagamentos');
    expect(valorDe('Total recebido')).toHaveTextContent(/R\$\s392,00/);
    expect(screen.getByText('3 pagamentos')).toBeInTheDocument();
    expect(valorDe('Por Pix')).toHaveTextContent(/R\$\s252,00/);
    expect(valorDe('Em dinheiro')).toHaveTextContent(/R\$\s140,00/);

    const outubro = screen.getByRole('heading', { name: 'Outubro de 2026' }).closest('article');
    expect(within(outubro).getAllByText(/Mensalidade de outubro de 2026/)).toHaveLength(2);
    expect(within(outubro).getByText(/R\$\s252,00/, { selector: '.texto-suave' })).toBeInTheDocument(); // total do mês
    expect(within(outubro).getByText('Pedro Henrique')).toBeInTheDocument();
    expect(within(outubro).getByText('Mensalidade de outubro de 2026 · Pix · pago em 09/10/2026')).toBeInTheDocument();
  });

  it('filtra por aluno (também pelo link vindo da mensalidade)', async () => {
    renderizar('coordenacao', '/mensalidades/pagamentos?aluno=1');
    expect(await screen.findByText('Ana Beatriz', { selector: '.descricao' })).toBeInTheDocument(); // de quem são
    expect(valorDe('Total recebido')).toHaveTextContent(/R\$\s280,00/);
    expect(screen.queryByText('Pedro Henrique', { selector: 'strong' })).not.toBeInTheDocument();
    // Filtrado, cada linha diz a mensalidade (o nome do aluno seria repetido).
    expect(screen.getByText('Mensalidade de novembro de 2026')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Aluno' }), { target: { value: '' } });
    expect(await screen.findByText('Pedro Henrique', { selector: 'strong' })).toBeInTheDocument();
  });

  it('baixa o recibo de um pagamento', async () => {
    const pdf = new Blob(['%PDF']);
    api.baixar.mockResolvedValue({ conteudo: pdf, arquivo: 'recibo-2026-11-ana-beatriz.pdf' });
    renderizar();
    fireEvent.click(await screen.findByRole('button', { name: 'Baixar recibo de Ana Beatriz, novembro de 2026' }));
    await waitFor(() => expect(salvarArquivo).toHaveBeenCalledWith(pdf, 'recibo-2026-11-ana-beatriz.pdf'));
    expect(api.baixar).toHaveBeenCalledWith('/mensalidades/3/recibo');
  });

  it('responsável com um dependente: sem filtro e sem nome repetido; sem pagamentos, diz isso', async () => {
    api.get.mockResolvedValue({ pagamentos: PAGAMENTOS.filter((p) => p.aluno.id === 1), totais: {} });
    const { unmount } = renderizar('responsavel');
    expect(await screen.findByText('Mensalidade de novembro de 2026')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Aluno' })).not.toBeInTheDocument();
    unmount();
    api.get.mockResolvedValue({ pagamentos: [], totais: {} });
    renderizar('responsavel');
    expect(await screen.findByText('Nenhum pagamento registrado ainda.')).toBeInTheDocument();
  });

  it('erro ao carregar ou ao baixar aparece na página', async () => {
    api.get.mockRejectedValueOnce(new Error('Falha de rede.'));
    renderizar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Falha de rede.');
  });
});
