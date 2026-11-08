import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/index.js';
import { useAuth } from '../auth/AuthContext.jsx';
import AulaPainel from '../components/AulaPainel.jsx';
import { Aviso, CabecalhoPagina, Carregando, Indicador, useAviso, usePainel, Vazio } from '../components/Estrutura.jsx';
import Icone from '../components/Icone.jsx';
import {
  dataPorExtenso,
  formatarData,
  horaAtual,
  horaFim,
  hojeISO,
  rotuloDiaRelativo,
  somarDias,
} from '../utils/datas.js';
import { formatarMoeda, formatarPercentual, iniciais, plural } from '../utils/format.js';

const LIMITE_PROXIMAS = 5;
const LIMITE_PARA_AGENDAR = 3; // os primeiros; o resto em "Ver todos"
const SEMANAS_DA_RENOVACAO = 12; // a série renovada: cerca de três meses de aulas semanais

/** Escola recém-cadastrada (sem alunos): o caminho para começar, na ordem em que cada passo depende do anterior. */
const PRIMEIROS_PASSOS = [
  { para: '/planos?plano=novo', titulo: 'Cadastre os planos', detalhe: 'Tipo, valor mensal e número de aulas por semana' },
  { para: '/usuarios?usuario=novo', titulo: 'Cadastre o acesso dos professores', detalhe: 'E, se necessário, o dos responsáveis' },
  { para: '/alunos?aluno=novo', titulo: 'Cadastre os alunos', detalhe: 'Cada aluno vinculado ao seu plano' },
];

/**
 * RF13 — os números da escola (coordenação) ou da própria agenda (professor), numa grade só, cada um com o
 * rótulo e o número (sem explicações: o cartão leva ao assunto). Antes de carregar, "–".
 */
function IndicadoresDaEscola({ papel, dados }) {
  const coordenacao = papel === 'coordenacao';
  const cartoes = [
    { rotulo: 'Aulas hoje', valor: dados && String(dados.aulasHoje), para: '/agenda' },
    { rotulo: 'A registrar', valor: dados && String(dados.aRegistrar), para: '/aulas', atencao: dados?.aRegistrar > 0 },
    coordenacao && { rotulo: 'Alunos ativos', valor: dados && String(dados.alunosAtivos), para: '/alunos' },
    {
      rotulo: 'Presença',
      valor: dados && formatarPercentual(dados.presenca.percentual),
      detalhe: `últimos ${dados?.presenca.dias ?? 30} dias`,
    },
    coordenacao && {
      rotulo: 'Em atraso',
      valor: dados && formatarMoeda(dados.inadimplencia.valor),
      // Sem atraso, o "R$ 0,00" já diz tudo; com atraso, quantas mensalidades são.
      detalhe: dados?.inadimplencia.quantidade > 0 ? plural(dados.inadimplencia.quantidade, 'mensalidade', 'mensalidades') : undefined,
      para: '/mensalidades',
      atencao: dados?.inadimplencia.quantidade > 0,
      compacto: true,
    },
    coordenacao && {
      rotulo: 'Recebido no mês',
      valor: dados && formatarMoeda(dados.mesAtual.recebido),
      detalhe: dados && `de ${formatarMoeda(dados.mesAtual.previsto)}`,
      para: '/relatorios',
      compacto: true,
    },
  ].filter(Boolean);

  return (
    <div className="cards cards-painel">
      {cartoes.map(({ valor, ...cartao }) => (
        <Indicador key={cartao.rotulo} {...cartao} valor={valor ?? '–'} />
      ))}
    </div>
  );
}

/** O agendamento da coordenação, já preenchido com o aluno e, se houver, o professor, o dia e o horário de sempre. */
function linkParaAgendar({ aluno, sugestao }) {
  const params = new URLSearchParams({ alunoId: String(aluno.id) });
  if (sugestao) {
    params.set('professorId', String(sugestao.professorId));
    params.set('hora', sugestao.hora);
    params.set('semanas', String(SEMANAS_DA_RENOVACAO));
  }
  return `/agenda?aula=${sugestao?.data ?? 'nova'}&${params}`;
}

function situacaoParaAgendar({ situacao, ultimaAula }) {
  if (situacao === 'terminando') return `Última aula marcada: ${rotuloDiaRelativo(ultimaAula.data)}`;
  return ultimaAula ? `Sem aulas marcadas desde ${formatarData(ultimaAula.data)}` : 'Nenhuma aula marcada ainda';
}

/**
 * Fim da série de aulas: os alunos ativos sem aula marcada ou com a última nas próximas 2 semanas. Tocar abre o
 * agendamento já preenchido para renovar — mesmo professor, dia da semana e horário, por 12 semanas.
 */
function AlunosParaAgendar({ lista }) {
  const [todos, setTodos] = useState(false);
  if (!lista || lista.length === 0) return null;
  const visiveis = todos ? lista : lista.slice(0, LIMITE_PARA_AGENDAR);
  return (
    <article className="card card-lista">
      <div className="card-lista-titulo">
        <h2>Alunos para agendar</h2>
        <span className="texto-suave">{lista.length}</span>
      </div>
      <ul className="lista">
        {visiveis.map((item) => (
          <li key={item.aluno.id}>
            <Link to={linkParaAgendar(item)} className="linha">
              <span className={`avatar${item.situacao === 'sem_aulas' ? ' avatar-atencao' : ''}`} aria-hidden="true">
                {iniciais(item.aluno.nome)}
              </span>
              <span className="linha-texto">
                <strong>{item.aluno.nome}</strong>
                <small>{situacaoParaAgendar(item)}</small>
              </span>
              <span className="linha-acao">{item.sugestao ? 'Renovar' : 'Agendar'}</span>
              <Icone nome="proximo" tamanho={18} className="linha-seta" />
            </Link>
          </li>
        ))}
      </ul>
      {lista.length > LIMITE_PARA_AGENDAR && (
        <div className="card-lista-rodape">
          <button type="button" className="botao-link" aria-expanded={todos} onClick={() => setTodos((atual) => !atual)}>
            {todos ? 'Mostrar menos' : `Ver todos (${lista.length})`}
          </button>
        </div>
      )}
    </article>
  );
}

/** Portal do responsável: cada dependente com a próxima aula, a reposição a escolher e as mensalidades. */
function Dependentes({ dados, creditos, onAbrirAula }) {
  if (!dados) {
    return (
      <div className="card">
        <Carregando linhas={4} />
      </div>
    );
  }
  if (dados.dependentes.length === 0) {
    return (
      <div className="card">
        <Vazio icone="alunos" titulo="Nenhum aluno vinculado ao seu acesso.">
          Peça à coordenação da escola para vincular seu acesso ao cadastro do aluno.
        </Vazio>
      </div>
    );
  }
  return dados.dependentes.map(({ aluno, proximaAula, mensalidades }) => {
    const repor = creditos.filter((credito) => credito.aula.alunoId === aluno.id && credito.permitido);
    return (
      <article key={aluno.id} className="card dependente">
        <header className="dependente-cabecalho">
          <span className="avatar" aria-hidden="true">
            {iniciais(aluno.nome)}
          </span>
          <span className="linha-texto">
            <h2>{aluno.nome}</h2>
            <small>{aluno.instrumento}</small>
          </span>
          <Link to={`/alunos/${aluno.id}`} className="botao-link">
            Histórico
          </Link>
        </header>
        <ul className="lista dependente-itens">
          <li>
            <span className="indicador-icone" aria-hidden="true">
              <Icone nome="agenda" tamanho={18} />
            </span>
            <span className="linha-texto">
              <small>Próxima aula</small>
              <strong>{proximaAula ? `${rotuloDiaRelativo(proximaAula.data)} às ${proximaAula.hora}` : 'Nenhuma aula agendada'}</strong>
            </span>
            {proximaAula && (
              <button type="button" className="botao botao-secundario" onClick={() => onAbrirAula(proximaAula.id)}>
                Avisar falta
              </button>
            )}
          </li>
          {repor.map((credito) => (
            <li key={credito.aula.id}>
              <span className="indicador-icone" aria-hidden="true">
                <Icone nome="reposicao" tamanho={18} />
              </span>
              <span className="linha-texto">
                <small>Reposição disponível</small>
                <strong>
                  Aula de {formatarData(credito.aula.data)} · escolha até {formatarData(credito.prazoAte)}
                </strong>
              </span>
              <button type="button" className="botao botao-primario" onClick={() => onAbrirAula(credito.aula.id)}>
                Escolher horário
              </button>
            </li>
          ))}
          <li className={mensalidades.atrasadas > 0 ? 'atencao' : undefined}>
            <span className="indicador-icone" aria-hidden="true">
              <Icone nome={mensalidades.atrasadas > 0 ? 'alerta' : 'mensalidades'} tamanho={18} />
            </span>
            <span className="linha-texto">
              <small>Mensalidades</small>
              <strong>
                {mensalidades.emAberto === 0
                  ? 'Em dia'
                  : `${plural(mensalidades.emAberto, 'em aberto', 'em aberto')} · ${formatarMoeda(mensalidades.valor)}${
                      mensalidades.atrasadas > 0 ? ` (${plural(mensalidades.atrasadas, 'atrasada', 'atrasadas')})` : ''
                    }`}
              </strong>
            </span>
            <Link to="/mensalidades" className="botao-link">
              Ver
            </Link>
          </li>
        </ul>
      </article>
    );
  });
}

/**
 * Início: o que importa no dia, por perfil. A escola (coordenação e professor) vê os números e as próximas aulas,
 * que abrem os detalhes ao toque; o responsável, um cartão por dependente.
 */
export default function DashboardPage() {
  const { usuario } = useAuth();
  const ehResponsavel = usuario?.papel === 'responsavel';
  const hoje = hojeISO();
  const [indicadores, setIndicadores] = useState(null);
  const [proximas, setProximas] = useState(null);
  const [creditos, setCreditos] = useState([]);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(0);
  const [aviso, setAviso] = useAviso();
  const [detalhe, abrirDetalhe, fecharDetalhe] = usePainel('detalhe');

  useEffect(() => {
    let ativo = true;
    async function carregar() {
      const dia = hojeISO();
      try {
        // O responsável vê a próxima aula no cartão de cada dependente: a lista de próximas aulas é da escola.
        const [dados, aulas, reposicoes] = await Promise.all([
          api.get('/indicadores'),
          ehResponsavel ? Promise.resolve([]) : api.get(`/aulas?inicio=${dia}&fim=${somarDias(dia, 6)}`),
          ehResponsavel ? api.get('/reposicoes/disponiveis') : Promise.resolve([]),
        ]);
        const agora = horaAtual();
        // Aula de hoje que já terminou não é "próxima"; a que está em andamento ainda aparece.
        const futuras = aulas
          .filter((aula) => aula.status === 'agendada')
          .filter((aula) => aula.data > dia || horaFim(aula.hora, aula.duracaoMin) > agora);
        if (!ativo) return;
        setIndicadores(dados);
        setProximas(futuras.slice(0, LIMITE_PROXIMAS));
        setCreditos(reposicoes);
        setErro('');
      } catch (e) {
        if (ativo) setErro(e.message);
      }
    }
    carregar();
    return () => {
      ativo = false;
    };
  }, [ehResponsavel, versao]);

  const recarregar = () => setVersao((atual) => atual + 1);

  return (
    <section>
      <CabecalhoPagina titulo={`Olá, ${usuario?.nome ?? ''}`} descricao={dataPorExtenso(hoje)} />

      {erro && (
        <p className="alerta" role="alert">
          {erro}
        </p>
      )}
      <Aviso>{aviso}</Aviso>

      {usuario?.papel === 'coordenacao' && indicadores?.alunosAtivos === 0 && (
        <article className="card card-lista primeiros-passos">
          <h2>Primeiros passos</h2>
          <ol className="lista">
            {PRIMEIROS_PASSOS.map((passo, indice) => (
              <li key={passo.para}>
                <Link to={passo.para} className="linha">
                  <span className="passo-numero" aria-hidden="true">
                    {indice + 1}
                  </span>
                  <span className="linha-texto">
                    <strong>{passo.titulo}</strong>
                    <small>{passo.detalhe}</small>
                  </span>
                  <Icone nome="proximo" tamanho={18} className="linha-seta" />
                </Link>
              </li>
            ))}
          </ol>
        </article>
      )}

      {ehResponsavel ? (
        !erro && <Dependentes dados={indicadores} creditos={creditos} onAbrirAula={abrirDetalhe} />
      ) : (
        <IndicadoresDaEscola papel={usuario?.papel} dados={indicadores} />
      )}

      {usuario?.papel === 'coordenacao' && indicadores?.alunosAtivos > 0 && (
        <AlunosParaAgendar lista={indicadores.alunosParaAgendar} />
      )}

      {!ehResponsavel && (
        <article className="card">
          <div className="card-cabecalho">
            <h2>Próximas aulas</h2>
            <Link to="/agenda" className="botao-link">
              Ver agenda
            </Link>
          </div>
          {!proximas ? (
            erro ? null : <Carregando />
          ) : proximas.length === 0 ? (
            <Vazio icone="agenda" titulo="Nenhuma aula agendada nos próximos 7 dias." />
          ) : (
            <ul className="lista">
              {proximas.map((aula) => {
                const nome = aula.aluno?.nome ?? 'Aluno não encontrado';
                return (
                  <li key={aula.id} className="proxima-aula">
                    <button
                      type="button"
                      className="linha-botao"
                      aria-label={`Aula de ${nome}, ${rotuloDiaRelativo(aula.data, hoje)} às ${aula.hora}: ver detalhes`}
                      onClick={() => abrirDetalhe(aula.id)}
                    >
                      <span className="avatar" aria-hidden="true">
                        {iniciais(nome)}
                      </span>
                      <span className="linha-texto">
                        <strong>{nome}</strong>
                        <small>
                          {rotuloDiaRelativo(aula.data, hoje)}
                          {aula.reposicao ? ' · Reposição' : ''}
                        </small>
                      </span>
                      <span className="linha-fim">{aula.hora}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </article>
      )}

      {detalhe !== null && /^\d+$/.test(detalhe) && (
        <AulaPainel
          key={detalhe}
          aulaId={Number(detalhe)}
          onFechar={fecharDetalhe}
          onConcluido={(mensagem) => {
            fecharDetalhe();
            recarregar();
            setAviso(mensagem);
          }}
          onAtualizada={(mensagem) => {
            recarregar();
            setAviso(mensagem);
          }}
        />
      )}
    </section>
  );
}
