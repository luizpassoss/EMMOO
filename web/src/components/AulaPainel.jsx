import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/index.js';
import { formatarData, formatarMomento, horaFim, hojeISO, rotuloDia, somarDias } from '../utils/datas.js';
import { mapearErros } from '../utils/erros.js';
import { foiAlterado, rotuloStatusAula } from '../utils/format.js';
import Campo, { Opcoes } from './Campo.jsx';
import { Carregando, Painel, useConfirmacao } from './Estrutura.jsx';

const PRESENCA = [
  { valor: 'realizada', rotulo: 'Presente' },
  { valor: 'falta', rotulo: 'Faltou' },
];
const PRAZO_REPOSICAO_DIAS = 30; // RN11
const DIAS_VISIVEIS = 6; // datas de reposição mostradas de início (as outras, em "Mostrar mais datas")
const REGISTRO_VAZIO = { status: '', conteudoMinistrado: '', planoProxima: '' };

const quando = (aula) => `${rotuloDia(aula.data)} às ${aula.hora}`;
/** "2026-10-12T14:00" → { data: "2026-10-12", hora: "14:00" }. */
const deDataHora = (texto) => ({ data: texto.slice(0, 10), hora: texto.slice(11, 16) });
const primeiroNome = (nome) => String(nome ?? '').split(' ')[0];

/** "61 horas" / "3 dias": a antecedência do aviso de falta, do jeito que se fala. */
function antecedencia(horas) {
  if (horas < 48) return `${Math.floor(horas)} horas`;
  return `${Math.floor(horas / 24)} dias`;
}

/** O que acontece se a falta for avisada agora (RF06, RN05): dá ou não direito a reposição. */
function efeitoDoAviso(aula) {
  if (aula.reposicao) return 'Esta aula já é uma reposição: o horário fica livre, mas a falta não dá direito a outra reposição.';
  if (aula.horasAteAAula >= 24) {
    return `Com ${antecedencia(aula.horasAteAAula)} de antecedência, a falta dá direito a repor a aula em até ${PRAZO_REPOSICAO_DIAS} dias, sem custo.`;
  }
  return 'Faltam menos de 24 horas para a aula: a falta fica registrada e o horário é liberado, mas sem direito a reposição.';
}

function notaDoAviso(aula) {
  const momento = formatarMomento(aula.avisoFalta.dataSolicitacao);
  if (aula.avisoFalta.liberaReposicao) return `Falta avisada em ${momento}, com antecedência: dá direito a reposição.`;
  if (aula.reposicao) return `Falta avisada em ${momento}. Como esta aula era uma reposição, não há outra.`;
  return `Falta avisada em ${momento}, com menos de 24 horas de antecedência: sem direito a reposição.`;
}

/** Vagas agrupadas por dia, na ordem: [["2026-10-19", [vaga, vaga]], …]. */
function porDia(vagas) {
  const dias = new Map();
  for (const vaga of vagas) dias.set(vaga.data, [...(dias.get(vaga.data) ?? []), vaga]);
  return [...dias.entries()];
}

/**
 * Tudo sobre uma aula, numa folha: o que aconteceu (presença, falta avisada, reposição) e o que fazer agora —
 * registrar presença e diário (RF08/RF09, escola), avisar falta (RF06, família), escolher o horário da
 * reposição (RF07), remarcar (nova data e horário, a mesma aula) e cancelar. As ações vêm da API (`acoes`), que
 * aplica as regras de cada perfil.
 * - `onConcluido(mensagem)`: a ação terminou o assunto (registro salvo, reposição marcada, aula cancelada).
 * - `onAtualizada(mensagem)`: a aula mudou e a folha continua aberta (falta avisada: a reposição é o próximo passo).
 */
export default function AulaPainel({ aulaId, onFechar, onConcluido, onAtualizada, comHistorico = true }) {
  const [aula, setAula] = useState(null);
  const [erroCarga, setErroCarga] = useState('');
  const [versao, setVersao] = useState(0);
  const [registro, setRegistro] = useState(REGISTRO_VAZIO);
  const [registroInicial, setRegistroInicial] = useState(REGISTRO_VAZIO);
  const [reposicao, setReposicao] = useState(null); // { prazoAte, vagas } da reposição desta aula
  const [vaga, setVaga] = useState(null);
  const [todasAsDatas, setTodasAsDatas] = useState(false);
  const [erros, setErros] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [confirmar, confirmacao] = useConfirmacao();
  const [remarcando, setRemarcando] = useState(false);
  const [remarcacao, setRemarcacao] = useState({ data: '', hora: '' });
  const [vagasDoDia, setVagasDoDia] = useState(null); // horários livres do professor na nova data

  useEffect(() => {
    let ativo = true;
    setErroCarga('');
    api
      .get(`/aulas/${aulaId}`)
      .then((dados) => {
        if (!ativo) return;
        setAula(dados);
        const inicial = {
          status: dados.status === 'realizada' || dados.status === 'falta' ? dados.status : '',
          conteudoMinistrado: dados.diario?.conteudoMinistrado ?? '',
          planoProxima: dados.diario?.planoProxima ?? '',
        };
        setRegistro(inicial);
        setRegistroInicial(inicial);
      })
      .catch((e) => ativo && setErroCarga(e.message));
    return () => {
      ativo = false;
    };
  }, [aulaId, versao]);

  const podeRepor = Boolean(aula?.acoes.solicitarReposicao);
  useEffect(() => {
    if (!podeRepor) {
      setReposicao(null);
      return undefined;
    }
    let ativo = true;
    api
      .get(`/reposicoes/${aulaId}/vagas`)
      .then((dados) => ativo && setReposicao(dados))
      .catch((e) => ativo && setErros({ geral: e.message }));
    return () => {
      ativo = false;
    };
  }, [aulaId, podeRepor, versao]);

  // Remarcar: ao escolher a data, os horários livres do professor nesse dia aparecem para tocar.
  const professorDaAula = aula?.professorId;
  useEffect(() => {
    if (!remarcando || !remarcacao.data || !professorDaAula) {
      setVagasDoDia(null);
      return undefined;
    }
    let ativo = true;
    api
      .get(`/horarios/livres?professorId=${professorDaAula}&inicio=${remarcacao.data}&fim=${remarcacao.data}`)
      .then((lista) => ativo && setVagasDoDia(lista))
      .catch(() => ativo && setVagasDoDia(null));
    return () => {
      ativo = false;
    };
  }, [remarcando, remarcacao.data, professorDaAula]);

  if (!aula) {
    return (
      <Painel titulo="Aula" onFechar={onFechar} rotuloFechar="Fechar">
        {erroCarga ? (
          <p className="alerta" role="alert">
            {erroCarga}
          </p>
        ) : (
          <Carregando linhas={4} />
        )}
      </Painel>
    );
  }

  const nome = aula.aluno?.nome ?? 'Aluno';
  const { acoes } = aula;
  const modo = remarcando
    ? 'remarcar'
    : acoes.registrar
      ? 'registrar'
      : podeRepor
        ? 'repor'
        : acoes.avisarFalta
          ? 'avisar'
          : null;
  const alterado =
    (modo === 'registrar' && foiAlterado(registro, registroInicial)) ||
    (modo === 'remarcar' && Boolean(remarcacao.data || remarcacao.hora));

  function alterarRegistro(evento) {
    const { name, value } = evento.target;
    setRegistro((atual) => ({ ...atual, [name]: value }));
  }

  async function salvarRegistro() {
    const conteudo = registro.conteudoMinistrado.trim();
    const plano = registro.planoProxima.trim();
    if (!registro.status) {
      setErros({ status: 'Escolha se o aluno esteve presente ou faltou.' });
      return;
    }
    if (registro.status === 'realizada' && !conteudo && plano) {
      setErros({ conteudoMinistrado: 'Descreva o conteúdo da aula para guardar o plano da próxima.' });
      return;
    }
    setSalvando(true);
    setErros({});
    try {
      if (registro.status !== aula.status) {
        await api.patch(`/aulas/${aula.id}/presenca`, { status: registro.status });
        setAula((atual) => ({ ...atual, status: registro.status })); // se o diário falhar, a presença já está salva
      }
      const diarioMudou = conteudo !== (aula.diario?.conteudoMinistrado ?? '') || plano !== (aula.diario?.planoProxima ?? '');
      if (registro.status === 'realizada' && conteudo && diarioMudou) {
        await api.put(`/aulas/${aula.id}/diario`, { conteudoMinistrado: conteudo, planoProxima: plano });
      }
      onConcluido?.(
        registro.status === 'falta'
          ? `Falta de ${nome} registrada.`
          : `Presença de ${nome} registrada${conteudo ? ', com o diário da aula' : ''}.`,
      );
    } catch (e) {
      setErros(mapearErros(e));
    } finally {
      setSalvando(false);
    }
  }

  async function marcarReposicao() {
    if (!vaga) {
      setErros({ hora: 'Escolha um dos horários livres.' });
      return;
    }
    setSalvando(true);
    setErros({});
    try {
      const { aula: nova } = await api.post('/reposicoes', { aulaId: aula.id, data: vaga.data, hora: vaga.hora });
      onConcluido?.(`Reposição de ${nome} marcada para ${quando(nova)}.`);
    } catch (e) {
      // Horário tomado no meio do caminho: a API sugere outros; a lista de vagas é atualizada.
      setErros(mapearErros(e));
      setVaga(null);
      setVersao((atual) => atual + 1);
    } finally {
      setSalvando(false);
    }
  }

  async function avisarFalta() {
    const confirmado = await confirmar({
      titulo: 'Avisar falta?',
      mensagem: `${nome} · ${quando(aula)}. ${efeitoDoAviso(aula)}`,
      acao: 'Avisar falta',
    });
    if (!confirmado) return;
    setSalvando(true);
    setErros({});
    try {
      const resultado = await api.post(`/aulas/${aula.id}/falta`);
      onAtualizada?.(
        resultado.liberaReposicao
          ? `Falta avisada. A aula pode ser reposta até ${formatarData(somarDias(aula.data, PRAZO_REPOSICAO_DIAS))}.`
          : 'Falta avisada. O horário da aula foi liberado.',
      );
      setVersao((atual) => atual + 1); // a folha passa a mostrar a escolha do horário da reposição
    } catch (e) {
      setErros(mapearErros(e));
    } finally {
      setSalvando(false);
    }
  }

  async function cancelar() {
    const efeito = aula.reposicao
      ? 'A aula perdida volta a poder ser reposta.'
      : 'Como o cancelamento é da escola, o aluno poderá repor a aula.';
    const confirmado = await confirmar({
      titulo: 'Cancelar esta aula?',
      mensagem: `${nome} · ${quando(aula)}. O horário ficará disponível para outro aluno. ${efeito}`,
      acao: 'Cancelar aula',
      perigo: true,
    });
    if (!confirmado) return;
    setSalvando(true);
    try {
      await api.patch(`/aulas/${aula.id}/cancelar`);
      onConcluido?.(`Aula de ${nome} em ${quando(aula)} cancelada.`);
    } catch (e) {
      setErros(mapearErros(e));
    } finally {
      setSalvando(false);
    }
  }

  function iniciarRemarcacao() {
    setRemarcacao({ data: '', hora: '' });
    setErros({});
    setRemarcando(true);
  }

  function desistirDeRemarcar() {
    setRemarcando(false);
    setErros({});
  }

  async function remarcar() {
    const faltando = {
      ...(!remarcacao.data && { data: 'Escolha a nova data.' }),
      ...(!remarcacao.hora && { hora: 'Escolha um horário livre ou digite o horário.' }),
    };
    if (Object.keys(faltando).length > 0) {
      setErros(faltando);
      return;
    }
    setSalvando(true);
    setErros({});
    try {
      const { mensagem } = await api.patch(`/aulas/${aula.id}/remarcar`, remarcacao);
      onConcluido?.(mensagem);
    } catch (e) {
      setErros(mapearErros(e));
    } finally {
      setSalvando(false);
    }
  }

  function enviar(evento) {
    evento.preventDefault();
    if (modo === 'remarcar') remarcar();
    else if (modo === 'registrar') salvarRegistro();
    else if (modo === 'repor') marcarReposicao();
    else if (modo === 'avisar') avisarFalta();
  }

  const rotuloAcao = {
    remarcar: 'Remarcar aula',
    registrar: 'Salvar registro',
    repor: 'Marcar reposição',
    avisar: 'Avisar falta',
  }[modo];
  const dias = reposicao ? porDia(reposicao.vagas) : [];
  const notas = [
    aula.reposicaoDe && `Reposição da aula de ${quando(aula.reposicaoDe)}.`,
    aula.remarcadaDe && `Aula remarcada. Antes: ${quando(deDataHora(aula.remarcadaDe.dataHora))}.`,
    aula.avisoFalta && notaDoAviso(aula),
    aula.status === 'falta' && !aula.avisoFalta && 'Falta registrada pelo professor.',
    aula.reposicaoMarcada && `Reposição marcada para ${quando(aula.reposicaoMarcada)}.`,
    aula.reposicaoPossivel && !aula.reposicaoPossivel.permitido && aula.reposicaoPossivel.mensagem,
  ].filter(Boolean);

  return (
    <>
      <Painel
        titulo={remarcando ? `Remarcar a aula de ${nome}` : `Aula de ${nome}`}
        descricao={`${rotuloDia(aula.data)} · ${aula.hora} às ${horaFim(aula.hora, aula.duracaoMin)}`}
        onFechar={onFechar}
        onSubmit={enviar}
        erros={erros}
        alterado={alterado}
        rotuloFechar="Fechar"
        acao={
          modo && (
            <button type="submit" className="botao botao-primario" disabled={salvando || (modo === 'registrar' && !alterado)}>
              {salvando ? 'Salvando…' : rotuloAcao}
            </button>
          )
        }
        outrasAcoes={
          remarcando ? (
            <button type="button" className="botao botao-fantasma" disabled={salvando} onClick={desistirDeRemarcar}>
              Voltar
            </button>
          ) : (
            (acoes.remarcar || acoes.cancelar) && (
              <>
                {acoes.remarcar && (
                  <button type="button" className="botao botao-fantasma" disabled={salvando} onClick={iniciarRemarcacao}>
                    Remarcar
                  </button>
                )}
                {acoes.cancelar && (
                  <button type="button" className="botao botao-fantasma botao-perigo" disabled={salvando} onClick={cancelar}>
                    Cancelar aula
                  </button>
                )}
              </>
            )
          )
        }
      >
        {erros.geral && (
          <p className="alerta" role="alert">
            {erros.geral}
          </p>
        )}

        <dl className="detalhes">
          <div>
            <dt>Situação</dt>
            <dd>
              {/* Aula que já começou e ainda não tem presença: "A registrar" diz o que falta (e não "Agendada"). */}
            {aula.status === 'agendada' && aula.horasAteAAula <= 0 ? (
              <span className="pill pill-pendente">A registrar</span>
            ) : (
              <span className={`pill pill-${aula.status}`}>{rotuloStatusAula(aula.status)}</span>
            )}
              {aula.reposicao && <span className="pill pill-reposicao">Reposição</span>}
            </dd>
          </div>
          <div>
            <dt>Instrumento</dt>
            <dd>{aula.aluno?.instrumento ?? '—'}</dd>
          </div>
          <div>
            <dt>Professor(a)</dt>
            <dd>{aula.professor?.nome ?? '—'}</dd>
          </div>
          <div>
            <dt>Duração</dt>
            <dd>{aula.duracaoMin} min</dd>
          </div>
        </dl>

        {notas.map((nota) => (
          <p key={nota} className="informacao">
            {nota}
          </p>
        ))}

        {/* Continuidade pedagógica (RF09): o que ficou combinado na aula anterior. */}
        {aula.planoAnterior && (
          <section className="bloco">
            <h3>Plano deixado na aula de {formatarData(aula.planoAnterior.aula.data)}</h3>
            <p className="texto-livre">{aula.planoAnterior.planoProxima}</p>
          </section>
        )}

        {modo === 'registrar' && (
          <>
            <Opcoes
              legenda="Presença"
              nome="status"
              opcoes={PRESENCA}
              valor={registro.status}
              onChange={alterarRegistro}
              erro={erros.status}
            />
            {registro.status === 'realizada' && (
              <>
                <Campo rotulo="Conteúdo ministrado" erro={erros.conteudoMinistrado}>
                  <textarea name="conteudoMinistrado" rows={4} maxLength={5000} value={registro.conteudoMinistrado} onChange={alterarRegistro} />
                </Campo>
                <Campo
                  rotulo="Plano para a próxima aula (opcional)"
                  erro={erros.planoProxima}
                  dica="Aparece na próxima aula do aluno."
                >
                  <textarea name="planoProxima" rows={3} maxLength={5000} value={registro.planoProxima} onChange={alterarRegistro} />
                </Campo>
              </>
            )}
          </>
        )}

        {modo !== 'registrar' && aula.diario && (
          <section className="bloco">
            <h3>Conteúdo da aula</h3>
            <p className="texto-livre">{aula.diario.conteudoMinistrado}</p>
            {aula.diario.planoProxima && (
              <>
                <h3>Para a próxima aula</h3>
                <p className="texto-livre">{aula.diario.planoProxima}</p>
              </>
            )}
          </section>
        )}

        {modo === 'repor' && (
          <fieldset className="campo">
            <legend>Horário da reposição</legend>
            <small className="dica-campo">
              Horários livres de {aula.professor?.nome ?? 'professor(a)'}
              {reposicao?.prazoAte ? ` até ${formatarData(reposicao.prazoAte)}` : ''}, sem custo adicional.
            </small>
            {!reposicao ? (
              <Carregando linhas={2} />
            ) : dias.length === 0 ? (
              <p className="vagas">
                <span>Não há horário livre dentro do prazo. Fale com a coordenação da escola.</span>
              </p>
            ) : (
              <div className="vagas-reposicao">
                {(todasAsDatas ? dias : dias.slice(0, DIAS_VISIVEIS)).map(([dia, lista]) => (
                  <div key={dia} className="vagas-dia">
                    <span className="vagas-dia-nome">{rotuloDia(dia)}</span>
                    <div className="chips">
                      {lista.map((opcao) => {
                        const escolhida = vaga?.data === opcao.data && vaga?.hora === opcao.hora;
                        return (
                          <label key={opcao.hora} className={`chip chip-botao${escolhida ? ' ativo' : ''}`}>
                            <input
                              type="radio"
                              className="sr-only"
                              name="vaga"
                              value={`${opcao.data} ${opcao.hora}`}
                              checked={escolhida}
                              aria-label={`${rotuloDia(opcao.data)} às ${opcao.hora}`}
                              onChange={() => {
                                setVaga(opcao);
                                setErros({});
                              }}
                            />
                            {opcao.hora}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {dias.length > DIAS_VISIVEIS && !todasAsDatas && (
                  <button type="button" className="botao-link" onClick={() => setTodasAsDatas(true)}>
                    Mostrar mais datas
                  </button>
                )}
              </div>
            )}
            {(erros.hora || erros.data) && <small className="erro-campo">{erros.hora || erros.data}</small>}
          </fieldset>
        )}

        {modo === 'avisar' && <p className="informacao">{efeitoDoAviso(aula)}</p>}

        {modo === 'remarcar' && (
          <>
            <div className="grade">
              <Campo rotulo="Nova data" erro={erros.data}>
                <input
                  name="data"
                  type="date"
                  min={hojeISO()}
                  value={remarcacao.data}
                  onChange={(e) => {
                    setRemarcacao({ data: e.target.value, hora: '' });
                    setErros({});
                  }}
                />
              </Campo>
              <Campo rotulo="Novo horário" erro={erros.hora}>
                <input
                  name="hora"
                  type="time"
                  value={remarcacao.hora}
                  onChange={(e) => setRemarcacao((atual) => ({ ...atual, hora: e.target.value }))}
                />
              </Campo>
            </div>
            {vagasDoDia && (
              <div className="vagas">
                <strong>Horários livres de {aula.professor?.nome ?? 'professor(a)'} em {rotuloDia(remarcacao.data)}</strong>
                {vagasDoDia.length === 0 ? (
                  <span>Nenhum horário de atendimento livre neste dia (dá para digitar o horário).</span>
                ) : (
                  <div className="chips">
                    {vagasDoDia.map((opcao) => (
                      <button
                        key={opcao.hora}
                        type="button"
                        className={`chip chip-botao${remarcacao.hora === opcao.hora ? ' ativo' : ''}`}
                        aria-pressed={remarcacao.hora === opcao.hora}
                        onClick={() => setRemarcacao((atual) => ({ ...atual, hora: opcao.hora }))}
                      >
                        {opcao.hora}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {aula.reposicao && <p className="informacao">Reposição: a nova data precisa estar no prazo de 30 dias.</p>}
          </>
        )}

        {comHistorico && (
          <Link to={`/alunos/${aula.alunoId}`} className="botao-link painel-link">
            Ver o histórico de {primeiroNome(nome)}
          </Link>
        )}
      </Painel>
      {/* Fora da folha: no celular ela se move (arrasto) e a pergunta precisa ficar parada sobre a tela. */}
      {confirmacao}
    </>
  );
}
