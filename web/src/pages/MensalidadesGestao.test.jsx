import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { ApiError } from '../api/client.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import MensalidadesPage from './MensalidadesPage.jsx';

vi.mock('../api/index.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), baixar: vi.fn() },
}));

const mensalidade = (id, nome, status, extra = {}) => ({
  id,
  mesReferencia: '2026-10',
  valor: 140,
  valorOriginal: null,
  vencimento: '2026-10-22',
  status,
  dataPagamento: null,
  formaPagamento: null,
  formaPagamentoNome: null,
  numeroRecibo: null,
  ajusteMotivo: null,
  cancelamentoMotivo: null,
  aluno: { id, nome, instrumento: 'Violino' },
  plano: { id: 1, nome: 'Particular · 1 aula por semana' },
  responsavel: { id: 3, nome: 'Mary' },
  ...extra,
});
const SEM_ALERTAS = {
  atrasadas: { quantidade: 0, valor: 0 },
  vencendo: { quantidade: 0, valor: 0 },
  email: { configurado: false, pendentes: 0, enviados: 0, ultimoErro: null },
};

function renderizar(papel = 'coordenacao', inicio = '/mensalidades') {
  return render(
    <AuthContext.Provider value={{ autenticado: true, usuario: { id: 1, nome: 'Lucimara', papel } }}>
      <MemoryRouter initialEntries={[inicio]}>
        <Routes>
          <Route path="/mensalidades" element={<MensalidadesPage />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  );
}

let lista;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 17, 10, 0)); // sábado, 17/10/2026
  vi.clearAllMocks();
  lista = [
    mensalidade(1, 'Ana Beatriz', 'pendente'),
    mensalidade(2, 'Pedro Henrique', 'cancelada', { valor: 112, cancelamentoMotivo: 'Mês sem aulas' }),
    mensalidade(3, 'Zeca', 'pendente', { valor: 100, valorOriginal: 140, ajusteMotivo: 'Bolsa' }),
  ];
  api.get.mockImplementation(async (caminho) => {
    if (caminho === '/mensalidades/alertas') return SEM_ALERTAS;
    if (caminho.startsWith('/mensalidades?mes=')) return lista;
    throw new Error(`GET não simulado: ${caminho}`);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MensalidadesPage — ajuste, cancelamento e reabertura', () => {
  it('a cancelada fica na lista com o motivo, fora do previsto e do em aberto; tem filtro próprio', async () => {
    renderizar();
    expect(await screen.findByText('Cancelada: Mês sem aulas')).toBeInTheDocument();
    expect(screen.getByText('Previsto').nextSibling).toHaveTextContent(/R\$\s240,00/); // 140 + 100, sem os 112
    expect(screen.getByText('1 cancelada fora da conta')).toBeInTheDocument();
    expect(screen.getByText('Em aberto').nextSibling).toHaveTextContent(/R\$\s240,00/);
    expect(screen.getByText(/Vence em 22\/10 · valor ajustado/)).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: 'Situação' }), { target: { value: 'cancelada' } });
    expect(screen.queryByText('Ana Beatriz')).not.toBeInTheDocument();
    expect(screen.getByText('Pedro Henrique')).toBeInTheDocument();
  });

  it('sem canceladas no mês, o filtro delas não aparece', async () => {
    lista = [mensalidade(1, 'Ana Beatriz', 'pendente')];
    renderizar();
    await screen.findByText('Ana Beatriz');
    const opcoes = within(screen.getByRole('combobox', { name: 'Situação' })).getAllByRole('option');
    expect(opcoes.map((opcao) => opcao.value)).toEqual(['', 'atrasada', 'pendente', 'paga']);
  });

  it('ajusta o valor com o motivo; a janela mostra o valor do plano', async () => {
    renderizar();
    fireEvent.click(await screen.findByText('Ana Beatriz'));
    const painel = await screen.findByRole('dialog', { name: 'Registrar pagamento' });
    fireEvent.click(within(painel).getByRole('button', { name: 'Ajustar valor' }));
    const ajuste = screen.getByRole('dialog', { name: 'Ajustar valor' });
    expect(within(ajuste).getByText(/Valor do plano: R\$\s140,00/)).toBeInTheDocument();
    fireEvent.change(within(ajuste).getByLabelText('Novo valor (R$)'), { target: { value: '120' } });
    fireEvent.change(within(ajuste).getByLabelText('Motivo'), { target: { value: ' Desconto de irmãos ' } });
    api.patch.mockResolvedValue({ ...lista[0], valor: 120, valorOriginal: 140 });
    fireEvent.click(within(ajuste).getByRole('button', { name: 'Salvar valor' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/mensalidades/1/valor', { valor: '120', motivo: 'Desconto de irmãos' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent('Mensalidade de Ana Beatriz (outubro de 2026) ajustada para R$ 120,00.');
  });

  it('erro do ajuste aparece no campo; "Voltar ao pagamento" volta à baixa', async () => {
    renderizar();
    fireEvent.click(await screen.findByText('Ana Beatriz'));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Ajustar valor' }));
    const ajuste = screen.getByRole('dialog', { name: 'Ajustar valor' });
    api.patch.mockRejectedValue(new ApiError(400, 'Dados inválidos.', [{ campo: 'motivo', mensagem: 'Explique o ajuste.' }]));
    fireEvent.change(within(ajuste).getByLabelText('Novo valor (R$)'), { target: { value: '90' } });
    fireEvent.click(within(ajuste).getByRole('button', { name: 'Salvar valor' }));
    expect(await within(ajuste).findByText('Explique o ajuste.')).toBeInTheDocument();
    fireEvent.click(within(ajuste).getByRole('button', { name: 'Voltar ao pagamento' }));
    expect(screen.getByRole('dialog', { name: 'Registrar pagamento' })).toBeInTheDocument();
  });

  it('mensalidade ajustada: mostra o valor do plano riscado e o motivo; dá para voltar ao valor do plano', async () => {
    renderizar();
    fireEvent.click(await screen.findByText('Zeca'));
    const painel = await screen.findByRole('dialog', { name: 'Registrar pagamento' });
    expect(within(painel).getByLabelText(/em vez de R\$\s140,00/)).toBeInTheDocument();
    expect(within(painel).getByText('Bolsa')).toBeInTheDocument();
    fireEvent.click(within(painel).getByRole('button', { name: 'Ajustar valor' }));
    fireEvent.click(screen.getByRole('button', { name: /Voltar ao valor do plano/ }));
    expect(screen.getByLabelText('Novo valor (R$)')).toHaveValue(140);
    expect(screen.getByLabelText('Motivo')).toHaveValue('');
    api.patch.mockResolvedValue({ ...lista[2], valor: 140, valorOriginal: null });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar valor' }));
    expect(await screen.findByRole('status')).toHaveTextContent('de volta ao valor do plano: R$ 140,00');
  });

  it('cancela a cobrança com o motivo', async () => {
    renderizar();
    fireEvent.click(await screen.findByText('Ana Beatriz'));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar cobrança' }));
    const cancelar = screen.getByRole('dialog', { name: 'Cancelar cobrança' });
    expect(within(cancelar).getByText('Sai dos totais e dos alertas, e pode ser reaberta depois.')).toBeInTheDocument();
    fireEvent.change(within(cancelar).getByLabelText('Motivo do cancelamento'), { target: { value: 'Aluno saiu' } });
    api.patch.mockResolvedValue({ ...lista[0], status: 'cancelada' });
    fireEvent.click(within(cancelar).getByRole('button', { name: 'Cancelar cobrança' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/mensalidades/1/cancelar', { motivo: 'Aluno saiu' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Cobrança de Ana Beatriz (outubro de 2026) cancelada');
  });

  it('reabre a cancelada', async () => {
    renderizar();
    fireEvent.click(await screen.findByText('Pedro Henrique'));
    const painel = await screen.findByRole('dialog', { name: 'Mensalidade cancelada' });
    expect(within(painel).getByText('Mês sem aulas')).toBeInTheDocument();
    expect(within(painel).queryByRole('button', { name: 'Ajustar valor' })).not.toBeInTheDocument();
    api.patch.mockResolvedValue({ ...lista[1], status: 'atrasada', cancelamentoMotivo: null });
    fireEvent.click(within(painel).getByRole('button', { name: 'Reabrir cobrança' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/mensalidades/2/reabrir'));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Cobrança de Pedro Henrique (outubro de 2026) reaberta: já venceu e aparece como atrasada.',
    );
  });

  it('paga: mostra o número do recibo', async () => {
    lista = [
      mensalidade(1, 'Ana Beatriz', 'paga', {
        dataPagamento: '2026-10-05',
        formaPagamento: 'pix',
        formaPagamentoNome: 'Pix',
        numeroRecibo: 12,
      }),
    ];
    renderizar();
    fireEvent.click(await screen.findByText('Ana Beatriz'));
    const painel = await screen.findByRole('dialog', { name: 'Mensalidade paga' });
    expect(within(painel).getByText('Nº 000012')).toBeInTheDocument();
  });
});

describe('MensalidadesPage — responsável paga pelo Pix', () => {
  const PIX = {
    valor: 140,
    copiaECola: '00020126580014br.gov.bcb.pix0136chave520400005303986540614 0.005802BR6304ABCD',
    qrCodeSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    recebedor: 'Escola EMMOO',
    chave: { tipo: 'email', valor: 'financeiro@emmoo.com.br' },
  };

  beforeEach(() => {
    api.get.mockImplementation(async (caminho) => {
      if (caminho === '/mensalidades') {
        return [
          mensalidade(4, 'Ana Beatriz', 'pendente', { pixDisponivel: true }),
          mensalidade(5, 'Ana Beatriz', 'atrasada', { mesReferencia: '2026-09', pixDisponivel: false }),
          mensalidade(6, 'Ana Beatriz', 'cancelada', { mesReferencia: '2026-08' }),
        ];
      }
      if (caminho === '/mensalidades/4/pix') return PIX;
      throw new Error(`GET não simulado: ${caminho}`);
    });
  });

  it('abre o QR e o "copia e cola" e copia o código', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    renderizar('responsavel');
    fireEvent.click(await screen.findByRole('button', { name: 'Pagar com Pix a mensalidade de outubro de 2026' }));
    expect(screen.queryByRole('button', { name: 'Pagar com Pix a mensalidade de setembro de 2026' })).not.toBeInTheDocument();
    const painel = await screen.findByRole('dialog', { name: 'Pagar com Pix' });
    expect(await within(painel).findByRole('img', { name: 'QR Code do Pix' })).toHaveAttribute(
      'src',
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PIX.qrCodeSvg)}`,
    );
    expect(within(painel).getByLabelText('Pix copia e cola')).toHaveValue(PIX.copiaECola);
    expect(within(painel).getByText('Escola EMMOO')).toBeInTheDocument();
    fireEvent.click(within(painel).getByRole('button', { name: 'Copiar código' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(PIX.copiaECola));
    expect(await within(painel).findByRole('button', { name: 'Código copiado' })).toBeInTheDocument();
  });

  it('sem a área de transferência, o código fica selecionado para copiar pelo menu', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockRejectedValue(new Error('negado')) }, configurable: true });
    document.execCommand = vi.fn().mockReturnValue(false);
    renderizar('responsavel', '/mensalidades?pix=4');
    const painel = await screen.findByRole('dialog', { name: 'Pagar com Pix' });
    fireEvent.click(await within(painel).findByRole('button', { name: 'Copiar código' }));
    expect(await within(painel).findByText('O código está selecionado: copie pelo menu do aparelho.')).toBeInTheDocument();
    delete document.execCommand;
  });

  it('as canceladas aparecem à parte; erro do Pix aparece na folha', async () => {
    api.get.mockImplementation(async (caminho) => {
      if (caminho === '/mensalidades') return [mensalidade(4, 'Ana Beatriz', 'pendente', { pixDisponivel: true }), mensalidade(6, 'Ana Beatriz', 'cancelada')];
      throw new ApiError(409, 'A escola ainda não cadastrou a chave Pix.');
    });
    renderizar('responsavel');
    const canceladas = (await screen.findByRole('heading', { name: 'Canceladas pela escola' })).closest('article');
    expect(within(canceladas).getByText('Cobrança cancelada pela escola')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Pagar com Pix/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('A escola ainda não cadastrou a chave Pix.');
  });
});
