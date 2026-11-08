import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api/index.js';
import { useAuth } from '../auth/AuthContext.jsx';
import AulaPainel from '../components/AulaPainel.jsx';
import {
  Aviso,
  CabecalhoPagina,
  Carregando,
  prefereMenosMovimento,
  useAviso,
  useConfirmacao,
  usePainel,
} from '../components/Estrutura.jsx';
import FormAgendarAula from '../components/FormAgendarAula.jsx';
import FeriadosDaEscola from '../components/FeriadosDaEscola.jsx';
import HorariosDisponiveis from '../components/HorariosDisponiveis.jsx';
import Icone from '../components/Icone.jsx';
import {
  aulaJaTerminou,
  diaDaSemana,
  diasDaSemana,
  horaAtual,
  hojeISO,
  inicioDaJanela,
  NOMES_DIAS,
  rotuloDia,
  rotuloPeriodo,
  somarDias,
} from '../utils/datas.js';
import { rotuloStatusAula } from '../utils/format.js';

/** Mesma regra da API: só se cancela aula agendada que ainda não começou. */
export function aindaNaoComecou(aula, hoje = hojeISO(), agora = horaAtual()) {
  return aula.data > hoje || (aula.data === hoje && aula.hora > agora);
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
/** O atalho "Alunos para agendar" (Início) abre o agendamento já com aluno, professor, horário e semanas. */
const PREENCHIMENTO = ['alunoId', 'professorId', 'hora', 'semanas'];
const SUAVE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

/** A aula cancelada encolhe e some (em vez de sumir de repente); sem animação disponível, segue direto. */
async function recolher(elemento) {
  if (!elemento?.animate || prefereMenosMovimento()) return;
  const altura = elemento.offsetHeight;
  elemento.style.overflow = 'hidden';
  const animacao = elemento.animate(
    [
      { opacity: 1, height: `${altura}px`, transform: 'scale(1)' },
      { opacity: 0, height: '0px', marginTop: '0px', paddingTop: '0px', paddingBottom: '0px', borderWidth: '0px', transform: 'scale(0.97)' },
    ],
    { duration: 260, easing: SUAVE, fill: 'forwards' },
  );
  await animacao.finished.catch(() => {});
}

/** Data e hora de agora, a cada minuto: a aula que termina sai da agenda sozinha, e a virada do dia também conta. */
function useRelogio(intervaloMs = 60_000) {
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const temporizador = setInterval(() => setAgora(new Date()), intervaloMs);
    return () => clearInterval(temporizador);
  }, [intervaloMs]);
  return { hoje: hojeISO(agora), hora: horaAtual(agora) };
}

/**
 * RF04–RF05 — agenda, de hoje em diante, em janelas de 7 dias. Aula que já terminou não aparece e não há como
 * voltar para antes de hoje: o que passou é histórico, não agenda. Cada papel vê só a sua parte (filtro da API).
 */
export default function AgendaPage() {
  const { usuario } = useAuth();
  const ehCoordenacao = usuario?.papel === 'coordenacao';
  const ehProfessor = usuario?.papel === 'professor';
  const { hoje, hora } = useRelogio();

  const [inicioEscolhido, setInicio] = useState(() => hoje);
  const [direcao, setDirecao] = useState(null); // para onde a janela andou: a nova entra deslizando desse lado
  const semana = inicioEscolhido < hoje ? hoje : inicioEscolhido; // o dia virou com a página aberta
  // /agenda?professor=5 já abre filtrada, com os horários de atendimento dele (link vindo de Usuários).
  const [params, setParams] = useSearchParams();
  const [professorFiltro, setProfessorFiltro] = useState(() => (/^\d+$/.test(params.get('professor') ?? '') ? params.get('professor') : ''));
  const [aulas, setAulas] = useState([]);
  const [feriados, setFeriados] = useState([]); // feriados e recessos que tocam a semana
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(0); // incrementar = recarregar a semana
  const [aviso, setAviso] = useAviso();
  const [confirmar, confirmacao] = useConfirmacao();
  const [listas, setListas] = useState(null); // { alunos, professores } — só para a coordenação
  // /agenda?aula=nova abre o agendamento; /agenda?aula=2026-10-19 abre com a data do dia tocado na agenda.
  const [painel, abrirPainel, fecharPainel] = usePainel('aula');
  const formAberto = painel !== null;
  const dataDoPainel = painel && DATA_ISO.test(painel) && painel >= hoje ? painel : '';
  const preenchimento = Object.fromEntries(PREENCHIMENTO.map((chave) => [chave, params.get(chave) ?? undefined]));
  const veioPreenchido = PREENCHIMENTO.some((chave) => params.has(chave));
  /** Fechar o agendamento que veio preenchido tira da URL também o preenchimento (não volta ao abrir de novo). */
  function fecharAgendamento() {
    if (!veioPreenchido) {
      fecharPainel();
      return;
    }
    const proximos = new URLSearchParams(params);
    ['aula', ...PREENCHIMENTO].forEach((chave) => proximos.delete(chave));
    setParams(proximos, { replace: true });
  }
  // /agenda?detalhe=12 abre a aula: presença e diário, aviso de falta, reposição e cancelamento.
  const [detalhe, abrirDetalhe, fecharDetalhe] = usePainel('detalhe');

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro('');
    const periodo = `inicio=${semana}&fim=${somarDias(semana, 6)}`;
    const filtro = professorFiltro ? `&professorId=${professorFiltro}` : '';
    // Os feriados só enfeitam a semana: se não vierem, a agenda aparece mesmo assim.
    api
      .get(`/feriados?${periodo}`)
      .then((lista) => ativo && setFeriados(lista))
      .catch(() => ativo && setFeriados([]));
    api
      .get(`/aulas?${periodo}${filtro}`)
      .then((lista) => ativo && setAulas(lista))
      .catch((e) => {
        if (!ativo) return;
        setAulas([]);
        setErro(e.message);
      })
      .finally(() => ativo && setCarregando(false));
    return () => {
      ativo = false;
    };
  }, [semana, professorFiltro, versao]);

  useEffect(() => {
    if (!ehCoordenacao) return undefined;
    let ativo = true;
    Promise.all([api.get('/alunos?status=ativo'), api.get('/usuarios?papel=professor'), api.get('/planos')])
      .then(([alunos, professores, planos]) => ativo && setListas({ alunos, professores, planos }))
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [ehCoordenacao]);

  const aulasPorDia = new Map();
  // A API não manda aula cancelada; a que já terminou também sai — o calendário mostra só o que vem pela frente
  // (a que está em andamento continua até acabar).
  for (const aula of aulas.filter((item) => !aulaJaTerminou(item, hoje, hora))) {
    aulasPorDia.set(aula.data, [...(aulasPorDia.get(aula.data) ?? []), aula]);
  }
  // Os 7 dias a partir do início da janela; domingo só aparece quando tem aula.
  const dias = diasDaSemana(semana).filter((dia) => diaDaSemana(dia) !== 0 || aulasPorDia.has(dia));
  const podeCancelar = (aula) =>
    (ehCoordenacao || ehProfessor) && aula.status === 'agendada' && aindaNaoComecou(aula, hoje, hora);
  const feriadoDoDia = (dia) => feriados.find((feriado) => feriado.inicio <= dia && dia <= feriado.fim);

  async function cancelar(aula) {
    const quem = aula.aluno?.nome ?? 'aluno';
    // RN12: o cancelamento é da escola, então o aluno pode repor (ou, se era uma reposição, remarcá-la).
    const efeito = aula.reposicao
      ? 'A aula perdida volta a poder ser reposta.'
      : 'Como o cancelamento é da escola, o aluno poderá repor a aula.';
    const confirmado = await confirmar({
      titulo: 'Cancelar esta aula?',
      mensagem: `${quem} · ${rotuloDia(aula.data)} às ${aula.hora}. O horário ficará disponível para outro aluno. ${efeito}`,
      acao: 'Cancelar aula',
      perigo: true,
    });
    if (!confirmado) return;
    try {
      await api.patch(`/aulas/${aula.id}/cancelar`);
      await recolher(document.querySelector(`[data-aula="${aula.id}"]`));
      setVersao((atual) => atual + 1); // a aula some do calendário e o horário fica livre
      setAviso(`Aula de ${quem} em ${rotuloDia(aula.data)} às ${aula.hora} cancelada.`);
    } catch (e) {
      setErro(e.message);
    }
  }

  /** Faixa de dias (celular): rola até o dia tocado e leva o foco ao título dele (leitor de tela e teclado). */
  function irParaDia(dia) {
    const titulo = document.getElementById(`dia-${dia}`);
    const suave = !prefereMenosMovimento();
    titulo?.closest('article')?.scrollIntoView?.({ behavior: suave ? 'smooth' : 'auto', block: 'start' });
    titulo?.focus({ preventScroll: true });
    // Um pulso discreto no dia, quando a rolagem termina: mostra onde se chegou.
    if (suave && titulo?.animate) {
      titulo.animate(
        [{ boxShadow: '0 0 0 0 rgb(28 25 23 / 32%)' }, { boxShadow: '0 0 0 10px rgb(28 25 23 / 0%)' }],
        { duration: 800, delay: 320, easing: 'ease-out' },
      );
    }
  }

  /** Anda até a janela que começa em `inicio`, deslizando no sentido do movimento. */
  function irParaJanela(inicio) {
    if (inicio === semana) return;
    setDirecao(inicio > semana ? 'proxima' : 'anterior');
    setInicio(inicio);
  }

  function aoAgendar(primeiraData) {
    irParaJanela(inicioDaJanela(primeiraData, hoje)); // vai para a janela da primeira aula agendada
    setVersao((atual) => atual + 1);
  }

  // O professor só aparece quando acrescenta algo: para o responsável, ou na coordenação com vários professores.
  const variosProfessores = (listas?.professores.length ?? 0) > 1;
  const mostrarProfessor = usuario?.papel === 'responsavel' || (ehCoordenacao && variosProfessores && !professorFiltro);
  function detalhes(aula) {
    const professor = mostrarProfessor && aula.professor && `Prof. ${aula.professor.nome}`;
    // A reposição (RF07) é dita no detalhe, sem selo: no celular, o selo apertaria o nome do aluno.
    return [aula.aluno?.instrumento, professor, aula.reposicao && 'Reposição'].filter(Boolean).join(' · ');
  }

  return (
    <section>
      <CabecalhoPagina titulo="Agenda">
        {ehCoordenacao && listas && !formAberto && (
          <button type="button" className="botao botao-primario" onClick={() => abrirPainel('nova')}>
            <Icone nome="mais" tamanho={18} />
            Agendar aula
          </button>
        )}
      </CabecalhoPagina>

      {erro && (
        <p className="alerta" role="alert">
          {erro}
        </p>
      )}
      <Aviso>{aviso}</Aviso>

      {ehCoordenacao && listas && formAberto && (
        <FormAgendarAula
          key={painel}
          dataInicial={dataDoPainel}
          preenchimento={preenchimento}
          alunos={listas.alunos}
          professores={listas.professores}
          planos={listas.planos}
          onAgendado={aoAgendar}
          onFechar={fecharAgendamento}
        />
      )}

      <div className="filtros">
        <div className="navegacao-semana" role="group" aria-label="Navegar entre semanas">
          {/* Começa hoje: antes disso não há o que agendar nem o que ver. */}
          <button
            type="button"
            className="botao-icone contorno"
            aria-label="Semana anterior"
            title={semana === hoje ? 'A agenda começa hoje' : 'Semana anterior'}
            disabled={semana === hoje}
            onClick={() => irParaJanela(somarDias(semana, -7))}
          >
            <Icone nome="anterior" tamanho={18} />
          </button>
          <strong aria-live="polite">{rotuloPeriodo(semana, somarDias(semana, 6))}</strong>
          <button
            type="button"
            className="botao-icone contorno"
            aria-label="Próxima semana"
            title="Próxima semana"
            onClick={() => irParaJanela(somarDias(semana, 7))}
          >
            <Icone nome="proximo" tamanho={18} />
          </button>
          {semana !== hoje && (
            <button type="button" className="botao botao-fantasma" onClick={() => irParaJanela(hoje)}>
              Hoje
            </button>
          )}
        </div>
        {ehCoordenacao && listas && (
          <select
            className="seletor"
            aria-label="Professor(a)"
            value={professorFiltro}
            onChange={(e) => setProfessorFiltro(e.target.value)}
          >
            <option value="">Todos os professores</option>
            {listas.professores.map((professor) => (
              <option key={professor.id} value={professor.id}>
                {professor.nome}
              </option>
            ))}
          </select>
        )}
      </div>

      {carregando && aulas.length === 0 ? (
        <div className="card">
          <Carregando linhas={5} />
        </div>
      ) : (
        <div className="card calendario" aria-busy={carregando}>
          {/* No celular, a janela num relance: o ponto marca o dia com aula; tocar leva até ele. */}
          <nav key={`faixa-${semana}`} className={`tira-dias${direcao ? ` entra-${direcao}` : ''}`} aria-label="Dias desta janela">
            {dias.map((dia) => {
              const quantas = aulasPorDia.get(dia)?.length ?? 0;
              const feriado = feriadoDoDia(dia);
              const contagem = quantas === 0 ? 'sem aulas' : quantas === 1 ? '1 aula' : `${quantas} aulas`;
              const resumo = feriado ? `${feriado.descricao}, ${contagem}` : contagem;
              const classes = ['tira-dia', dia === hoje && 'hoje', quantas > 0 && 'com-aula', feriado && 'feriado'];
              return (
                <button
                  key={dia}
                  type="button"
                  className={classes.filter(Boolean).join(' ')}
                  aria-label={`${rotuloDia(dia)}: ${resumo}`}
                  onClick={() => irParaDia(dia)}
                >
                  <span className="tira-nome">{NOMES_DIAS[diaDaSemana(dia)].slice(0, 3)}</span>
                  <span className="tira-numero">{Number(dia.slice(8))}</span>
                  <span className="tira-marca" />
                </button>
              );
            })}
          </nav>
          <div key={semana} className={`semana${direcao ? ` entra-${direcao}` : ''}`}>
            {dias.map((dia) => {
              const doDia = aulasPorDia.get(dia) ?? [];
              const ehHoje = dia === hoje;
              const feriado = feriadoDoDia(dia);
              const classes = ['dia', ehHoje && 'dia-hoje', doDia.length === 0 && 'dia-livre'];
              return (
                <article key={dia} className={classes.filter(Boolean).join(' ')} aria-current={ehHoje ? 'date' : undefined}>
                  <h2 id={`dia-${dia}`} className="dia-titulo" aria-label={rotuloDia(dia)} tabIndex={-1}>
                    <span className="dia-nome">{NOMES_DIAS[diaDaSemana(dia)].slice(0, 3)}</span>
                    <span className="dia-numero">{dia.slice(8)}</span>
                  </h2>
                  <div className="dia-conteudo">
                    {feriado && <p className="dia-feriado">{feriado.descricao} · sem aula</p>}
                    {doDia.length === 0 ? (
                      !feriado && (
                        <div className="dia-vazio-linha">
                          <p className="dia-vazio">Sem aulas</p>
                          {/* A coordenação agenda direto no dia vazio, com a data já preenchida. */}
                          {ehCoordenacao && listas && (
                            <button
                              type="button"
                              className="dia-agendar"
                              aria-label={`Agendar aula em ${rotuloDia(dia)}`}
                              onClick={() => abrirPainel(dia)}
                            >
                              <Icone nome="mais" tamanho={15} />
                              <span className="rotulo-opcional">Agendar</span>
                            </button>
                          )}
                        </div>
                      )
                    ) : (
                      <ul className="lista">
                        {doDia.map((aula) => {
                          const nome = aula.aluno?.nome ?? 'Aluno não encontrado';
                          const texto = detalhes(aula);
                          return (
                            <li key={aula.id} className={`aula aula-${aula.status}`} data-aula={aula.id}>
                              {/* Tocar na aula abre os detalhes; o "cancelar" continua à mão, ao lado. */}
                              <button
                                type="button"
                                className="aula-abrir"
                                aria-label={`Aula de ${nome}, ${rotuloDia(aula.data)} às ${aula.hora}: ver detalhes`}
                                onClick={() => abrirDetalhe(aula.id)}
                              >
                                <span className="aula-hora">{aula.hora}</span>
                                <span className="linha-texto">
                                  <strong>{nome}</strong>
                                  {texto && <small>{texto}</small>}
                                </span>
                                {/* "Agendada" é o normal: o selo só aparece quando o status pede atenção. */}
                                {aula.status !== 'agendada' && (
                                  <span className={`pill pill-${aula.status}`}>{rotuloStatusAula(aula.status)}</span>
                                )}                              </button>
                              {podeCancelar(aula) && (
                                <button
                                  type="button"
                                  className="botao-icone discreto"
                                  aria-label={`Cancelar aula de ${nome} às ${aula.hora}`}
                                  title="Cancelar aula"
                                  onClick={() => cancelar(aula)}
                                >
                                  <Icone nome="fechar" tamanho={16} />
                                </button>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {ehCoordenacao && professorFiltro && <HorariosDisponiveis key={professorFiltro} professorId={Number(professorFiltro)} />}
      {/* No fim da agenda, recolhidos: o dia a dia é a semana; feriados e horários se ajustam de vez em quando. */}
      {ehProfessor && <HorariosDisponiveis recolhivel />}
      {ehCoordenacao && <FeriadosDaEscola recolhivel onAlterado={() => setVersao((atual) => atual + 1)} />}
      {detalhe !== null && /^\d+$/.test(detalhe) && (
        <AulaPainel
          key={detalhe}
          aulaId={Number(detalhe)}
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
      {confirmacao}
    </section>
  );
}
