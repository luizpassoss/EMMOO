import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { mesDaData, hojeISO, nomeDoMes, somarMeses } from '../utils/datas.js';
import Icone from './Icone.jsx';

/**
 * Indicador do painel: rótulo pequeno, número em destaque e, se houver, um detalhe embaixo — sem ícone, para a
 * tela ficar limpa. Com `para`, o cartão leva à página do assunto (ex.: "A registrar" abre a lista de aulas a
 * registrar); `compacto` diminui o número para caber valores em reais; `atencao` marca o que pede ação (ex.: atraso).
 */
export function Indicador({ rotulo, valor, detalhe, para, atencao = false, compacto = false }) {
  const conteudo = (
    <>
      <span className="indicador-rotulo">{rotulo}</span>
      <strong>{valor}</strong>
      {detalhe && <small className="indicador-detalhe">{detalhe}</small>}
    </>
  );
  const classe = `card-indicador${atencao ? ' atencao' : ''}${compacto ? ' compacto' : ''}`;
  return para ? (
    <Link to={para} className={`${classe} card-indicador-link`}>
      {conteudo}
    </Link>
  ) : (
    <article className={classe}>{conteudo}</article>
  );
}

/** Mês escolhido na página, guardado na URL (?mes=2026-10): o link aberto de novo mostra o mesmo mês. */
export function useMes() {
  const [params, setParams] = useSearchParams();
  const atual = mesDaData(hojeISO());
  const pedido = params.get('mes');
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido ?? '') ? pedido : atual;
  const mudar = useCallback(
    (novo) => {
      const proximos = new URLSearchParams(params);
      if (novo === atual) proximos.delete('mes');
      else proximos.set('mes', novo);
      setParams(proximos, { replace: true });
    },
    [atual, params, setParams],
  );
  return [mes, mudar, atual];
}

/** Navegação entre meses (mensalidades e relatórios): anterior, o mês por extenso, próximo e a volta ao mês atual. */
export function NavegacaoMes({ mes, atual, onMudar, maximo }) {
  return (
    <div className="navegacao-semana" role="group" aria-label="Navegar entre meses">
      <button
        type="button"
        className="botao-icone contorno"
        aria-label="Mês anterior"
        title="Mês anterior"
        onClick={() => onMudar(somarMeses(mes, -1))}
      >
        <Icone nome="anterior" tamanho={18} />
      </button>
      <strong aria-live="polite">{nomeDoMes(mes, { maiuscula: true })}</strong>
      <button
        type="button"
        className="botao-icone contorno"
        aria-label="Próximo mês"
        title="Próximo mês"
        disabled={Boolean(maximo) && mes >= maximo}
        onClick={() => onMudar(somarMeses(mes, 1))}
      >
        <Icone nome="proximo" tamanho={18} />
      </button>
      {mes !== atual && (
        <button type="button" className="botao botao-fantasma" onClick={() => onMudar(atual)}>
          Mês atual
        </button>
      )}
    </div>
  );
}

/**
 * Há uma página anterior *dentro do app*? O React Router guarda em history.state.idx a posição da entrada:
 * 0 na primeira página aberta (aba nova, link direto ou logo após o login) e mais a cada navegação.
 */
export function temPaginaAnterior() {
  return (window.history.state?.idx ?? 0) > 0;
}

/**
 * Estado da primeira página após entrar (login ou cadastro de escola). O que ficou para trás no histórico
 * são as telas públicas, que só redirecionam de volta — então essa página conta como ponto de partida.
 */
export const INICIO_DA_SESSAO = { inicioDaSessao: true };

/**
 * Volta para a página anterior do app. Sem página anterior (ex.: link aberto direto), leva ao Início
 * em vez de sair do sistema.
 */
export function BotaoVoltar() {
  const navigate = useNavigate();
  const location = useLocation(); // reavalia o histórico a cada navegação
  const anterior = temPaginaAnterior() && !location.state?.inicioDaSessao;

  return (
    <button
      type="button"
      className="botao botao-fantasma voltar"
      title={anterior ? 'Voltar à página anterior' : 'Voltar ao início'}
      // Sem página anterior, o Início substitui a entrada atual e vira o ponto de partida —
      // assim ele não ganha um "Voltar" de volta para a página de onde se saiu.
      onClick={() => (anterior ? navigate(-1) : navigate('/', { replace: true }))}
    >
      <Icone nome="anterior" tamanho={18} />
      Voltar
    </button>
  );
}

/**
 * Título da página, uma linha curta opcional (ex.: a data no Início) e as ações à direita.
 * As páginas do menu não têm "Voltar" (o menu já leva a elas); as subpáginas (`voltar`: histórico do aluno,
 * histórico de pagamentos, minha conta) têm, para voltar de onde se veio.
 */
export function CabecalhoPagina({ titulo, descricao, voltar = false, children }) {
  return (
    <header className="cabecalho-pagina">
      <div>
        {voltar && <BotaoVoltar />}
        <h1 className="titulo">{titulo}</h1>
        {descricao && <p className="descricao">{descricao}</p>}
      </div>
      {children && <div className="cabecalho-acoes">{children}</div>}
    </header>
  );
}

/**
 * Título de uma seção que pode vir recolhida (ex.: feriados e horários, no fim da agenda): o título é um botão que
 * abre e fecha o conteúdo, com um resumo curto ao lado (ex.: "4 próximos"). Sem `recolhivel`, é só o título.
 */
export function TituloDaSecao({ titulo, resumo, recolhivel = false, aberta = true, onAlternar }) {
  if (!recolhivel) return <h2 className="secao-titulo">{titulo}</h2>;
  return (
    <h2 className="secao-titulo">
      <button type="button" className="secao-alternar" aria-expanded={aberta} onClick={onAlternar}>
        <span>{titulo}</span>
        {resumo && <small>{resumo}</small>}
        <Icone nome="proximo" tamanho={18} className="secao-seta" />
      </button>
    </h2>
  );
}

/** Lista vazia: diz o que aconteceu e, quando houver, o próximo passo. */
export function Vazio({ icone = 'nota', titulo, children }) {
  return (
    <div className="vazio">
      <span className="vazio-icone">
        <Icone nome={icone} tamanho={22} />
      </span>
      <strong>{titulo}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}

/** Esqueleto de carregamento: mostra o formato do conteúdo em vez de um texto solto. */
export function Carregando({ linhas = 3 }) {
  return (
    <div className="esqueleto" aria-busy="true">
      <span className="sr-only">Carregando…</span>
      {Array.from({ length: linhas }, (_, indice) => (
        <span key={indice} className="esqueleto-linha" />
      ))}
    </div>
  );
}

/**
 * Painel de formulário guardado na URL (ex.: /alunos?aluno=novo, /alunos?aluno=3).
 * Assim o "voltar" — do navegador, do celular ou do cabeçalho — fecha o painel em vez de sair da página.
 * @returns {[string | null, (valor?: string | number) => void, () => void]} valor atual, abrir e fechar
 */
export function usePainel(parametro) {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const valor = params.get(parametro);

  const abrir = useCallback(
    (novoValor = 'novo') => {
      const proximos = new URLSearchParams(params);
      proximos.set(parametro, String(novoValor));
      // A primeira abertura cria uma entrada no histórico (é ela que o "voltar" desfaz);
      // trocar de item com o painel já aberto só substitui, para o "voltar" não passar por cada um.
      if (valor === null) setParams(proximos, { state: { painelAberto: true } });
      else setParams(proximos, { replace: true, state: location.state });
    },
    [params, parametro, setParams, valor, location.state],
  );

  const fechar = useCallback(() => {
    if (location.state?.painelAberto) {
      navigate(-1); // volta à entrada sem o painel
      return;
    }
    // Painel aberto por link direto: não há entrada anterior a desfazer, então só tira o parâmetro.
    const proximos = new URLSearchParams(params);
    proximos.delete(parametro);
    setParams(proximos, { replace: true });
  }, [location.state, navigate, params, parametro, setParams]);

  return [valor, abrir, fechar];
}

/** Mensagem de sucesso que some sozinha depois de alguns segundos. */
export function useAviso(duracaoMs = 5000) {
  const [aviso, setAviso] = useState('');
  useEffect(() => {
    if (!aviso) return undefined;
    const temporizador = setTimeout(() => setAviso(''), duracaoMs);
    return () => clearTimeout(temporizador);
  }, [aviso, duracaoMs]);
  return [aviso, setAviso];
}

/**
 * Aviso flutuante: fica visível onde quer que a pessoa esteja na página (role="status" é lido por leitores de tela).
 * A chave é o próprio texto: uma mensagem nova recomeça a barra de tempo.
 */
export function Aviso({ children }) {
  if (!children) return null;
  return (
    <p key={String(children)} className="aviso" role="status">
      {children}
    </p>
  );
}

/** A pessoa pediu menos movimento no sistema? As animações feitas por código respeitam isso, como as do CSS. */
export function prefereMenosMovimento() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

// Campos que recebem o foco ao abrir (os rádios dos botões segmentados ficam de fora) e tudo o que o Tab alcança.
const CAMPOS = 'input:not([type="radio"], [type="checkbox"], [type="hidden"]), select, textarea';
const FOCAVEIS = 'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
const visivel = (elemento) => (typeof elemento.checkVisibility === 'function' ? elemento.checkVisibility() : true);
const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
const ARRASTO_MINIMO = 8; // px antes de o toque virar arrasto (um toque no X continua sendo clique)

/**
 * Janela de formulário (cadastro e edição): no computador, centralizada sobre a página; no celular, uma folha
 * que sobe de baixo — e que fecha arrastando o cabeçalho para baixo. Cabeçalho e rodapé ficam parados; só o conteúdo rola.
 * - `acao`: o botão principal (submit), à direita do rodapé, ao lado de "Cancelar" (ou `rotuloFechar`);
 *   `outrasAcoes`: as secundárias (inativar, excluir), discretas à esquerda.
 * - `alterado`: há algo digitado e não salvo — fechar (X, Cancelar, Esc, fundo ou arrasto) pergunta antes de descartar.
 * - Ao abrir, o foco vai para o primeiro campo (no celular, para a janela, sem abrir o teclado sozinho),
 *   fica preso nela e volta para onde estava ao fechar.
 * - Quando a API devolve erros de validação, leva o foco ao primeiro campo inválido.
 */
export function Painel({
  titulo,
  descricao,
  onFechar,
  formRef,
  erros,
  acao,
  outrasAcoes,
  alterado = false,
  rotuloFechar = 'Cancelar',
  children,
  ...props
}) {
  const refInterna = useRef(null);
  const ref = formRef ?? refInterna;
  const fundoRef = useRef(null);
  const arrasto = useRef(null);
  const arrastou = useRef(false);
  const idTitulo = useId();
  const idDescricao = useId();
  const [confirmar, confirmacao] = useConfirmacao();

  /** Fecha a janela — perguntando antes, se houver algo não salvo. Devolve se fechou. */
  const pedirFechamento = useCallback(async () => {
    if (alterado) {
      const descartar = await confirmar({
        titulo: 'Descartar as alterações?',
        mensagem: 'O que foi preenchido neste formulário ainda não foi salvo e será perdido.',
        acao: 'Descartar',
        perigo: true,
      });
      if (!descartar) return false;
    }
    onFechar();
    return true;
  }, [alterado, confirmar, onFechar]);

  useEffect(() => {
    if (!erros || Object.keys(erros).length === 0) return;
    const invalido = ref.current?.querySelector('[aria-invalid="true"]');
    if (invalido) invalido.focus();
    // Erro sem campo (ex.: falha da API): mostra o alerta, que fica no topo do conteúdo.
    else ref.current?.querySelector('.alerta')?.scrollIntoView?.({ block: 'nearest' });
  }, [erros, ref]);

  // A página atrás não rola enquanto a janela está aberta; ao fechar, o foco volta para quem a abriu.
  useEffect(() => {
    const focoAnterior = document.activeElement;
    const rolagemAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('com-painel');
    const toque = window.matchMedia?.('(pointer: coarse)').matches;
    const campo = ref.current?.querySelector(CAMPOS);
    if (campo && !toque) campo.focus({ preventScroll: true });
    else ref.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = rolagemAnterior;
      document.body.classList.remove('com-painel');
      if (focoAnterior?.isConnected && focoAnterior !== document.body) focoAnterior.focus({ preventScroll: true });
    };
  }, []);

  // Teclado: Esc fecha e o Tab circula dentro da janela — a menos que haja uma confirmação por cima, que cuida disso.
  useEffect(() => {
    function aoTeclar(evento) {
      if (document.querySelector('[role="alertdialog"]')) return;
      if (evento.key === 'Escape') {
        pedirFechamento();
        return;
      }
      if (evento.key !== 'Tab' || !ref.current) return;
      const focaveis = [...ref.current.querySelectorAll(FOCAVEIS)].filter((el) => !el.disabled && visivel(el));
      if (focaveis.length === 0) return;
      const [primeiro, ultimo] = [focaveis[0], focaveis.at(-1)];
      const atual = document.activeElement;
      if (!ref.current.contains(atual)) {
        evento.preventDefault();
        primeiro.focus();
      } else if (evento.shiftKey && (atual === primeiro || atual === ref.current)) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && atual === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [pedirFechamento, ref]);

  // --- Arrastar para fechar (só no celular): a folha acompanha o dedo; soltando longe ou rápido, ela desce e fecha.
  function moverFolha(deslocamento, transicao = 'none') {
    const folha = ref.current;
    const fundo = fundoRef.current;
    if (!folha) return;
    folha.style.transition = transicao;
    folha.style.transform = deslocamento ? `translateY(${deslocamento}px)` : '';
    if (fundo) {
      fundo.style.transition = transicao;
      fundo.style.opacity = deslocamento ? String(Math.max(0.2, 1 - deslocamento / 480)) : '';
    }
  }
  function voltarAoLugar() {
    moverFolha(0, prefereMenosMovimento() ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.22s');
  }
  function aoTocarCabecalho(evento) {
    arrastou.current = false;
    if (evento.button > 0 || !window.matchMedia?.('(max-width: 767px)').matches) return;
    arrasto.current = { id: evento.pointerId, y: evento.clientY, quando: Date.now(), deslocamento: 0, ativo: false };
  }
  function aoArrastarCabecalho(evento) {
    const atual = arrasto.current;
    if (!atual || atual.id !== evento.pointerId) return;
    const deslocamento = Math.max(0, evento.clientY - atual.y);
    if (!atual.ativo) {
      if (deslocamento < ARRASTO_MINIMO) return;
      atual.ativo = true;
      evento.currentTarget.setPointerCapture?.(evento.pointerId);
    }
    atual.deslocamento = deslocamento;
    moverFolha(deslocamento);
  }
  async function aoSoltarCabecalho(evento) {
    const atual = arrasto.current;
    arrasto.current = null;
    if (!atual?.ativo) return;
    arrastou.current = true; // o clique que o navegador dispara ao soltar não deve apertar o X
    const altura = ref.current?.offsetHeight ?? 0;
    const rapido = atual.deslocamento / Math.max(1, Date.now() - atual.quando) > 0.5; // px por ms
    const longe = atual.deslocamento > (altura > 0 ? Math.min(140, altura * 0.3) : 140); // 30% da folha, no máximo 140px
    if (evento.type === 'pointercancel' || !(longe || rapido)) {
      voltarAoLugar();
      return;
    }
    if (alterado) {
      voltarAoLugar(); // a folha volta e a pergunta aparece sobre ela
      pedirFechamento();
      return;
    }
    if (!prefereMenosMovimento()) {
      moverFolha(altura, 'transform 0.18s ease-in, opacity 0.18s ease-in');
      await esperar(170);
    }
    onFechar();
  }
  function ignorarCliqueDoArrasto(evento) {
    if (!arrastou.current) return;
    arrastou.current = false;
    evento.preventDefault();
    evento.stopPropagation();
  }

  return (
    <>
      <div ref={fundoRef} className="painel-fundo" aria-hidden="true" onClick={pedirFechamento} />
      <form
        ref={ref}
        className="painel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={descricao ? idDescricao : undefined}
        tabIndex={-1}
        noValidate
        {...props}
      >
        <header
          className="painel-cabecalho"
          onPointerDown={aoTocarCabecalho}
          onPointerMove={aoArrastarCabecalho}
          onPointerUp={aoSoltarCabecalho}
          onPointerCancel={aoSoltarCabecalho}
          onClickCapture={ignorarCliqueDoArrasto}
        >
          <div className="painel-titulo">
            <h2 id={idTitulo}>{titulo}</h2>
            {descricao && <p id={idDescricao}>{descricao}</p>}
          </div>
          <button type="button" className="botao-icone" aria-label="Fechar" title="Fechar" onClick={pedirFechamento}>
            <Icone nome="fechar" tamanho={18} />
          </button>
        </header>
        <div className="painel-corpo">{children}</div>
        {(acao || outrasAcoes) && (
          <footer className="painel-rodape">
            {outrasAcoes && <div className="painel-outras">{outrasAcoes}</div>}
            <div className="painel-acoes">
              <button type="button" className="botao botao-secundario painel-cancelar" onClick={pedirFechamento}>
                {rotuloFechar}
              </button>
              {acao}
            </div>
          </footer>
        )}
      </form>
      {confirmacao}
    </>
  );
}

/**
 * Pergunta de confirmação no estilo do app (no lugar do window.confirm, que no celular fica fora do visual e trava a tela).
 * O foco começa em "Voltar" (a opção segura), fica preso no diálogo e volta para onde estava; Esc ou tocar fora desistem.
 * `opcao` acrescenta uma caixa de seleção (ex.: "cancelar também as mensalidades em aberto"), desmarcada de início.
 */
function Confirmacao({ titulo, mensagem, acao, perigo, opcao, onResponder }) {
  const idTitulo = useId();
  const idMensagem = useId();
  const idOpcao = useId();
  const caixaRef = useRef(null);
  const voltarRef = useRef(null);
  const [marcada, setMarcada] = useState(Boolean(opcao?.marcada));

  useEffect(() => {
    const focoAnterior = document.activeElement;
    voltarRef.current?.focus();
    function aoTeclar(evento) {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        onResponder(false);
        return;
      }
      if (evento.key !== 'Tab') return;
      const botoes = [...caixaRef.current.querySelectorAll('button, input')];
      const [primeiro, ultimo] = [botoes[0], botoes.at(-1)];
      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    }
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.removeEventListener('keydown', aoTeclar);
      if (focoAnterior?.isConnected) focoAnterior.focus();
    };
  }, [onResponder]);

  return (
    <div className="confirmacao-fundo" onClick={() => onResponder(false)}>
      <div
        ref={caixaRef}
        className="confirmacao"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        aria-describedby={idMensagem}
        onClick={(evento) => evento.stopPropagation()}
      >
        <span className={`confirmacao-icone${perigo ? ' perigo' : ''}`} aria-hidden="true">
          <Icone nome={perigo ? 'alerta' : 'ajuda'} tamanho={22} />
        </span>
        <div className="confirmacao-texto">
          <h2 id={idTitulo}>{titulo}</h2>
          <p id={idMensagem}>{mensagem}</p>
          {opcao && (
            <label className="confirmacao-opcao" htmlFor={idOpcao}>
              <input id={idOpcao} type="checkbox" checked={marcada} onChange={(evento) => setMarcada(evento.target.checked)} />
              <span>
                {opcao.rotulo}
                {opcao.dica && <small>{opcao.dica}</small>}
              </span>
            </label>
          )}
        </div>
        <div className="confirmacao-acoes">
          <button ref={voltarRef} type="button" className="botao botao-secundario" onClick={() => onResponder(false)}>
            Voltar
          </button>
          <button
            type="button"
            className={`botao ${perigo ? 'botao-perigo-cheio' : 'botao-primario'}`}
            onClick={() => onResponder(opcao ? { opcao: marcada } : true)}
          >
            {acao}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Confirmação como promessa:
 *   const [confirmar, confirmacao] = useConfirmacao();
 *   if (!(await confirmar({ titulo, mensagem, acao: 'Excluir', perigo: true }))) return;
 * e `{confirmacao}` no JSX da página. Com `opcao: { rotulo, dica }`, confirmar devolve `{ opcao: true | false }`
 * (o que ficou marcado) e desistir devolve `false`.
 */
export function useConfirmacao() {
  const [pedido, setPedido] = useState(null);
  const pedidoRef = useRef(null);
  const contador = useRef(0); // cada pergunta é um diálogo novo (a caixa de seleção começa desmarcada)
  const confirmar = useCallback(
    ({ titulo, mensagem, acao = 'Confirmar', perigo = false, opcao = null }) =>
      new Promise((resolver) => {
        pedidoRef.current?.resolver(false); // uma pergunta nova substitui a anterior (que conta como "não")
        contador.current += 1;
        pedidoRef.current = { id: contador.current, titulo, mensagem, acao, perigo, opcao, resolver };
        setPedido(pedidoRef.current);
      }),
    [],
  );
  const responder = useCallback((resposta) => {
    pedidoRef.current?.resolver(resposta);
    pedidoRef.current = null;
    setPedido(null);
  }, []);
  // Página que sai com a pergunta aberta: a promessa responde "não", em vez de ficar pendurada.
  useEffect(() => () => pedidoRef.current?.resolver(false), []);

  const confirmacao = pedido ? <Confirmacao key={pedido.id} {...pedido} onResponder={responder} /> : null;
  return [confirmar, confirmacao];
}
