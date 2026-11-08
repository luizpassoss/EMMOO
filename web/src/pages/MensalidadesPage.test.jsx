import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { responderConfirmacao } from '../apoioTestes.js';
import { AuthContext } from '../auth/AuthContext.jsx';
import { salvarArquivo } from '../utils/arquivo.js';
import MensalidadesPage from './MensalidadesPage.jsx';

vi.mock('../api/index.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), baixar: vi.fn() },
}));
vi.mock('../utils/arquivo.js', () => ({ salvarArquivo: vi.fn() }));

const mensalidade = (id, nome, status, extra = {}) => ({
  id,
  mesReferencia: '2026-10',
  valor: 140,
  vencimento: '2026-10-10',
  status,
  dataPagamento: null,
  formaPagamento: null,
  formaPagamentoNome: null,
  aluno: { id, nome, instrumento: 'Violino' },
  plano: { id: 1, nome: 'Particular · 1 aula por semana' },
  responsavel: { id: 3, nome: 'Mary' },
  ...extra,
});
const PAGA = { dataPagamento: '2026-10-05', formaPagamento: 'pix', formaPagamentoNome: 'Pix' };
const RESUMO = {
  atrasadas: { quantidade: 1, valor: 112 },
  vencendo: { quantidade: 0, valor: 0 },
  email: { configurado: false, pendentes: 1, enviados: 0, ultimoErro: null },
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
    mensalidade(1, 'Ana Beatriz', 'paga', PAGA),
    mensalidade(2, 'Pedro Henrique', 'atrasada', { valor: 112 }),
    mensalidade(3, 'Zeca', 'pendente', { vencimento: '2026-10-22', responsavel: null }),
  ];
  api.get.mockImplementation(async (caminho) => {
    if (caminho === '/mensalidades/alertas') return RESUMO;
    if (caminho.startsWith('/mensalidades?mes=')) return caminho.endsWith('2026-10') ? lista : [];
    throw new Error(`GET não simulado: ${caminho}`);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('MensalidadesPage — coordenação (RF10–RF12, RF15)', () => {
  it('mostra o mês com totais, alertas e a situação de cada mensalidade', async () => {
    renderizar();
    expect(await screen.findByText('Ana Beatriz')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/mensalidades?mes=2026-10');
    expect(screen.getByText('Outubro de 2026')).toBeInTheDocument();
    expect(screen.getByText('Previsto').nextSibling).toHaveTextContent(/R\$\s392,00/);
    expect(screen.getByText('Recebido').nextSibling).toHaveTextContent(/R\$\s140,00/);
    expect(screen.getByText(/^Pix R\$\s140$/)).toBeInTheDocument(); // quanto entrou por forma de pagamento
    expect(screen.getByText('Em aberto').nextSibling).toHaveTextContent(/R\$\s252,00/);
    expect(screen.getByText(/R\$\s112,00 em atraso/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Histórico de pagamentos' })).toHaveAttribute('href', '/mensalidades/pagamentos');
    expect(screen.queryByRole('searchbox', { name: 'Buscar aluno' })).not.toBeInTheDocument(); // poucas: sem busca

    const alertas = screen.getByRole('article', { name: 'Alertas de pagamento' });
    expect(within(alertas).getByText(/1 mensalidade atrasada \(R\$\s112,00\)/)).toBeInTheDocument();
    expect(within(alertas).getByText('Os alertas por e-mail estão desligados.')).toBeInTheDocument();
    expect(within(alertas).queryByRole('button', { name: /Enviar/ })).not.toBeInTheDocument();

    expect(screen.getByText('Paga em 05/10 · Pix')).toBeInTheDocument();
    expect(screen.getByText('Venceu em 10/10')).toBeInTheDocument();
    expect(screen.getByText('Vence em 22/10')).toBeInTheDocument();

    const situacao = screen.getByRole('combobox', { name: 'Situação' });
    expect(within(situacao).getByRole('option', { name: 'Atrasadas (1)' })).toBeInTheDocument();
    fireEvent.change(situacao, { target: { value: 'atrasada' } });
    expect(screen.queryByText('Ana Beatriz')).not.toBeInTheDocument();
    expect(screen.getByText('Pedro Henrique')).toBeInTheDocument();
  });

  it('com muitas mensalidades no mês, a busca por aluno aparece', async () => {
    lista = ['Ana', 'Bia', 'Caio', 'Davi', 'Eva', 'Fábio', 'João'].map((nome, i) => mensalidade(i + 1, nome, 'pendente'));
    renderizar();
    const busca = await screen.findByRole('searchbox', { name: 'Buscar aluno' });
    fireEvent.change(busca, { target: { value: 'fabio' } });
    expect(screen.getByText('Fábio')).toBeInTheDocument();
    expect(screen.queryByText('Ana')).not.toBeInTheDocument();
    fireEvent.change(busca, { target: { value: 'zé' } });
    expect(screen.getByText('Nenhum aluno encontrado.')).toBeInTheDocument();
  });

  it('gera as mensalidades do mês, depois de explicar como', async () => {
    renderizar();
    await screen.findByText('Ana Beatriz');
    api.post.mockResolvedValue({ mes: '2026-10', criadas: 1, jaExistiam: 3, ignorados: [{ aluno: { id: 9, nome: 'Leo' }, motivo: 'Plano não encontrado.' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar mensalidades' }));
    await responderConfirmacao('Gerar mensalidades', { name: 'Gerar as mensalidades de outubro de 2026?' });
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/mensalidades/gerar', { mes: '2026-10' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      '1 mensalidade gerada para outubro de 2026. Ficaram de fora: Leo (plano não encontrado).',
    );
  });

  it('meses: até dois à frente para gerar; mês sem cobrança diz isso', async () => {
    renderizar('coordenacao', '/mensalidades?mes=2026-12');
    expect(await screen.findByText('Nenhuma mensalidade de dezembro de 2026.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próximo mês' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Gerar mensalidades' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mês atual' }));
    expect(await screen.findByText('Ana Beatriz')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));
    expect(await screen.findByText('Nenhuma mensalidade de setembro de 2026.')).toBeInTheDocument();
    expect(screen.getByText('Não houve cobrança neste mês.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gerar mensalidades' })).not.toBeInTheDocument();
  });

  it('RF11 — registra o pagamento (Pix ou dinheiro) e a janela já oferece o recibo', async () => {
    renderizar();
    fireEvent.click(await screen.findByText('Zeca'));
    const painel = await screen.findByRole('dialog', { name: 'Registrar pagamento' });
    expect(within(painel).getByLabelText('Data do pagamento')).toHaveValue('2026-10-17');
    const formas = within(painel).getByRole('group', { name: 'Forma de pagamento' });
    expect(within(formas).getAllByRole('radio').map((opcao) => opcao.value)).toEqual(['pix', 'dinheiro']); // só essas
    fireEvent.click(within(formas).getByLabelText('Dinheiro'));
    expect(within(painel).getByRole('link', { name: 'Ver os pagamentos de Zeca' })).toHaveAttribute(
      'href',
      '/mensalidades/pagamentos?aluno=3',
    );
    api.patch.mockImplementation(async () => {
      lista = lista.map((m) => (m.id === 3 ? { ...m, status: 'paga', dataPagamento: '2026-10-17', formaPagamento: 'dinheiro', formaPagamentoNome: 'Dinheiro' } : m));
      return {};
    });
    fireEvent.click(within(painel).getByRole('button', { name: 'Registrar pagamento' }));
    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith('/mensalidades/3/pagamento', { dataPagamento: '2026-10-17', formaPagamento: 'dinheiro' }),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Pagamento de Zeca (outubro de 2026) registrado. O recibo já pode ser baixado.',
    );
    const paga = await screen.findByRole('dialog', { name: 'Mensalidade paga' });
    expect(within(paga).getByRole('button', { name: 'Baixar recibo' })).toBeInTheDocument();
  });

  it('RF11 — erro de validação aparece no campo', async () => {
    renderizar();
    fireEvent.click(await screen.findByText('Zeca'));
    const painel = await screen.findByRole('dialog', { name: 'Registrar pagamento' });
    const { ApiError } = await import('../api/client.js');
    api.patch.mockRejectedValue(
      new ApiError(400, 'Dados inválidos.', [{ campo: 'formaPagamento', mensagem: 'Escolha a forma de pagamento: Pix ou dinheiro.' }]),
    );
    fireEvent.click(within(painel).getByRole('button', { name: 'Registrar pagamento' }));
    expect(await within(painel).findByText('Escolha a forma de pagamento: Pix ou dinheiro.')).toBeInTheDocument();
  });

  it('RF15 — mensalidade paga: baixa o recibo ou desfaz a baixa', async () => {
    renderizar();
    fireEvent.click(await screen.findByText('Ana Beatriz'));
    const painel = await screen.findByRole('dialog', { name: 'Mensalidade paga' });
    const pdf = new Blob(['%PDF'], { type: 'application/pdf' });
    api.baixar.mockResolvedValue({ conteudo: pdf, arquivo: 'recibo-2026-10-ana-beatriz.pdf' });
    fireEvent.click(within(painel).getByRole('button', { name: 'Baixar recibo' }));
    await waitFor(() => expect(salvarArquivo).toHaveBeenCalledWith(pdf, 'recibo-2026-10-ana-beatriz.pdf'));
    expect(api.baixar).toHaveBeenCalledWith('/mensalidades/1/recibo');

    api.delete.mockResolvedValue({});
    fireEvent.click(within(painel).getByRole('button', { name: 'Desfazer pagamento' }));
    await responderConfirmacao('Desfazer pagamento', { name: 'Desfazer este pagamento?' });
    await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/mensalidades/1/pagamento'));
    expect(await screen.findByRole('status')).toHaveTextContent('Pagamento de Ana Beatriz desfeito');
  });

  it('RF12 — com e-mail configurado, envia os alertas pendentes', async () => {
    const configurado = { ...RESUMO, email: { configurado: true, pendentes: 2, enviados: 0, ultimoErro: 'SMTP fora do ar' } };
    api.get.mockImplementation(async (caminho) => (caminho === '/mensalidades/alertas' ? configurado : lista));
    api.post.mockResolvedValue({
      enviados: 1,
      falhas: 1,
      resumo: { ...configurado, email: { configurado: true, pendentes: 1, enviados: 1, ultimoErro: 'SMTP fora do ar' } },
    });
    renderizar();
    const alertas = await screen.findByRole('article', { name: 'Alertas de pagamento' });
    expect(within(alertas).getByText('2 alertas aguardam envio por e-mail. Última falha: SMTP fora do ar')).toBeInTheDocument();
    fireEvent.click(within(alertas).getByRole('button', { name: 'Enviar agora' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/mensalidades/alertas/enviar'));
    expect(await screen.findByRole('status')).toHaveTextContent('1 alerta enviado; 1 falhou e fica para depois.');
  });
});

describe('MensalidadesPage — responsável', () => {
  it('vê as mensalidades dos dependentes e baixa o recibo das pagas', async () => {
    const ana = { id: 1, nome: 'Ana Beatriz', instrumento: 'Violino' };
    api.get.mockResolvedValue([
      mensalidade(4, 'Ana Beatriz', 'pendente', { mesReferencia: '2026-11', vencimento: '2026-11-10', aluno: ana }),
      mensalidade(1, 'Ana Beatriz', 'paga', { ...PAGA, aluno: ana }),
    ]);
    api.baixar.mockResolvedValue({ conteudo: new Blob(['%PDF']), arquivo: null });
    renderizar('responsavel');
    expect(await screen.findByText('Novembro de 2026')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('/mensalidades');
    expect(screen.getByText('Em aberto', { selector: '.indicador-rotulo' }).nextSibling).toHaveTextContent(/R\$\s140,00/);
    // Duas partes: o que está em aberto e os últimos pagamentos (o histórico completo fica no botão).
    const emAberto = screen.getByRole('heading', { name: 'Em aberto' }).closest('article');
    expect(within(emAberto).getByText('Novembro de 2026')).toBeInTheDocument();
    const pagos = screen.getByRole('heading', { name: 'Últimos pagamentos' }).closest('article');
    expect(within(pagos).getByText('Outubro de 2026')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Histórico de pagamentos' })).toHaveAttribute('href', '/mensalidades/pagamentos');
    expect(screen.queryByRole('button', { name: 'Gerar mensalidades' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Baixar recibo de novembro de 2026' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Baixar recibo de outubro de 2026' }));
    await waitFor(() => expect(salvarArquivo).toHaveBeenCalledWith(expect.any(Blob), 'recibo-2026-10.pdf'));
  });

  it('tudo pago: "Tudo em dia"', async () => {
    api.get.mockResolvedValue([mensalidade(1, 'Ana Beatriz', 'paga', PAGA)]);
    renderizar('responsavel');
    expect(await screen.findByText('Tudo em dia.')).toBeInTheDocument();
  });

  it('com mais de um dependente, cada mensalidade diz de quem é', async () => {
    api.get.mockResolvedValue([mensalidade(4, 'Ana Beatriz', 'pendente'), mensalidade(5, 'Leo', 'pendente')]);
    renderizar('responsavel');
    expect(await screen.findByText('Outubro de 2026 · Leo')).toBeInTheDocument();
  });

  it('erro ao baixar o recibo aparece na página', async () => {
    api.get.mockResolvedValue([mensalidade(1, 'Ana Beatriz', 'paga', PAGA)]);
    api.baixar.mockRejectedValue(new Error('Mensalidade não encontrada.'));
    renderizar('responsavel');
    fireEvent.click(await screen.findByRole('button', { name: 'Baixar recibo de outubro de 2026' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Mensalidade não encontrada.');
  });
});
