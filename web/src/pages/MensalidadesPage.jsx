import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/index.js';
import { baixarRecibo } from '../api/recibo.js';
import { useAuth } from '../auth/AuthContext.jsx';
import Campo, { Opcoes } from '../components/Campo.jsx';
import {
  Aviso,
  CabecalhoPagina,
  Carregando,
  Indicador,
  NavegacaoMes,
  Painel,
  useAviso,
  useConfirmacao,
  useMes,
  usePainel,
  Vazio,
} from '../components/Estrutura.jsx';
import CodigoPix from '../components/CodigoPix.jsx';
import Icone from '../components/Icone.jsx';
import { formatarData, formatarDataCompleta, hojeISO, nomeDoMes, somarMeses } from '../utils/datas.js';
import { mapearErros } from '../utils/erros.js';
import {
  FORMAS_PAGAMENTO,
  formatarMoeda,
  formatarMoedaCurta,
  iniciais,
  plural,
  rotuloStatusMensalidade,
} from '../utils/format.js';

const FILTROS = [
  { valor: '', rotulo: 'Todas as situações' },
  { valor: 'atrasada', rotulo: 'Atrasadas' },
  { valor: 'pendente', rotulo: 'Pendentes' },
  { valor: 'paga', rotulo: 'Pagas' },
  { valor: 'cancelada', rotulo: 'Canceladas' },
];
const BUSCA_A_PARTIR_DE = 7; // com poucas mensalidades no mês, a busca só ocuparia espaço
const PAGAS_NO_RESUMO = 3; // o responsável vê as últimas pagas aqui; o resto, no histórico de pagamentos
const MOTIVO_MAXIMO = 160; // o mesmo limite da API
const somar = (lista) => lista.reduce((total, mensalidade) => total + Number(mensalidade.valor), 0);
const emAberto = (mensalidade) => mensalidade.status === 'pendente' || mensalidade.status === 'atrasada';
/** A cancelada fica na lista, mas não é cobrada: não entra no previsto nem no em aberto. */
const cobradas = (lista) => lista.filter((mensalidade) => mensalidade.status !== 'cancelada');
/** Ignora acentos e maiúsculas na busca ("joao" encontra "João"). */
const normalizar = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Na lista: "Vence em 22/10" ou "Paga em 17/10 · Pix" — o mês já está no título ou na linha
 * (a data completa fica nos detalhes). Com o ano só quando ele não é o do mês de referência.
 */
function situacao(mensalidade) {
  const data = (dataISO) =>
    dataISO.slice(0, 4) === mensalidade.mesReferencia.slice(0, 4) ? formatarData(dataISO) : formatarDataCompleta(dataISO);
  if (mensalidade.status === 'paga') {
    const forma = mensalidade.formaPagamentoNome ? ` · ${mensalidade.formaPagamentoNome}` : '';
    return `Paga em ${data(mensalidade.dataPagamento)}${forma}`;
  }
  if (mensalidade.status === 'cancelada') {
    return mensalidade.cancelamentoMotivo ? `Cancelada: ${mensalidade.cancelamentoMotivo}` : 'Cobrança cancelada pela escola';
  }
  const verbo = mensalidade.status === 'atrasada' ? 'Venceu em' : 'Vence em';
  const ajuste = mensalidade.valorOriginal != null ? ' · valor ajustado' : '';
  return `${verbo} ${data(mensalidade.vencimento)}${ajuste}`;
}

/** "Pix R$ 84 · Dinheiro R$ 140": quanto entrou por forma de pagamento (só as que tiveram pagamento). */
function recebidoPorForma(pagas) {
  return FORMAS_PAGAMENTO.map((forma) => [forma.rotulo, pagas.filter((m) => m.formaPagamento === forma.valor)])
    .filter(([, daForma]) => daForma.length > 0)
    .map(([rotulo, daForma]) => `${rotulo} ${formatarMoedaCurta(somar(daForma))}`)
    .join(' · ');
}

/** Atalho para o histórico de pagamentos (RF11), de todos ou de um aluno. */
function LinkDoHistorico({ aluno, className = 'botao botao-secundario' }) {
  return (
    <Link to={`/mensalidades/pagamentos${aluno ? `?aluno=${aluno.id}` : ''}`} className={className}>
      {!aluno && <Icone nome="historico" tamanho={18} />}
      {/* No celular, o do cabeçalho fica só no ícone (o nome continua para leitores de tela). */}
      {aluno ? `Ver os pagamentos de ${aluno.nome.split(' ')[0]}` : <span className="rotulo-opcional">Histórico de pagamentos</span>}
    </Link>
  );
}

/** RF10–RF12 e RF15 — a coordenação cuida das mensalidades; o responsável acompanha as dos dependentes. */
export default function MensalidadesPage() {
  const { usuario } = useAuth();
  return usuario?.papel === 'responsavel' ? <MensalidadesDoResponsavel /> : <MensalidadesDaEscola />;
}

/**
 * Faixa de alertas (RF12): só aparece quando há o que fazer — mensalidades atrasadas ou vencendo, ou alertas por
 * e-mail esperando envio (com o botão para enviar). Sem nada disso, a página fica limpa.
 */
function FaixaDeAlertas({ resumo, onEnviar, enviando }) {
  if (!resumo) return null;
  const { atrasadas, vencendo, email } = resumo;
  const aEnviar = email.configurado && email.pendentes > 0;
  const partes = [
    atrasadas.quantidade > 0 &&
      `${plural(atrasadas.quantidade, 'mensalidade atrasada', 'mensalidades atrasadas')} (${formatarMoeda(atrasadas.valor)})`,
    vencendo.quantidade > 0 &&
      `${plural(vencendo.quantidade, 'vence', 'vencem')} nos próximos 3 dias (${formatarMoeda(vencendo.valor)})`,
  ].filter(Boolean);
  if (partes.length === 0 && !aEnviar) return null;
  let sobreEmail = null;
  if (aEnviar) {
    const falha = email.ultimoErro ? ` Última falha: ${email.ultimoErro}` : '';
    sobreEmail = `${plural(email.pendentes, 'alerta aguarda', 'alertas aguardam')} envio por e-mail.${falha}`;
  } else if (!email.configurado) {
    sobreEmail = 'Os alertas por e-mail estão desligados.';
  }
  return (
    <article className="card faixa-alertas" aria-label="Alertas de pagamento">
      <span className={`indicador-icone${atrasadas.quantidade > 0 ? ' atencao' : ''}`} aria-hidden="true">
        <Icone nome={atrasadas.quantidade > 0 ? 'alerta' : 'email'} tamanho={20} />
      </span>
      <div className="faixa-texto">
        {partes.length > 0 && <strong>{partes.join(' · ')}</strong>}
        {sobreEmail && <p>{sobreEmail}</p>}
      </div>
      {aEnviar && (
        <button type="button" className="botao botao-secundario" disabled={enviando} onClick={onEnviar}>
          <Icone nome="email" tamanho={18} />
          {enviando ? 'Enviando…' : 'Enviar agora'}
        </button>
      )}
    </article>
  );
}

/** Linha de uma mensalidade (aluno, situação, valor e selo); tocar abre a baixa ou o recibo. */
function LinhaDaMensalidade({ mensalidade, onAbrir }) {
  const nome = mensalidade.aluno?.nome ?? 'Aluno excluído';
  return (
    <li>
      <button type="button" className="linha" onClick={onAbrir}>
        <span className="avatar" aria-hidden="true">
          {iniciais(nome)}
        </span>
        <span className="linha-texto">
          <strong>{nome}</strong>
          <small>{situacao(mensalidade)}</small>
        </span>
        <span className="linha-valor">
          <span className={`linha-fim${mensalidade.status === 'cancelada' ? ' riscado' : ''}`}>{formatarMoeda(mensalidade.valor)}</span>
          <span className={`pill pill-${mensalidade.status}`}>{rotuloStatusMensalidade(mensalidade.status)}</span>
        </span>
        <Icone nome="proximo" tamanho={18} className="linha-seta" />
      </button>
    </li>
  );
}

function MensalidadesDaEscola() {
  const [mes, mudarMes, atual] = useMes();
  const maximo = somarMeses(atual, 2); // gera-se o mês atual e até dois à frente
  const podeGerar = mes >= atual && mes <= maximo;
  const [lista, setLista] = useState(null);
  const [resumo, setResumo] = useState(null);
  const [filtro, setFiltro] = useState('');
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useAviso();
  const [confirmar, confirmacao] = useConfirmacao();
  const [ocupado, setOcupado] = useState(''); // 'gerar' | 'enviar' enquanto a ação roda
  const [painel, abrirPainel, fecharPainel] = usePainel('mensalidade');
  const aberta = painel && lista ? lista.find((mensalidade) => String(mensalidade.id) === painel) : null;

  const carregar = useCallback(async () => {
    try {
      const [doMes, alertas] = await Promise.all([api.get(`/mensalidades?mes=${mes}`), api.get('/mensalidades/alertas')]);
      setLista(doMes);
      setResumo(alertas);
      setErro('');
    } catch (e) {
      setErro(e.message);
    }
  }, [mes]);

  useEffect(() => {
    setLista(null);
    carregar();
  }, [carregar]);

  async function gerar() {
    const confirmado = await confirmar({
      titulo: `Gerar as mensalidades de ${nomeDoMes(mes)}?`,
      mensagem:
        'Cada aluno ativo que ainda não tem a mensalidade do mês recebe uma, com o valor do plano ' +
        '(proporcional às semanas restantes no mês da matrícula) e vencimento no dia 10.',
      acao: 'Gerar mensalidades',
    });
    if (!confirmado) return;
    setOcupado('gerar');
    try {
      const { criadas, ignorados } = await api.post('/mensalidades/gerar', { mes });
      const fora = ignorados.length
        ? ` Ficaram de fora: ${ignorados.map((item) => `${item.aluno.nome} (${item.motivo.replace(/\.$/, '').toLowerCase()})`).join(', ')}.`
        : '';
      await carregar();
      setAviso(
        criadas > 0
          ? `${plural(criadas, 'mensalidade gerada', 'mensalidades geradas')} para ${nomeDoMes(mes)}.${fora}`
          : `As mensalidades de ${nomeDoMes(mes)} já estavam geradas.${fora}`,
      );
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado('');
    }
  }

  async function enviarAlertas() {
    setOcupado('enviar');
    try {
      const resultado = await api.post('/mensalidades/alertas/enviar');
      setResumo(resultado.resumo);
      setAviso(
        resultado.falhas > 0
          ? `${plural(resultado.enviados, 'alerta enviado', 'alertas enviados')}; ${plural(resultado.falhas, 'falhou', 'falharam')} e ${resultado.falhas === 1 ? 'fica' : 'ficam'} para depois.`
          : `${plural(resultado.enviados, 'alerta enviado', 'alertas enviados')} por e-mail.`,
      );
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado('');
    }
  }

  const contagem = (valor) => (lista ?? []).filter((mensalidade) => !valor || mensalidade.status === valor).length;
  // Sem canceladas no mês, o filtro delas não aparece (seria uma opção sempre com zero).
  const filtros = FILTROS.filter((item) => item.valor !== 'cancelada' || contagem('cancelada') > 0 || filtro === 'cancelada');
  // A API já manda na ordem do que pede ação: atrasadas, pendentes, as pagas e, por fim, as canceladas.
  const visiveis = (lista ?? [])
    .filter((mensalidade) => !filtro || mensalidade.status === filtro)
    .filter((mensalidade) => !busca || normalizar(mensalidade.aluno?.nome).includes(normalizar(busca)));
  const previstas = cobradas(lista ?? []);
  const pagas = previstas.filter((mensalidade) => mensalidade.status === 'paga');
  const atrasadas = previstas.filter((mensalidade) => mensalidade.status === 'atrasada');

  return (
    <section>
      <CabecalhoPagina titulo="Mensalidades">
        {podeGerar && (
          <button type="button" className="botao botao-primario" disabled={ocupado === 'gerar'} onClick={gerar}>
            <Icone nome="mais" tamanho={18} />
            {ocupado === 'gerar' ? 'Gerando…' : 'Gerar mensalidades'}
          </button>
        )}
        <LinkDoHistorico />
      </CabecalhoPagina>

      {erro && (
        <p className="alerta" role="alert">
          {erro}
        </p>
      )}
      <Aviso>{aviso}</Aviso>

      <FaixaDeAlertas resumo={resumo} onEnviar={enviarAlertas} enviando={ocupado === 'enviar'} />

      <div className="filtros">
        <NavegacaoMes mes={mes} atual={atual} maximo={maximo} onMudar={mudarMes} />
        {lista && lista.length > 0 && (
          <select className="seletor" aria-label="Situação" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            {filtros.map((item) => (
              <option key={item.rotulo} value={item.valor}>
                {item.rotulo} ({contagem(item.valor)})
              </option>
            ))}
          </select>
        )}
        {lista && lista.length >= BUSCA_A_PARTIR_DE && (
          <div className="busca">
            <Icone nome="busca" tamanho={18} />
            <input
              type="search"
              enterKeyHint="search"
              placeholder="Buscar aluno"
              aria-label="Buscar aluno"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        )}
      </div>

      <div className="cards">
        <Indicador
          rotulo="Previsto"
          valor={lista ? formatarMoeda(somar(previstas)) : '–'}
          detalhe={
            contagem('cancelada') > 0 ? `${plural(contagem('cancelada'), 'cancelada', 'canceladas')} fora da conta` : undefined
          }
          compacto
        />
        <Indicador
          rotulo="Recebido"
          valor={lista ? formatarMoeda(somar(pagas)) : '–'}
          detalhe={pagas.length > 0 ? recebidoPorForma(pagas) : undefined}
          compacto
        />
        <Indicador
          rotulo="Em aberto"
          valor={lista ? formatarMoeda(somar(previstas) - somar(pagas)) : '–'}
          detalhe={atrasadas.length > 0 ? `${formatarMoeda(somar(atrasadas))} em atraso` : undefined}
          atencao={atrasadas.length > 0}
          compacto
        />
      </div>

      {!lista ? (
        !erro && (
          <div className="card">
            <Carregando linhas={4} />
          </div>
        )
      ) : lista.length === 0 ? (
        <div className="card">
          <Vazio icone="mensalidades" titulo={`Nenhuma mensalidade de ${nomeDoMes(mes)}.`}>
            {podeGerar
              ? 'Gere as mensalidades do mês para os alunos ativos. O sistema também gera as do mês atual automaticamente.'
              : mes < atual
                ? 'Não houve cobrança neste mês.'
                : 'As mensalidades podem ser geradas com até dois meses de antecedência.'}
          </Vazio>
        </div>
      ) : visiveis.length === 0 ? (
        <div className="card">
          <Vazio icone="busca" titulo={busca ? 'Nenhum aluno encontrado.' : 'Nenhuma mensalidade nesta situação.'} />
        </div>
      ) : (
        <div className="card card-lista">
          <ul className="lista">
            {visiveis.map((mensalidade) => (
              <LinhaDaMensalidade key={mensalidade.id} mensalidade={mensalidade} onAbrir={() => abrirPainel(mensalidade.id)} />
            ))}
          </ul>
        </div>
      )}

      {aberta && (
        <PainelDaMensalidade
          key={`${aberta.id}-${aberta.status}`} // paga ou reaberta: a janela recomeça na situação nova
          mensalidade={aberta}
          onFechar={fecharPainel}
          // Paga: a janela continua aberta, já com o recibo à mão.
          onPago={async (mensagem) => {
            await carregar();
            setAviso(mensagem);
          }}
          onConcluido={async (mensagem) => {
            fecharPainel();
            await carregar();
            setAviso(mensagem);
          }}
        />
      )}
      {confirmacao}
    </section>
  );
}

/** Valor da mensalidade e, se foi ajustado, o valor do plano riscado e o motivo (desconto, bolsa, correção). */
function ValorDaMensalidade({ mensalidade }) {
  return (
    <>
      <dd className="valor">
        {formatarMoeda(mensalidade.valor)}
        {mensalidade.valorOriginal != null && (
          <s className="valor-original" aria-label={`em vez de ${formatarMoeda(mensalidade.valorOriginal)}`}>
            {formatarMoeda(mensalidade.valorOriginal)}
          </s>
        )}
      </dd>
      {mensalidade.ajusteMotivo && <dd className="detalhe-nota">{mensalidade.ajusteMotivo}</dd>}
    </>
  );
}

const TITULOS = {
  pagar: 'Registrar pagamento',
  ajustar: 'Ajustar valor',
  cancelar: 'Cancelar cobrança',
  paga: 'Mensalidade paga',
  cancelada: 'Mensalidade cancelada',
};

/**
 * RF11 — baixa (data e forma: Pix ou dinheiro) ou, se já paga, o recibo (RF15) e a opção de desfazer a baixa.
 * Em aberto, a cobrança também pode ter o valor ajustado (desconto, bolsa, correção) ou ser cancelada, sempre com
 * o motivo; a cancelada pode ser reaberta.
 */
function PainelDaMensalidade({ mensalidade, onFechar, onPago, onConcluido }) {
  const paga = mensalidade.status === 'paga';
  const cancelada = mensalidade.status === 'cancelada';
  const aberta = emAberto(mensalidade);
  const nome = mensalidade.aluno?.nome ?? 'Aluno excluído';
  const valorDoPlano = mensalidade.valorOriginal ?? mensalidade.valor;
  const [modo, setModo] = useState(paga ? 'paga' : cancelada ? 'cancelada' : 'pagar');
  const [form, setForm] = useState({ dataPagamento: hojeISO(), formaPagamento: '' });
  const [ajuste, setAjuste] = useState({ valor: String(mensalidade.valor), motivo: mensalidade.ajusteMotivo ?? '' });
  const [motivoCancelamento, setMotivoCancelamento] = useState('');
  const [erros, setErros] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [confirmar, confirmacao] = useConfirmacao();
  const referencia = `${nome} (${nomeDoMes(mensalidade.mesReferencia)})`;

  function trocarModo(novo) {
    setModo(novo);
    setErros({});
  }

  async function executar(acao) {
    setSalvando(true);
    setErros({});
    try {
      await acao();
    } catch (e) {
      setErros(mapearErros(e));
    } finally {
      setSalvando(false);
    }
  }

  function enviar(evento) {
    evento.preventDefault();
    if (modo === 'paga') executar(() => baixarRecibo(mensalidade));
    else if (modo === 'pagar') {
      executar(async () => {
        await api.patch(`/mensalidades/${mensalidade.id}/pagamento`, form);
        await onPago(`Pagamento de ${referencia} registrado. O recibo já pode ser baixado.`);
      });
    } else if (modo === 'ajustar') {
      executar(async () => {
        const valor = String(ajuste.valor).trim().replace(',', '.');
        const atualizada = await api.patch(`/mensalidades/${mensalidade.id}/valor`, { valor, motivo: ajuste.motivo.trim() });
        await onConcluido(
          atualizada.valorOriginal == null
            ? `Mensalidade de ${referencia} de volta ao valor do plano: ${formatarMoeda(atualizada.valor)}.`
            : `Mensalidade de ${referencia} ajustada para ${formatarMoeda(atualizada.valor)}.`,
        );
      });
    } else if (modo === 'cancelar') {
      executar(async () => {
        await api.patch(`/mensalidades/${mensalidade.id}/cancelar`, { motivo: motivoCancelamento.trim() });
        await onConcluido(`Cobrança de ${referencia} cancelada: ela não conta mais nos totais nem gera alertas.`);
      });
    } else if (modo === 'cancelada') {
      executar(async () => {
        const reaberta = await api.patch(`/mensalidades/${mensalidade.id}/reabrir`);
        await onConcluido(
          `Cobrança de ${referencia} reaberta${reaberta.status === 'atrasada' ? ': já venceu e aparece como atrasada' : ''}.`,
        );
      });
    }
  }

  async function desfazer() {
    const confirmado = await confirmar({
      titulo: 'Desfazer este pagamento?',
      mensagem: `${nome} · ${nomeDoMes(mensalidade.mesReferencia)}. A mensalidade volta a ficar em aberto e o recibo deixa de valer.`,
      acao: 'Desfazer pagamento',
      perigo: true,
    });
    if (!confirmado) return;
    try {
      await api.delete(`/mensalidades/${mensalidade.id}/pagamento`);
      await onConcluido(`Pagamento de ${nome} desfeito: a mensalidade voltou a ficar em aberto.`);
    } catch (e) {
      setErros(mapearErros(e));
    }
  }

  const alterado =
    (modo === 'pagar' && form.formaPagamento !== '') ||
    (modo === 'ajustar' && (String(ajuste.valor) !== String(mensalidade.valor) || ajuste.motivo !== (mensalidade.ajusteMotivo ?? ''))) ||
    (modo === 'cancelar' && motivoCancelamento.trim() !== '');
  const rotuloAcao = {
    pagar: salvando ? 'Salvando…' : 'Registrar pagamento',
    ajustar: salvando ? 'Salvando…' : 'Salvar valor',
    cancelar: salvando ? 'Cancelando…' : 'Cancelar cobrança',
    paga: salvando ? 'Gerando…' : 'Baixar recibo',
    cancelada: salvando ? 'Reabrindo…' : 'Reabrir cobrança',
  }[modo];
  // Em aberto: ajustar o valor e cancelar ficam à mão; dentro deles, "Voltar" leva de novo à baixa.
  const outrasAcoes = paga ? (
    <button type="button" className="botao botao-fantasma botao-perigo" onClick={desfazer}>
      Desfazer pagamento
    </button>
  ) : aberta && modo === 'pagar' ? (
    <>
      <button type="button" className="botao botao-fantasma" onClick={() => trocarModo('ajustar')}>
        <Icone nome="editar" tamanho={18} />
        Ajustar valor
      </button>
      <button type="button" className="botao botao-fantasma botao-perigo" onClick={() => trocarModo('cancelar')}>
        Cancelar cobrança
      </button>
    </>
  ) : aberta ? (
    <button type="button" className="botao botao-fantasma" onClick={() => trocarModo('pagar')}>
      <Icone nome="anterior" tamanho={18} />
      Voltar ao pagamento
    </button>
  ) : null;

  return (
    <>
      <Painel
        titulo={TITULOS[modo]}
        descricao={`${nome} · ${nomeDoMes(mensalidade.mesReferencia, { maiuscula: true })}`}
        onFechar={onFechar}
        onSubmit={enviar}
        erros={erros}
        alterado={alterado}
        rotuloFechar={paga || cancelada ? 'Fechar' : 'Cancelar'}
        acao={
          <button
            type="submit"
            className={`botao ${modo === 'cancelar' ? 'botao-perigo-cheio' : 'botao-primario'}`}
            disabled={salvando}
          >
            {modo === 'paga' && <Icone nome="baixar" tamanho={18} />}
            {rotuloAcao}
          </button>
        }
        outrasAcoes={outrasAcoes}
      >
        {erros.geral && (
          <p className="alerta" role="alert">
            {erros.geral}
          </p>
        )}
        <dl className="detalhes">
          <div>
            <dt>Valor</dt>
            <ValorDaMensalidade mensalidade={mensalidade} />
          </div>
          <div>
            <dt>Vencimento</dt>
            <dd>{formatarDataCompleta(mensalidade.vencimento)}</dd>
          </div>
          <div>
            <dt>Situação</dt>
            <dd>
              <span className={`pill pill-${mensalidade.status}`}>{rotuloStatusMensalidade(mensalidade.status)}</span>
            </dd>
          </div>
          <div>
            <dt>Plano</dt>
            <dd>{mensalidade.plano?.nome ?? '—'}</dd>
          </div>
          {paga && (
            <>
              <div>
                <dt>Pago em</dt>
                <dd>{formatarDataCompleta(mensalidade.dataPagamento)}</dd>
              </div>
              <div>
                <dt>Forma</dt>
                <dd>{mensalidade.formaPagamentoNome ?? '—'}</dd>
              </div>
              {mensalidade.numeroRecibo != null && (
                <div>
                  <dt>Recibo</dt>
                  <dd>Nº {String(mensalidade.numeroRecibo).padStart(6, '0')}</dd>
                </div>
              )}
            </>
          )}
          {cancelada && (
            <div className="detalhe-largo">
              <dt>Motivo do cancelamento</dt>
              <dd>{mensalidade.cancelamentoMotivo ?? '—'}</dd>
            </div>
          )}
        </dl>

        {modo === 'pagar' && (
          <>
            <Opcoes
              legenda="Forma de pagamento"
              nome="formaPagamento"
              opcoes={FORMAS_PAGAMENTO}
              valor={form.formaPagamento}
              onChange={(e) => setForm((atual) => ({ ...atual, formaPagamento: e.target.value }))}
              erro={erros.formaPagamento}
            />
            <Campo rotulo="Data do pagamento" erro={erros.dataPagamento}>
              <input
                type="date"
                name="dataPagamento"
                max={hojeISO()}
                value={form.dataPagamento}
                onChange={(e) => setForm((atual) => ({ ...atual, dataPagamento: e.target.value }))}
              />
            </Campo>
          </>
        )}

        {modo === 'ajustar' && (
          <>
            <div className="grade">
              <Campo rotulo="Novo valor (R$)" erro={erros.valor} dica={`Valor do plano: ${formatarMoeda(valorDoPlano)}`}>
                <input
                  name="valor"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={ajuste.valor}
                  onChange={(e) => setAjuste((atual) => ({ ...atual, valor: e.target.value }))}
                />
              </Campo>
              <Campo rotulo="Motivo" erro={erros.motivo}>
                <input
                  name="motivo"
                  placeholder="Ex.: desconto de irmãos"
                  maxLength={MOTIVO_MAXIMO}
                  value={ajuste.motivo}
                  onChange={(e) => setAjuste((atual) => ({ ...atual, motivo: e.target.value }))}
                />
              </Campo>
            </div>
            {mensalidade.valorOriginal != null && (
              <button
                type="button"
                className="botao-link"
                onClick={() => setAjuste({ valor: String(mensalidade.valorOriginal), motivo: '' })}
              >
                Voltar ao valor do plano ({formatarMoeda(mensalidade.valorOriginal)})
              </button>
            )}
          </>
        )}

        {modo === 'cancelar' && (
          <>
            <Campo rotulo="Motivo do cancelamento" erro={erros.motivo}>
              <input
                name="motivoCancelamento"
                placeholder="Ex.: aluno saiu da escola"
                maxLength={MOTIVO_MAXIMO}
                value={motivoCancelamento}
                onChange={(e) => setMotivoCancelamento(e.target.value)}
              />
            </Campo>
            <p className="informacao">Sai dos totais e dos alertas, e pode ser reaberta depois.</p>
          </>
        )}

        {mensalidade.aluno && <LinkDoHistorico aluno={mensalidade.aluno} className="botao-link painel-link" />}
      </Painel>
      {confirmacao}
    </>
  );
}

/** O responsável vê o que está em aberto e os últimos pagamentos dos dependentes (RN03), com os recibos. */
/**
 * "Pagar com Pix": o QR e o "copia e cola" com a chave da escola e o valor da mensalidade. Quem confirma o
 * recebimento é a escola, pelo extrato; depois disso, o recibo aparece na lista.
 */
function PainelDoPix({ mensalidade, onFechar }) {
  const [pix, setPix] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    api
      .get(`/mensalidades/${mensalidade.id}/pix`)
      .then((dados) => ativo && setPix(dados))
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [mensalidade.id]);

  return (
    <Painel
      titulo="Pagar com Pix"
      descricao={`${mensalidade.aluno?.nome ?? 'Mensalidade'} · ${nomeDoMes(mensalidade.mesReferencia, { maiuscula: true })}`}
      onFechar={onFechar}
      rotuloFechar="Fechar"
    >
      {erro ? (
        <p className="alerta" role="alert">
          {erro}
        </p>
      ) : !pix ? (
        <Carregando linhas={4} />
      ) : (
        <>
          <dl className="detalhes">
            <div>
              <dt>Valor</dt>
              <dd className="valor">{formatarMoeda(pix.valor)}</dd>
            </div>
            <div>
              <dt>Vencimento</dt>
              <dd>{formatarDataCompleta(mensalidade.vencimento)}</dd>
            </div>
            <div className="detalhe-largo">
              <dt>Recebedor</dt>
              <dd>{pix.recebedor}</dd>
            </div>
          </dl>
          <CodigoPix copiaECola={pix.copiaECola} qrCodeSvg={pix.qrCodeSvg} />
          <p className="informacao">Depois que a escola confirmar o pagamento, o recibo fica disponível aqui.</p>
        </>
      )}
    </Painel>
  );
}

function MensalidadesDoResponsavel() {
  const [lista, setLista] = useState(null);
  const [erro, setErro] = useState('');
  const [baixando, setBaixando] = useState(null);
  // /mensalidades?pix=12 abre o Pix da mensalidade: o "voltar" do celular fecha a folha.
  const [pixAberto, abrirPix, fecharPix] = usePainel('pix');
  const paraPagar = pixAberto && lista ? lista.find((mensalidade) => String(mensalidade.id) === pixAberto) : null;

  useEffect(() => {
    let ativo = true;
    api
      .get('/mensalidades')
      .then((dados) => ativo && setLista(dados))
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, []);

  async function recibo(mensalidade) {
    setBaixando(mensalidade.id);
    setErro('');
    try {
      await baixarRecibo(mensalidade);
    } catch (e) {
      setErro(e.message);
    } finally {
      setBaixando(null);
    }
  }

  const abertas = (lista ?? []).filter(emAberto);
  const atrasadas = abertas.filter((mensalidade) => mensalidade.status === 'atrasada');
  const pagas = (lista ?? []).filter((mensalidade) => mensalidade.status === 'paga');
  const canceladas = (lista ?? []).filter((mensalidade) => mensalidade.status === 'cancelada');
  const variosDependentes = new Set((lista ?? []).map((mensalidade) => mensalidade.aluno?.id)).size > 1;

  function linha(mensalidade) {
    return (
      <li key={mensalidade.id}>
        <div className="linha">
          <span className="linha-texto">
            <strong>
              {nomeDoMes(mensalidade.mesReferencia, { maiuscula: true })}
              {variosDependentes && ` · ${mensalidade.aluno?.nome ?? ''}`}
            </strong>
            <small>{situacao(mensalidade)}</small>
          </span>
          <span className="linha-valor">
            <span className={`linha-fim${mensalidade.status === 'cancelada' ? ' riscado' : ''}`}>{formatarMoeda(mensalidade.valor)}</span>
            <span className={`pill pill-${mensalidade.status}`}>{rotuloStatusMensalidade(mensalidade.status)}</span>
          </span>
          {mensalidade.pixDisponivel && (
            <button
              type="button"
              className="botao botao-secundario botao-compacto"
              aria-label={`Pagar com Pix a mensalidade de ${nomeDoMes(mensalidade.mesReferencia)}`}
              onClick={() => abrirPix(mensalidade.id)}
            >
              <Icone nome="pix" tamanho={16} />
              Pix
            </button>
          )}
          {mensalidade.status === 'paga' && (
            <button
              type="button"
              className="botao-icone contorno"
              aria-label={`Baixar recibo de ${nomeDoMes(mensalidade.mesReferencia)}`}
              title="Baixar recibo"
              disabled={baixando === mensalidade.id}
              onClick={() => recibo(mensalidade)}
            >
              <Icone nome="baixar" tamanho={18} />
            </button>
          )}
        </div>
      </li>
    );
  }

  return (
    <section>
      <CabecalhoPagina titulo="Mensalidades">
        <LinkDoHistorico />
      </CabecalhoPagina>
      {erro && (
        <p className="alerta" role="alert">
          {erro}
        </p>
      )}

      <div className="cards">
        <Indicador
          rotulo="Em aberto"
          valor={lista ? formatarMoeda(somar(abertas)) : '–'}
          detalhe={lista && abertas.length > 0 ? plural(abertas.length, 'mensalidade', 'mensalidades') : undefined}
          compacto
        />
        <Indicador
          rotulo="Atrasadas"
          valor={lista ? String(atrasadas.length) : '–'}
          atencao={atrasadas.length > 0}
          compacto
        />
      </div>

      {!lista ? (
        !erro && (
          <div className="card">
            <Carregando linhas={4} />
          </div>
        )
      ) : lista.length === 0 ? (
        <div className="card">
          <Vazio icone="mensalidades" titulo="Nenhuma mensalidade por aqui ainda." />
        </div>
      ) : (
        <>
          <article className="card card-lista">
            <h2 className="card-lista-titulo">Em aberto</h2>
            {abertas.length === 0 ? (
              <Vazio icone="confirmado" titulo="Tudo em dia." />
            ) : (
              <ul className="lista">{abertas.map(linha)}</ul>
            )}
          </article>
          {pagas.length > 0 && (
            <article className="card card-lista">
              <div className="card-lista-titulo">
                <h2>Últimos pagamentos</h2>
                {pagas.length > PAGAS_NO_RESUMO && (
                  <Link to="/mensalidades/pagamentos" className="botao-link">
                    Ver todos
                  </Link>
                )}
              </div>
              <ul className="lista">{pagas.slice(0, PAGAS_NO_RESUMO).map(linha)}</ul>
            </article>
          )}
          {canceladas.length > 0 && (
            <article className="card card-lista">
              <h2 className="card-lista-titulo">Canceladas pela escola</h2>
              <ul className="lista">{canceladas.map(linha)}</ul>
            </article>
          )}
        </>
      )}
      {paraPagar && <PainelDoPix key={paraPagar.id} mensalidade={paraPagar} onFechar={fecharPix} />}
    </section>
  );
}
