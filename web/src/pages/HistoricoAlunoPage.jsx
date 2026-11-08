import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/index.js';
import { useAuth } from '../auth/AuthContext.jsx';
import AulaPainel from '../components/AulaPainel.jsx';
import { Aviso, CabecalhoPagina, Carregando, Indicador, useAviso, usePainel, Vazio } from '../components/Estrutura.jsx';
import Icone from '../components/Icone.jsx';
import { salvarArquivo } from '../utils/arquivo.js';
import { formatarData, formatarDataCompleta, formatarMomento, hojeISO, nomeDoMes, rotuloDia, rotuloDiaRelativo } from '../utils/datas.js';
import { formatarMoeda, formatarPercentual, linkDoContato, rotuloStatusAula, rotuloStatusMensalidade } from '../utils/format.js';

const AULAS_VISIVEIS = 8; // as mais recentes; o resto aparece em "Ver todas"
const quando = (aula) => `${rotuloDia(aula.data)} às ${aula.hora}`;

/** "2026-10-12T14:00" → "12/10 às 14:00". */
function dataHora(texto) {
  const [data, hora] = texto.split('T');
  return `${formatarData(data)} às ${hora}`;
}

/** Avisos e pedidos do aluno, em uma frase: o que foi pedido, quando e o resultado. */
function descreverPedido(pedido) {
  // Remarcação: a aula (a mesma) mudou de dia e horário — "de" e "para" ficam guardados no pedido.
  if (pedido.tipo === 'remarcacao' && pedido.dataAnterior && pedido.novaData) {
    return `Aula remarcada de ${dataHora(pedido.dataAnterior)} para ${dataHora(pedido.novaData)}.`;
  }
  const aula = pedido.aula ? ` da aula de ${formatarData(pedido.aula.data)} às ${pedido.aula.hora}` : '';
  if (pedido.tipo === 'falta') {
    return `Falta avisada${aula}${pedido.liberaReposicao ? ', com direito a reposição' : ', sem direito a reposição'}.`;
  }
  if (pedido.tipo === 'reposicao' && pedido.novaData) {
    return `Reposição${aula} marcada para ${dataHora(pedido.novaData)}.`;
  }
  return `Pedido de ${pedido.tipo}${aula}.`;
}

/**
 * RF14 — histórico consolidado do aluno: presença e diário de cada aula, próximas aulas, reposições, avisos de falta
 * e mensalidades. A coordenação vê tudo; o responsável, só dos dependentes; o professor, as próprias aulas com o
 * aluno e nada do financeiro (o recorte é feito pela API).
 */
export default function HistoricoAlunoPage() {
  const { id } = useParams();
  const { usuario } = useAuth();
  const [historico, setHistorico] = useState(null);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(0);
  const [todas, setTodas] = useState(false);
  const [aviso, setAviso] = useAviso();
  const [detalhe, abrirDetalhe, fecharDetalhe] = usePainel('detalhe');
  const hoje = hojeISO();

  useEffect(() => {
    let ativo = true;
    api
      .get(`/alunos/${id}/historico`)
      .then((dados) => {
        if (!ativo) return;
        setHistorico(dados);
        setErro('');
      })
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [id, versao]);

  async function recibo(mensalidade) {
    try {
      const { conteudo, arquivo } = await api.baixar(`/mensalidades/${mensalidade.id}/recibo`);
      salvarArquivo(conteudo, arquivo ?? `recibo-${mensalidade.mesReferencia}.pdf`);
    } catch (e) {
      setErro(e.message);
    }
  }

  if (!historico) {
    return (
      <section>
        <CabecalhoPagina voltar titulo="Histórico do aluno" />
        {erro ? (
          <p className="alerta" role="alert">
            {erro}
          </p>
        ) : (
          <div className="card">
            <Carregando linhas={5} />
          </div>
        )}
      </section>
    );
  }

  const { aluno, resumo, aulas, proximas, solicitacoes, mensalidades } = historico;
  const ehProfessor = usuario?.papel === 'professor';
  const ehCoordenacao = usuario?.papel === 'coordenacao';
  const descricao = [aluno.instrumento, aluno.plano?.nome, aluno.responsavel && `Responsável: ${aluno.responsavel.nome}`]
    .filter(Boolean)
    .join(' · ');
  const aulasVisiveis = todas ? aulas : aulas.slice(0, AULAS_VISIVEIS);

  return (
    <section>
      <CabecalhoPagina voltar titulo={aluno.nome} descricao={descricao}>
        {aluno.status === 'inativo' && <span className="pill pill-inativo">Inativo</span>}
        {ehCoordenacao && (
          <Link to={`/alunos?aluno=${aluno.id}`} className="botao botao-secundario">
            Editar cadastro
          </Link>
        )}
      </CabecalhoPagina>

      {erro && (
        <p className="alerta" role="alert">
          {erro}
        </p>
      )}
      <Aviso>{aviso}</Aviso>

      <div className="cards cards-cinco">
        <Indicador
          rotulo="Presença"
          valor={formatarPercentual(resumo.percentual)}
          detalhe="das aulas registradas"
          compacto
        />
        <Indicador rotulo="Presenças" valor={String(resumo.presencas)} compacto />
        <Indicador rotulo="Faltas" valor={String(resumo.faltas)} compacto />
        <Indicador rotulo="Reposições" valor={String(resumo.reposicoes)} compacto />
        {resumo.emAberto && (
          <Indicador
            rotulo="Em aberto"
            valor={formatarMoeda(resumo.emAberto.valor)}
            atencao={mensalidades.some((mensalidade) => mensalidade.status === 'atrasada')}
            compacto
          />
        )}
      </div>

      {aluno.contato && (
        <p className="informacao">
          {/* No celular, tocar no telefone liga e no e-mail abre a mensagem. */}
          Contato:{' '}
          {linkDoContato(aluno.contato) ? (
            <a className="botao-link" href={linkDoContato(aluno.contato)}>
              {aluno.contato}
            </a>
          ) : (
            aluno.contato
          )}
        </p>
      )}

      <article className="card">
        <div className="card-cabecalho">
          <h2>Próximas aulas</h2>
        </div>
        {proximas.length === 0 ? (
          <Vazio icone="agenda" titulo="Nenhuma aula agendada." />
        ) : (
          <ul className="lista">
            {proximas.map((aula) => (
              <li key={aula.id} className="proxima-aula">
                <button type="button" className="linha-botao" onClick={() => abrirDetalhe(aula.id)}>
                  <span className="linha-texto">
                    <strong>{rotuloDiaRelativo(aula.data, hoje)}</strong>
                    <small>
                      {[aula.professor && `Prof. ${aula.professor.nome}`, aula.reposicao && 'Reposição'].filter(Boolean).join(' · ')}
                    </small>
                  </span>
                  <span className="linha-fim">{aula.hora}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="card">
        <div className="card-cabecalho">
          <h2>Aulas</h2>
        </div>
        {aulas.length === 0 ? (
          <Vazio icone="aulas" titulo="Nenhuma aula no histórico ainda." />
        ) : (
          <>
            <ul className="lista linha-do-tempo">
              {aulasVisiveis.map((aula) => (
                <li key={aula.id}>
                  <button type="button" className="linha-botao" onClick={() => abrirDetalhe(aula.id)}>
                    <span className="linha-texto">
                      <strong>{quando(aula)}</strong>
                      <small>
                        {aula.diario
                          ? aula.diario.conteudoMinistrado
                          : aula.status === 'agendada'
                            ? 'Presença ainda não registrada'
                            : aula.status === 'falta'
                              ? aula.faltaAvisada
                                ? 'Falta avisada'
                                : 'Falta'
                              : 'Sem diário'}
                      </small>
                    </span>
                    <span className={`pill pill-${aula.status === 'agendada' ? 'pendente' : aula.status}`}>
                      {aula.status === 'agendada' ? 'A registrar' : rotuloStatusAula(aula.status)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {aulas.length > AULAS_VISIVEIS && !todas && (
              <button type="button" className="botao-link ver-todas" onClick={() => setTodas(true)}>
                Ver todas as {aulas.length} aulas
              </button>
            )}
          </>
        )}
      </article>

      {solicitacoes.length > 0 && (
        <article className="card">
          <div className="card-cabecalho">
            <h2>Faltas, reposições e remarcações</h2>
          </div>
          <ul className="lista">
            {solicitacoes.map((pedido) => (
              <li key={pedido.id} className="lista-item">
                <span className="indicador-icone" aria-hidden="true">
                  <Icone nome={{ falta: 'falta', remarcacao: 'agenda' }[pedido.tipo] ?? 'reposicao'} tamanho={18} />
                </span>
                <span className="lista-texto">
                  <strong>{descreverPedido(pedido)}</strong>
                  <small>Em {formatarMomento(pedido.dataSolicitacao)}</small>
                </span>
              </li>
            ))}
          </ul>
        </article>
      )}

      {!ehProfessor && (
        <article className="card">
          <div className="card-cabecalho">
            <h2>Mensalidades</h2>
            {ehCoordenacao && (
              <Link to="/mensalidades" className="botao-link">
                Ver mensalidades
              </Link>
            )}
          </div>
          {mensalidades.length === 0 ? (
            <Vazio icone="mensalidades" titulo="Nenhuma mensalidade gerada ainda." />
          ) : (
            <ul className="lista">
              {mensalidades.map((mensalidade) => (
                <li key={mensalidade.id} className="lista-item">
                  <span className="lista-texto">
                    <strong>{nomeDoMes(mensalidade.mesReferencia, { maiuscula: true })}</strong>
                    <small>
                      {mensalidade.status === 'paga'
                        ? `Paga em ${formatarDataCompleta(mensalidade.dataPagamento)}${mensalidade.formaPagamentoNome ? ` · ${mensalidade.formaPagamentoNome}` : ''}`
                        : mensalidade.status === 'cancelada'
                          ? 'Cobrança cancelada pela escola'
                          : `Vencimento ${formatarDataCompleta(mensalidade.vencimento)}${mensalidade.valorOriginal != null ? ' · valor ajustado' : ''}`}
                    </small>
                  </span>
                  <span className="linha-valor">
                    <span className={`valor${mensalidade.status === 'cancelada' ? ' riscado' : ''}`}>{formatarMoeda(mensalidade.valor)}</span>
                    <span className={`pill pill-${mensalidade.status}`}>{rotuloStatusMensalidade(mensalidade.status)}</span>
                  </span>
                  {mensalidade.status === 'paga' && (
                    <button
                      type="button"
                      className="botao-icone contorno"
                      aria-label={`Baixar recibo de ${nomeDoMes(mensalidade.mesReferencia)}`}
                      title="Baixar recibo"
                      onClick={() => recibo(mensalidade)}
                    >
                      <Icone nome="baixar" tamanho={18} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </article>
      )}

      {detalhe !== null && /^\d+$/.test(detalhe) && (
        <AulaPainel
          key={detalhe}
          aulaId={Number(detalhe)}
          comHistorico={false}
          onFechar={fecharDetalhe}
          onConcluido={(mensagem) => {
            fecharDetalhe();
            setVersao((atual) => atual + 1);
            setAviso(mensagem);
          }}
          onAtualizada={(mensagem) => {
            setVersao((atual) => atual + 1);
            setAviso(mensagem);
          }}
        />
      )}
    </section>
  );
}
