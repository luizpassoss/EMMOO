import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/index.js';
import { responderConfirmacao } from '../apoioTestes.js';
import { ApiError } from '../api/client.js';
import AulaPainel from './AulaPainel.jsx';

vi.mock('../api/index.js', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const SEM_ACOES = { registrar: false, cancelar: false, avisarFalta: false, solicitarReposicao: false };

/** Aula como o GET /aulas/:id devolve, com o que cada teste precisar trocar. */
const detalhe = (mudancas = {}) => ({
  id: 2,
  alunoId: 1,
  professorId: 2,
  data: '2026-10-12',
  hora: '14:00',
  duracaoMin: 45,
  status: 'agendada',
  reposicaoDeId: null,
  aluno: { id: 1, nome: 'Ana Beatriz', instrumento: 'Violino' },
  professor: { id: 2, nome: 'Luiz' },
  faltaAvisada: false,
  liberaReposicao: null,
  reposicao: false,
  temDiario: false,
  diario: null,
  avisoFalta: null,
  reposicaoDe: null,
  reposicaoMarcada: null,
  planoAnterior: null,
  reposicaoPossivel: null,
  horasAteAAula: 126,
  ...mudancas,
  acoes: { ...SEM_ACOES, ...mudancas.acoes },
});

function renderizar(props = {}) {
  const callbacks = { onFechar: vi.fn(), onConcluido: vi.fn(), onAtualizada: vi.fn() };
  render(
    <MemoryRouter>
      <AulaPainel aulaId={2} {...callbacks} {...props} />
    </MemoryRouter>,
  );
  return callbacks;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  document.body.style.overflow = '';
});

describe('AulaPainel — escola (RF08/RF09)', () => {
  it('registra presença e diário, mostrando o plano deixado na aula anterior', async () => {
    api.get.mockResolvedValue(
      detalhe({
        acoes: { registrar: true },
        horasAteAAula: -1,
        planoAnterior: { aula: { id: 1, data: '2026-10-05', hora: '14:00' }, planoProxima: 'Arpejos em ré' },
      }),
    );
    api.patch.mockResolvedValue({});
    api.put.mockResolvedValue({});
    const { onConcluido } = renderizar();

    expect(await screen.findByRole('dialog', { name: 'Aula de Ana Beatriz' })).toHaveAccessibleDescription(
      'Segunda, 12/10 · 14:00 às 14:45',
    );
    expect(screen.getByText('A registrar')).toBeInTheDocument(); // já começou e não tem presença: não é mais "Agendada"
    expect(screen.queryByText('Agendada')).not.toBeInTheDocument();
    expect(screen.getByText('Plano deixado na aula de 05/10')).toBeInTheDocument();
    expect(screen.getByText('Arpejos em ré')).toBeInTheDocument();
    const salvar = screen.getByRole('button', { name: 'Salvar registro' });
    expect(salvar).toBeDisabled(); // nada escolhido ainda

    fireEvent.click(screen.getByLabelText('Presente'));
    fireEvent.change(screen.getByLabelText('Conteúdo ministrado'), { target: { value: '  Escalas maiores ' } });
    fireEvent.change(screen.getByLabelText('Plano para a próxima aula (opcional)'), { target: { value: 'Leitura' } });
    fireEvent.click(salvar);

    await waitFor(() => expect(onConcluido).toHaveBeenCalledWith('Presença de Ana Beatriz registrada, com o diário da aula.'));
    expect(api.patch).toHaveBeenCalledWith('/aulas/2/presenca', { status: 'realizada' });
    expect(api.put).toHaveBeenCalledWith('/aulas/2/diario', { conteudoMinistrado: 'Escalas maiores', planoProxima: 'Leitura' });
  });

  it('falta: só a presença, sem diário', async () => {
    api.get.mockResolvedValue(detalhe({ acoes: { registrar: true }, horasAteAAula: -2 }));
    api.patch.mockResolvedValue({});
    const { onConcluido } = renderizar();
    fireEvent.click(await screen.findByLabelText('Faltou'));
    expect(screen.queryByLabelText('Conteúdo ministrado')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar registro' }));
    await waitFor(() => expect(onConcluido).toHaveBeenCalledWith('Falta de Ana Beatriz registrada.'));
    expect(api.put).not.toHaveBeenCalled();
  });

  it('edita o diário de aula já registrada; plano sem conteúdo é recusado antes de enviar', async () => {
    api.get.mockResolvedValue(
      detalhe({
        status: 'realizada',
        temDiario: true,
        diario: { conteudoMinistrado: 'Escalas', planoProxima: null },
        acoes: { registrar: true },
        horasAteAAula: -30,
      }),
    );
    api.put.mockResolvedValue({});
    const { onConcluido } = renderizar();
    const conteudo = await screen.findByLabelText('Conteúdo ministrado');
    expect(conteudo).toHaveValue('Escalas');
    fireEvent.change(conteudo, { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Plano para a próxima aula (opcional)'), { target: { value: 'Arpejos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar registro' }));
    expect(await screen.findByText('Descreva o conteúdo da aula para guardar o plano da próxima.')).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();

    fireEvent.change(conteudo, { target: { value: 'Escalas e arpejos' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar registro' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/aulas/2/diario', { conteudoMinistrado: 'Escalas e arpejos', planoProxima: 'Arpejos' }));
    expect(api.patch).not.toHaveBeenCalled(); // a presença não mudou
    expect(onConcluido).toHaveBeenCalled();
  });

  it('erro da API aparece junto ao campo', async () => {
    api.get.mockResolvedValue(detalhe({ acoes: { registrar: true }, horasAteAAula: -1, status: 'falta' }));
    api.patch.mockRejectedValue(
      new ApiError(409, 'Esta falta já tem reposição marcada. Cancele a reposição antes de registrar presença.'),
    );
    renderizar();
    fireEvent.click(await screen.findByLabelText('Presente'));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar registro' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta falta já tem reposição marcada.');
  });

  it('cancela a aula, avisando que o aluno poderá repor (RN12)', async () => {
    api.get.mockResolvedValue(detalhe({ acoes: { cancelar: true } }));
    api.patch.mockResolvedValue({});
    const { onConcluido } = renderizar();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancelar aula' }));
    await responderConfirmacao('Cancelar aula', {
      name: 'Cancelar esta aula?',
      description:
        'Ana Beatriz · Segunda, 12/10 às 14:00. O horário ficará disponível para outro aluno. ' +
        'Como o cancelamento é da escola, o aluno poderá repor a aula.',
    });
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/aulas/2/cancelar'));
    expect(onConcluido).toHaveBeenCalledWith('Aula de Ana Beatriz em Segunda, 12/10 às 14:00 cancelada.');
  });
});

describe('AulaPainel — família (RF06/RF07)', () => {
  it('avisa falta com antecedência e, em seguida, marca a reposição num horário livre', async () => {
    let avisada = false;
    api.get.mockImplementation(async (caminho) => {
      if (caminho === '/reposicoes/2/vagas') {
        return {
          prazoAte: '2026-11-11',
          vagas: [
            { data: '2026-10-12', hora: '14:45', duracaoMin: 45 },
            { data: '2026-10-14', hora: '14:00', duracaoMin: 45 },
          ],
        };
      }
      return avisada
        ? detalhe({
            status: 'falta',
            faltaAvisada: true,
            avisoFalta: { dataSolicitacao: '2026-10-07T11:00:00.000Z', liberaReposicao: true },
            reposicaoPossivel: { permitido: true, bloqueio: null, mensagem: null, prazoAte: '2026-11-11', contaNoLimite: true },
            acoes: { solicitarReposicao: true },
          })
        : detalhe({ acoes: { avisarFalta: true } });
    });
    api.post.mockImplementation(async (caminho) => {
      if (caminho === '/aulas/2/falta') {
        avisada = true;
        return { liberaReposicao: true };
      }
      return { aula: { id: 17, data: '2026-10-14', hora: '14:00' } };
    });
    const { onAtualizada, onConcluido } = renderizar();

    expect(await screen.findByText(/Com 5 dias de antecedência, a falta dá direito a repor a aula/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Avisar falta' }));
    await responderConfirmacao('Avisar falta', { name: 'Avisar falta?' });
    await waitFor(() => expect(onAtualizada).toHaveBeenCalledWith('Falta avisada. A aula pode ser reposta até 11/11.'));

    // A folha continua aberta, agora com a escolha do horário da reposição.
    expect(await screen.findByText('Horário da reposição')).toBeInTheDocument();
    expect(screen.getByText(/Falta avisada em .*, com antecedência: dá direito a reposição\./)).toBeInTheDocument();
    expect(screen.getByText('Horários livres de Luiz até 11/11, sem custo adicional.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar reposição' }));
    expect(await screen.findByText('Escolha um dos horários livres.')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Quarta, 14/10 às 14:00'));
    fireEvent.click(screen.getByRole('button', { name: 'Marcar reposição' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/reposicoes', { aulaId: 2, data: '2026-10-14', hora: '14:00' }));
    expect(onConcluido).toHaveBeenCalledWith('Reposição de Ana Beatriz marcada para Quarta, 14/10 às 14:00.');
  });

  it('com menos de 24 horas, explica que a falta não dá reposição', async () => {
    api.get.mockResolvedValue(detalhe({ acoes: { avisarFalta: true }, horasAteAAula: 20 }));
    renderizar();
    expect(
      await screen.findByText('Faltam menos de 24 horas para a aula: a falta fica registrada e o horário é liberado, mas sem direito a reposição.'),
    ).toBeInTheDocument();
  });

  it('horário tomado no meio do caminho: mostra as sugestões da API e atualiza as vagas', async () => {
    api.get.mockImplementation(async (caminho) =>
      caminho.endsWith('/vagas')
        ? { prazoAte: '2026-11-11', vagas: [{ data: '2026-10-14', hora: '14:00', duracaoMin: 45 }] }
        : detalhe({ status: 'falta', acoes: { solicitarReposicao: true } }),
    );
    api.post.mockRejectedValue(
      new ApiError(409, 'Horário indisponível.', [
        { campo: 'hora', mensagem: 'Este horário não está livre. Horários livres no prazo: 19/10/2026 às 14:45.' },
      ]),
    );
    renderizar();
    fireEvent.click(await screen.findByLabelText('Quarta, 14/10 às 14:00'));
    fireEvent.click(screen.getByRole('button', { name: 'Marcar reposição' }));
    expect(await screen.findByText('Este horário não está livre. Horários livres no prazo: 19/10/2026 às 14:45.')).toBeInTheDocument();
    await waitFor(() => expect(api.get.mock.calls.filter(([caminho]) => caminho.endsWith('/vagas'))).toHaveLength(2));
  });

  it('mostra por que a reposição não é possível e o diário da aula, só para leitura', async () => {
    api.get.mockResolvedValue(
      detalhe({
        status: 'falta',
        avisoFalta: { dataSolicitacao: '2026-10-11T18:00:00.000Z', liberaReposicao: false },
        reposicaoPossivel: {
          permitido: false,
          bloqueio: 'AVISO_FORA_DO_PRAZO',
          mensagem: 'A falta foi avisada com menos de 24 horas de antecedência: ela fica registrada, mas não dá direito a reposição.',
          prazoAte: '2026-11-11',
          contaNoLimite: true,
        },
      }),
    );
    renderizar();
    expect(await screen.findByText(/com menos de 24 horas de antecedência: sem direito a reposição\./)).toBeInTheDocument();
    expect(screen.getByText(/ela fica registrada, mas não dá direito a reposição\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Marcar reposição' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver o histórico de Ana' })).toHaveAttribute('href', '/alunos/1');
  });

  it('reposição: diz de qual aula é e quando ficou marcada', async () => {
    api.get.mockResolvedValue(
      detalhe({
        id: 17,
        reposicao: true,
        reposicaoDeId: 2,
        reposicaoDe: { id: 2, data: '2026-10-12', hora: '14:00', duracaoMin: 45, status: 'falta' },
        diario: { conteudoMinistrado: 'Escalas', planoProxima: 'Arpejos' },
      }),
    );
    renderizar({ comHistorico: false });
    expect(await screen.findByText('Reposição da aula de Segunda, 12/10 às 14:00.')).toBeInTheDocument();
    expect(screen.getAllByText('Reposição')).not.toHaveLength(0);
    const dialogo = screen.getByRole('dialog');
    expect(within(dialogo).getByText('Conteúdo da aula')).toBeInTheDocument();
    expect(within(dialogo).getByText('Arpejos')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /histórico/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument(); // sem ação, sem rodapé
  });

  it('erro ao carregar a aula', async () => {
    api.get.mockRejectedValue(new ApiError(404, 'Aula não encontrada.'));
    renderizar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Aula não encontrada.');
  });
});

describe('AulaPainel — remarcar (nova data e horário, a mesma aula)', () => {
  beforeEach(() => {
    api.get.mockImplementation(async (caminho) => {
      if (caminho === '/aulas/2') return detalhe({ acoes: { cancelar: true, remarcar: true } });
      if (caminho === '/horarios/livres?professorId=2&inicio=2026-10-14&fim=2026-10-14') {
        return [
          { data: '2026-10-14', hora: '14:00', duracaoMin: 45 },
          { data: '2026-10-14', hora: '15:30', duracaoMin: 45 },
        ];
      }
      if (caminho.startsWith('/horarios/livres')) return [];
      throw new Error(`GET não simulado: ${caminho}`);
    });
  });

  it('escolhe a data, toca num horário livre do professor e remarca', async () => {
    api.patch.mockResolvedValue({ mensagem: 'Aula remarcada de 12/10/2026 às 14:00 para 14/10/2026 às 15:30.' });
    const { onConcluido } = renderizar();
    const painel = await screen.findByRole('dialog', { name: 'Aula de Ana Beatriz' });
    fireEvent.click(within(painel).getByRole('button', { name: 'Remarcar' }));
    const remarcar = screen.getByRole('dialog', { name: 'Remarcar a aula de Ana Beatriz' });
    fireEvent.click(within(remarcar).getByRole('button', { name: 'Remarcar aula' }));
    expect(await within(remarcar).findByText('Escolha a nova data.')).toBeInTheDocument();
    expect(api.patch).not.toHaveBeenCalled();

    fireEvent.change(within(remarcar).getByLabelText('Nova data'), { target: { value: '2026-10-14' } });
    expect(await within(remarcar).findByText(/Horários livres de Luiz em/)).toBeInTheDocument();
    fireEvent.click(within(remarcar).getByRole('button', { name: '15:30' }));
    expect(within(remarcar).getByLabelText('Novo horário')).toHaveValue('15:30');
    fireEvent.click(within(remarcar).getByRole('button', { name: 'Remarcar aula' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/aulas/2/remarcar', { data: '2026-10-14', hora: '15:30' }));
    expect(onConcluido).toHaveBeenCalledWith('Aula remarcada de 12/10/2026 às 14:00 para 14/10/2026 às 15:30.');
  });

  it('dia sem horário livre permite digitar; conflito da API aparece no campo; "Voltar" desiste', async () => {
    api.patch.mockRejectedValue(
      new ApiError(409, 'Conflito de agenda.', [{ campo: 'hora', mensagem: '15/10/2026 às 09:00: o aluno já tem aula das 09:00.' }]),
    );
    renderizar();
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Remarcar' }));
    const remarcar = screen.getByRole('dialog', { name: 'Remarcar a aula de Ana Beatriz' });
    fireEvent.change(within(remarcar).getByLabelText('Nova data'), { target: { value: '2026-10-15' } });
    expect(await within(remarcar).findByText(/Nenhum horário de atendimento livre neste dia/)).toBeInTheDocument();
    fireEvent.change(within(remarcar).getByLabelText('Novo horário'), { target: { value: '09:00' } });
    fireEvent.click(within(remarcar).getByRole('button', { name: 'Remarcar aula' }));
    expect(await within(remarcar).findByText('15/10/2026 às 09:00: o aluno já tem aula das 09:00.')).toBeInTheDocument();
    fireEvent.click(within(remarcar).getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('dialog', { name: 'Aula de Ana Beatriz' })).toBeInTheDocument();
  });

  it('aula remarcada diz de quando ela saiu; sem a ação, não há o botão', async () => {
    api.get.mockResolvedValue(
      detalhe({ remarcadaDe: { dataHora: '2026-10-05T14:00', em: '2026-10-01T12:00:00.000Z', vezes: 1 } }),
    );
    renderizar();
    const painel = await screen.findByRole('dialog', { name: 'Aula de Ana Beatriz' });
    expect(within(painel).getByText('Aula remarcada. Antes: Segunda, 05/10 às 14:00.')).toBeInTheDocument();
    expect(within(painel).queryByRole('button', { name: 'Remarcar' })).not.toBeInTheDocument();
  });
});
