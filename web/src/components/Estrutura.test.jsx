import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { responderConfirmacao } from '../apoioTestes.js';
import {
  Aviso,
  CabecalhoPagina,
  Carregando,
  INICIO_DA_SESSAO,
  Painel,
  useAviso,
  useConfirmacao,
  Vazio,
} from './Estrutura.jsx';

function ComAviso() {
  const [aviso, setAviso] = useAviso(3000);
  return (
    <>
      <button type="button" onClick={() => setAviso('Plano cadastrado.')}>
        salvar
      </button>
      <Aviso>{aviso}</Aviso>
    </>
  );
}

/** Página de exemplo que pede confirmação antes de excluir e entrega a resposta para o teste. */
function ComConfirmacao({ onResposta, perigo = true }) {
  const [confirmar, confirmacao] = useConfirmacao();
  async function excluir() {
    onResposta(await confirmar({ titulo: 'Excluir o plano?', mensagem: 'Não pode ser desfeito.', acao: 'Excluir', perigo }));
  }
  return (
    <>
      <button type="button" onClick={excluir}>
        Excluir plano
      </button>
      {confirmacao}
    </>
  );
}

const dialogo = () => screen.getByRole('alertdialog');

/** Simula a tela do celular (o jsdom não tem matchMedia). */
function simularCelular() {
  window.matchMedia = vi.fn((consulta) => ({ matches: ['(max-width: 767px)', '(pointer: coarse)'].includes(consulta), media: consulta }));
}

afterEach(() => {
  vi.useRealTimers();
  window.history.replaceState(null, ''); // sem página anterior
  delete window.matchMedia;
});

/** Simula a posição no histórico que o React Router grava (0 = primeira página aberta). */
const posicaoNoHistorico = (idx) => window.history.replaceState({ idx }, '');

function renderizarPaginas(entradas, indice) {
  return render(
    <MemoryRouter initialEntries={entradas} initialIndex={indice}>
      <Routes>
        <Route path="/" element={<CabecalhoPagina titulo="Início" />} />
        <Route path="/agenda" element={<CabecalhoPagina voltar titulo="Agenda" />} />
        <Route path="/alunos" element={<CabecalhoPagina voltar titulo="Alunos" />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('botão Voltar', () => {
  it('volta para a página anterior do app', () => {
    posicaoNoHistorico(1);
    renderizarPaginas(['/agenda', '/alunos'], 1);
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('heading', { name: 'Agenda' })).toBeInTheDocument();
  });

  it('sem página anterior (link direto), leva ao Início em vez de sair do sistema', () => {
    posicaoNoHistorico(0);
    renderizarPaginas(['/alunos'], 0);
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveAttribute('title', 'Voltar ao início');
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    expect(screen.getByRole('heading', { name: 'Início' })).toBeInTheDocument();
  });

  it('as páginas do menu não têm "Voltar" (o menu já leva a elas), mesmo com página anterior', () => {
    posicaoNoHistorico(1);
    renderizarPaginas(['/agenda', '/'], 1);
    expect(screen.getByRole('heading', { name: 'Início' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voltar' })).not.toBeInTheDocument();
  });

  it('logo após entrar, o que ficou para trás (login, cadastro) não conta como página anterior', () => {
    posicaoNoHistorico(1);
    const { unmount } = renderizarPaginas(['/cadastro', { pathname: '/', state: INICIO_DA_SESSAO }], 1);
    expect(screen.queryByRole('button', { name: 'Voltar' })).not.toBeInTheDocument();
    unmount();

    // Se o destino do login for outra página, o "Voltar" dela leva ao Início.
    renderizarPaginas(['/login', { pathname: '/alunos', state: INICIO_DA_SESSAO }], 1);
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveAttribute('title', 'Voltar ao início');
  });
});

describe('componentes de estrutura', () => {
  it('o aviso aparece e some sozinho', () => {
    vi.useFakeTimers();
    render(<ComAviso />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('salvar'));
    expect(screen.getByRole('status')).toHaveTextContent('Plano cadastrado.');
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('cabeçalho mostra título, descrição e ações', () => {
    render(
      <MemoryRouter>
        <CabecalhoPagina titulo="Alunos" descricao="Cadastro de alunos.">
          <button type="button">Novo aluno</button>
        </CabecalhoPagina>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Alunos' })).toBeInTheDocument();
    expect(screen.getByText('Cadastro de alunos.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Novo aluno' })).toBeInTheDocument();
  });

  it('painel envia o formulário e fecha pelo X', () => {
    const onSubmit = vi.fn((e) => e.preventDefault());
    const onFechar = vi.fn();
    render(
      <Painel titulo="Novo plano" onFechar={onFechar} onSubmit={onSubmit}>
        <button type="submit">Salvar</button>
      </Painel>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it('painel: ao abrir, o foco vai ao primeiro campo; com erro, ao primeiro inválido', () => {
    const { rerender } = render(
      <Painel titulo="Novo aluno" onFechar={() => {}} erros={{}}>
        <input aria-label="Nome" />
        <input aria-label="Plano" />
      </Painel>,
    );
    expect(screen.getByLabelText('Nome')).toHaveFocus();
    rerender(
      <Painel titulo="Novo aluno" onFechar={() => {}} erros={{ planoId: 'Selecione um plano.' }}>
        <input aria-label="Nome" />
        <input aria-label="Plano" aria-invalid="true" />
      </Painel>,
    );
    expect(screen.getByLabelText('Plano')).toHaveFocus();
  });

  it('painel: os botões segmentados não recebem o foco inicial; vai para o primeiro campo de digitar', () => {
    render(
      <Painel titulo="Novo plano" onFechar={() => {}}>
        <input type="radio" aria-label="Particular" name="tipo" />
        <input aria-label="Valor" />
      </Painel>,
    );
    expect(screen.getByLabelText('Valor')).toHaveFocus();
  });

  it('painel: erro sem campo leva o alerta para a vista', () => {
    const rolar = vi.fn();
    Element.prototype.scrollIntoView = rolar; // o jsdom não implementa
    try {
      render(
        <Painel titulo="Novo aluno" onFechar={() => {}} erros={{ geral: 'Falha de rede.' }}>
          <p className="alerta">Falha de rede.</p>
        </Painel>,
      );
      expect(rolar).toHaveBeenCalledWith({ block: 'nearest' });
    } finally {
      delete Element.prototype.scrollIntoView;
    }
  });

  it('painel é uma janela com título e descrição; Esc e o fundo escuro fecham', () => {
    const onFechar = vi.fn();
    render(
      <Painel titulo="Novo plano" descricao="Tipo, valor e duração." onFechar={onFechar}>
        <input aria-label="Nome" />
      </Painel>,
    );
    const janela = screen.getByRole('dialog', { name: 'Novo plano' });
    expect(janela).toHaveAttribute('aria-modal', 'true');
    expect(janela).toHaveAccessibleDescription('Tipo, valor e duração.');
    fireEvent.keyDown(screen.getByLabelText('Nome'), { key: 'Enter' });
    expect(onFechar).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByLabelText('Nome'), { key: 'Escape' });
    expect(onFechar).toHaveBeenCalledTimes(1);
    fireEvent.click(document.querySelector('.painel-fundo'));
    expect(onFechar).toHaveBeenCalledTimes(2);
  });

  it('painel: rodapé com as outras ações, "Cancelar" e a ação principal', () => {
    const onFechar = vi.fn();
    const inativar = vi.fn();
    render(
      <Painel
        titulo="Editar aluno"
        onFechar={onFechar}
        acao={<button type="submit">Salvar alterações</button>}
        outrasAcoes={
          <button type="button" onClick={inativar}>
            Inativar aluno
          </button>
        }
      >
        <input aria-label="Nome" />
      </Painel>,
    );
    const rodape = document.querySelector('.painel-rodape');
    expect([...rodape.querySelectorAll('button')].map((botao) => botao.textContent)).toEqual([
      'Inativar aluno',
      'Cancelar',
      'Salvar alterações',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Inativar aluno' }));
    expect(inativar).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it('painel sem ação principal não tem rodapé', () => {
    render(
      <Painel titulo="Novo plano" onFechar={() => {}}>
        <input aria-label="Nome" />
      </Painel>,
    );
    expect(document.querySelector('.painel-rodape')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  });

  it('painel: o Tab circula dentro da janela e, ao fechar, o foco volta para quem a abriu', () => {
    function ComPainel() {
      const [aberto, setAberto] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setAberto(true)}>
            Novo aluno
          </button>
          {aberto && (
            <Painel titulo="Novo aluno" onFechar={() => setAberto(false)} acao={<button type="submit">Cadastrar</button>}>
              <input aria-label="Nome" />
            </Painel>
          )}
        </>
      );
    }
    render(<ComPainel />);
    const abrir = screen.getByRole('button', { name: 'Novo aluno' });
    abrir.focus();
    fireEvent.click(abrir);
    const fechar = screen.getByRole('button', { name: 'Fechar' });
    const cadastrar = screen.getByRole('button', { name: 'Cadastrar' });
    expect(screen.getByLabelText('Nome')).toHaveFocus();

    cadastrar.focus();
    fireEvent.keyDown(cadastrar, { key: 'Tab' });
    expect(fechar).toHaveFocus(); // do último volta ao primeiro (o X)
    fireEvent.keyDown(fechar, { key: 'Tab', shiftKey: true });
    expect(cadastrar).toHaveFocus();
    abrir.focus(); // foco fora da janela (atrás do fundo escuro): o Tab traz de volta
    fireEvent.keyDown(abrir, { key: 'Tab' });
    expect(fechar).toHaveFocus();

    fireEvent.keyDown(fechar, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(abrir).toHaveFocus();
  });

  it('painel no celular: foca a janela (sem abrir o teclado sozinho) e a página atrás não rola', () => {
    simularCelular();
    document.body.style.overflow = 'auto';
    const { unmount } = render(
      <Painel titulo="Novo plano" onFechar={() => {}}>
        <input aria-label="Nome" />
      </Painel>,
    );
    expect(screen.getByRole('dialog', { name: 'Novo plano' })).toHaveFocus();
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.body).toHaveClass('com-painel');
    unmount();
    expect(document.body.style.overflow).toBe('auto');
    expect(document.body).not.toHaveClass('com-painel');
    document.body.style.overflow = '';
  });

  it('painel no computador: também trava a rolagem da página atrás', () => {
    const { unmount } = render(<Painel titulo="Novo plano" onFechar={() => {}} />);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('estado vazio e esqueleto de carregamento', () => {
    render(
      <>
        <Vazio titulo="Nenhum plano cadastrado.">Cadastre o primeiro.</Vazio>
        <Carregando linhas={2} />
      </>,
    );
    expect(screen.getByText('Nenhum plano cadastrado.')).toBeInTheDocument();
    expect(screen.getByText('Cadastre o primeiro.')).toBeInTheDocument();
    expect(screen.getByText('Carregando…')).toBeInTheDocument();
    expect(document.querySelectorAll('.esqueleto-linha')).toHaveLength(2);
  });
});

describe('janela com alterações não salvas', () => {
  function JanelaAlterada({ onFechar }) {
    return (
      <Painel titulo="Editar aluno" onFechar={onFechar} alterado acao={<button type="submit">Salvar</button>}>
        <input aria-label="Nome" />
      </Painel>
    );
  }

  it('fechar pergunta antes de descartar: "Voltar" continua editando, "Descartar" fecha', async () => {
    const onFechar = vi.fn();
    render(<JanelaAlterada onFechar={onFechar} />);
    fireEvent.keyDown(screen.getByLabelText('Nome'), { key: 'Escape' });
    await responderConfirmacao('Voltar', {
      name: 'Descartar as alterações?',
      description: 'O que foi preenchido neste formulário ainda não foi salvo e será perdido.',
    });
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(onFechar).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Editar aluno' })).toBeInTheDocument();

    for (const fechar of [
      () => fireEvent.click(screen.getByRole('button', { name: 'Fechar' })),
      () => fireEvent.click(screen.getByRole('button', { name: 'Cancelar' })),
      () => fireEvent.click(document.querySelector('.painel-fundo')),
    ]) {
      fechar();
      await responderConfirmacao('Voltar');
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    }
    expect(onFechar).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar' }));
    await responderConfirmacao('Descartar');
    await waitFor(() => expect(onFechar).toHaveBeenCalledTimes(1));
  });

  it('sem alterações, fecha direto, sem perguntar', () => {
    const onFechar = vi.fn();
    render(
      <Painel titulo="Editar aluno" onFechar={onFechar} acao={<button type="submit">Salvar</button>}>
        <input aria-label="Nome" />
      </Painel>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onFechar).toHaveBeenCalledTimes(1);
  });
});

describe('janela no celular: arrastar o cabeçalho para baixo fecha', () => {
  // O jsdom não tem PointerEvent: um MouseEvent com pointerId faz o papel (clientY vem do MouseEvent).
  class PonteiroFalso extends MouseEvent {
    constructor(tipo, init = {}) {
      super(tipo, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  beforeEach(() => {
    window.PointerEvent = PonteiroFalso;
    vi.useFakeTimers({ toFake: ['Date'] }); // só o relógio: a velocidade do arrasto é medida com Date.now()
    vi.setSystemTime(new Date(2026, 9, 5, 10, 0, 0));
  });
  afterEach(() => {
    delete window.PointerEvent;
  });
  const arrastar = (alvo, de, ate, { ms = 1000, cancelar = false } = {}) => {
    fireEvent.pointerDown(alvo, { clientY: de, pointerId: 1 });
    fireEvent.pointerMove(alvo, { clientY: ate, pointerId: 1 });
    vi.setSystemTime(new Date(Date.now() + ms));
    if (cancelar) fireEvent.pointerCancel(alvo, { clientY: ate, pointerId: 1 });
    else fireEvent.pointerUp(alvo, { clientY: ate, pointerId: 1 });
  };

  it('a folha acompanha o dedo; pouco e devagar, volta; longe, desce e fecha', async () => {
    simularCelular();
    const onFechar = vi.fn();
    render(
      <Painel titulo="Novo plano" onFechar={onFechar}>
        <input aria-label="Nome" />
      </Painel>,
    );
    const cabecalho = document.querySelector('.painel-cabecalho');
    const folha = screen.getByRole('dialog');

    fireEvent.pointerDown(cabecalho, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(cabecalho, { clientY: 104, pointerId: 1 });
    expect(folha.style.transform).toBe(''); // menos de 8px ainda é toque, não arrasto
    fireEvent.pointerMove(cabecalho, { clientY: 160, pointerId: 1 });
    expect(folha.style.transform).toBe('translateY(60px)');
    vi.setSystemTime(new Date(Date.now() + 1000));
    fireEvent.pointerUp(cabecalho, { clientY: 160, pointerId: 1 });
    expect(folha.style.transform).toBe('');
    expect(onFechar).not.toHaveBeenCalled();

    arrastar(cabecalho, 100, 400, { cancelar: true }); // o sistema cancelou o toque: volta ao lugar
    expect(folha.style.transform).toBe('');
    expect(onFechar).not.toHaveBeenCalled();

    arrastar(cabecalho, 100, 400);
    await waitFor(() => expect(onFechar).toHaveBeenCalledTimes(1));
  });

  it('um arrasto rápido também fecha; o clique que vem depois do arrasto não aperta o X', async () => {
    simularCelular();
    const onFechar = vi.fn();
    render(<Painel titulo="Novo plano" onFechar={onFechar} />);
    const cabecalho = document.querySelector('.painel-cabecalho');
    arrastar(cabecalho, 100, 160, { ms: 60 }); // 60px em 60ms: um "puxão"
    fireEvent.click(screen.getByRole('button', { name: 'Fechar' })); // o clique que o navegador dispara ao soltar
    await waitFor(() => expect(onFechar).toHaveBeenCalledTimes(1)); // fechou pelo arrasto, uma vez só
    await new Promise((resolver) => setTimeout(resolver, 300)); // passa a descida da folha (170ms)
    expect(onFechar).toHaveBeenCalledTimes(1); // se o clique tivesse apertado o X, seriam duas
  });

  it('com alterações, a folha volta e a pergunta aparece', async () => {
    simularCelular();
    const onFechar = vi.fn();
    render(<Painel titulo="Editar aluno" onFechar={onFechar} alterado />);
    const cabecalho = document.querySelector('.painel-cabecalho');
    arrastar(cabecalho, 100, 400);
    expect(screen.getByRole('dialog').style.transform).toBe('');
    await responderConfirmacao('Voltar', { name: 'Descartar as alterações?' });
    expect(onFechar).not.toHaveBeenCalled();
  });

  it('no computador, arrastar não move a janela', () => {
    const onFechar = vi.fn();
    render(<Painel titulo="Novo plano" onFechar={onFechar} />);
    const cabecalho = document.querySelector('.painel-cabecalho');
    fireEvent.pointerDown(cabecalho, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(cabecalho, { clientY: 400, pointerId: 1 });
    expect(screen.getByRole('dialog').style.transform).toBe('');
    fireEvent.pointerUp(cabecalho, { clientY: 400, pointerId: 1 });
    expect(onFechar).not.toHaveBeenCalled();
  });
});

describe('aviso', () => {
  it('uma mensagem nova recomeça o aviso (e a barra de tempo)', () => {
    const { rerender } = render(<Aviso>Plano cadastrado.</Aviso>);
    const primeiro = screen.getByRole('status');
    rerender(<Aviso>Plano atualizado.</Aviso>);
    expect(screen.getByRole('status')).not.toBe(primeiro);
    expect(screen.getByRole('status')).toHaveTextContent('Plano atualizado.');
  });
});

describe('confirmação', () => {
  it('pergunta com título e mensagem; o foco começa em "Voltar" e volta ao botão depois', async () => {
    const onResposta = vi.fn();
    render(<ComConfirmacao onResposta={onResposta} />);
    const gatilho = screen.getByRole('button', { name: 'Excluir plano' });
    gatilho.focus();
    fireEvent.click(gatilho);

    expect(dialogo()).toHaveAccessibleName('Excluir o plano?');
    expect(dialogo()).toHaveAccessibleDescription('Não pode ser desfeito.');
    expect(dialogo()).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveFocus(); // a opção segura
    expect(screen.getByRole('button', { name: 'Excluir' })).toHaveClass('botao-perigo-cheio');

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(onResposta).toHaveBeenCalledWith(true));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(gatilho).toHaveFocus();
  });

  it('ação sem perigo usa o botão principal', () => {
    render(<ComConfirmacao onResposta={() => {}} perigo={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir plano' }));
    expect(screen.getByRole('button', { name: 'Excluir' })).toHaveClass('botao-primario');
  });

  it('"Voltar", Esc e tocar fora desistem; tocar dentro não', async () => {
    const onResposta = vi.fn();
    render(<ComConfirmacao onResposta={onResposta} />);
    const abrir = () => fireEvent.click(screen.getByRole('button', { name: 'Excluir plano' }));

    abrir();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
    await waitFor(() => expect(onResposta).toHaveBeenCalledTimes(1));

    abrir();
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    await waitFor(() => expect(onResposta).toHaveBeenCalledTimes(2));

    abrir();
    fireEvent.click(screen.getByText('Não pode ser desfeito.'));
    expect(dialogo()).toBeInTheDocument();
    fireEvent.click(document.querySelector('.confirmacao-fundo'));
    await waitFor(() => expect(onResposta).toHaveBeenCalledTimes(3));

    expect(onResposta.mock.calls).toEqual([[false], [false], [false]]);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('o Tab fica preso entre os dois botões', () => {
    render(<ComConfirmacao onResposta={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir plano' }));
    const voltar = screen.getByRole('button', { name: 'Voltar' });
    const excluir = screen.getByRole('button', { name: 'Excluir' });

    fireEvent.keyDown(voltar, { key: 'Tab', shiftKey: true });
    expect(excluir).toHaveFocus();
    fireEvent.keyDown(excluir, { key: 'Tab' });
    expect(voltar).toHaveFocus();
    // No meio do caminho, o Tab segue o fluxo normal do navegador.
    excluir.focus();
    fireEvent.keyDown(excluir, { key: 'Tab', shiftKey: true });
    expect(excluir).toHaveFocus();
  });

  it('com o painel aberto, o Esc fecha só a confirmação; o próximo Esc fecha o painel', async () => {
    const onFechar = vi.fn();
    const onResposta = vi.fn();
    render(
      <Painel titulo="Editar plano" onFechar={onFechar}>
        <ComConfirmacao onResposta={onResposta} />
      </Painel>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Excluir plano' }));
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    await waitFor(() => expect(onResposta).toHaveBeenCalledWith(false));
    expect(onFechar).not.toHaveBeenCalled();

    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(onFechar).toHaveBeenCalledTimes(1);
  });

  it('uma pergunta nova responde "não" à anterior; sair da página com a pergunta aberta também', async () => {
    const onResposta = vi.fn();
    const { unmount } = render(<ComConfirmacao onResposta={onResposta} />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir plano' }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir plano' }));
    await waitFor(() => expect(onResposta).toHaveBeenCalledWith(false));
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1);

    unmount();
    await waitFor(() => expect(onResposta).toHaveBeenCalledTimes(2));
    expect(onResposta).toHaveBeenLastCalledWith(false);
  });
});
