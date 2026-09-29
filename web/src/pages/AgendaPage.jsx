import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../auth/AuthContext.jsx';
import FormAgendarAula from '../components/FormAgendarAula.jsx';
import HorariosDisponiveis from '../components/HorariosDisponiveis.jsx';
import { diasDaSemana, hojeISO, horaFim, inicioDaSemana, rotuloDia, rotuloSemana, somarDias } from '../utils/datas.js';
import { plural, rotuloStatusAula } from '../utils/format.js';

const DESCRICAO_POR_PAPEL = {
  coordenacao: 'Aulas de todos os professores. Agende alunos nos horários livres.',
  professor: 'Suas aulas da semana e seus horários de atendimento.',
  responsavel: 'Aulas dos seus dependentes.',
};

/** RF04–RF05 — agenda semanal. Cada papel vê só a sua parte (o filtro é feito pela API). */
export default function AgendaPage() {
  const { usuario } = useAuth();
  const ehCoordenacao = usuario?.papel === 'coordenacao';
  const ehProfessor = usuario?.papel === 'professor';
  const hoje = hojeISO();

  const [semana, setSemana] = useState(() => inicioDaSemana(hoje));
  const [professorFiltro, setProfessorFiltro] = useState('');
  const [aulas, setAulas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [versao, setVersao] = useState(0); // incrementar = recarregar a semana
  const [listas, setListas] = useState(null); // { alunos, professores } — só para a coordenação

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setErro('');
    const filtro = professorFiltro ? `&professorId=${professorFiltro}` : '';
    api
      .get(`/aulas?inicio=${semana}&fim=${somarDias(semana, 6)}${filtro}`)
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
    Promise.all([api.get('/alunos?status=ativo'), api.get('/usuarios?papel=professor')])
      .then(([alunos, professores]) => ativo && setListas({ alunos, professores }))
      .catch((e) => ativo && setErro(e.message));
    return () => {
      ativo = false;
    };
  }, [ehCoordenacao]);

  const aulasPorDia = new Map();
  for (const aula of aulas) aulasPorDia.set(aula.data, [...(aulasPorDia.get(aula.data) ?? []), aula]);
  // Domingo só aparece quando tem aula.
  const dias = diasDaSemana(semana).filter((dia, indice) => indice < 6 || aulasPorDia.has(dia));
  const agendadas = aulas.filter((aula) => aula.status === 'agendada').length;
  // Mesma regra da API: só aulas agendadas de hoje em diante podem ser canceladas.
  const podeCancelar = (aula) => (ehCoordenacao || ehProfessor) && aula.status === 'agendada' && aula.data >= hoje;

  async function cancelar(aula) {
    const quem = aula.aluno?.nome ?? 'aluno';
    if (!window.confirm(`Cancelar a aula de ${quem} em ${rotuloDia(aula.data)} às ${aula.hora}?`)) return;
    try {
      await api.patch(`/aulas/${aula.id}/cancelar`);
      setVersao((atual) => atual + 1);
    } catch (e) {
      setErro(e.message);
    }
  }

  function aoAgendar(primeiraData) {
    setSemana(inicioDaSemana(primeiraData));
    setVersao((atual) => atual + 1);
  }

  return (
    <section>
      <div className="cabecalho-pagina">
        <div>
          <h1 className="titulo">Agenda</h1>
          <p className="texto-suave">{DESCRICAO_POR_PAPEL[usuario?.papel]}</p>
        </div>
        <div className="navegacao-semana" role="group" aria-label="Navegar entre semanas">
          <button
            type="button"
            className="botao botao-secundario botao-icone"
            aria-label="Semana anterior"
            onClick={() => setSemana(somarDias(semana, -7))}
          >
            ‹
          </button>
          <strong aria-live="polite">{rotuloSemana(semana)}</strong>
          <button
            type="button"
            className="botao botao-secundario botao-icone"
            aria-label="Próxima semana"
            onClick={() => setSemana(somarDias(semana, 7))}
          >
            ›
          </button>
          {semana !== inicioDaSemana(hoje) && (
            <button type="button" className="botao botao-link" onClick={() => setSemana(inicioDaSemana(hoje))}>
              Hoje
            </button>
          )}
        </div>
      </div>

      {ehCoordenacao && listas && (
        <div className="filtros">
          <label className="campo campo-inline">
            <span>Professor(a)</span>
            <select value={professorFiltro} onChange={(e) => setProfessorFiltro(e.target.value)}>
              <option value="">Todos</option>
              {listas.professores.map((professor) => (
                <option key={professor.id} value={professor.id}>
                  {professor.nome}
                </option>
              ))}
            </select>
          </label>
          <span className="texto-suave">{plural(agendadas, 'aula agendada', 'aulas agendadas')} nesta semana</span>
        </div>
      )}

      {erro && (
        <p className="alerta" role="alert">
          {erro}
        </p>
      )}

      {carregando && aulas.length === 0 ? (
        <p className="texto-suave">Carregando…</p>
      ) : (
        <div className="semana" aria-busy={carregando}>
          {dias.map((dia) => {
            const doDia = aulasPorDia.get(dia) ?? [];
            return (
              <article
                key={dia}
                className={`card dia${dia === hoje ? ' dia-hoje' : ''}${doDia.length === 0 ? ' dia-sem-aulas' : ''}`}
              >
                <h2 className="dia-titulo">
                  {rotuloDia(dia)}
                  {dia === hoje && <span className="pill pill-hoje">Hoje</span>}
                </h2>
                {doDia.length === 0 ? (
                  <p className="texto-suave dia-vazio">Sem aulas</p>
                ) : (
                  <ul className="lista">
                    {doDia.map((aula) => (
                      <li key={aula.id} className={`lista-item aula aula-${aula.status}`}>
                        <span className="aula-hora">
                          {aula.hora}
                          <small>{horaFim(aula.hora, aula.duracaoMin)}</small>
                        </span>
                        <div className="lista-texto">
                          <strong>{aula.aluno?.nome ?? 'Aluno não encontrado'}</strong>
                          <small>
                            {[aula.aluno?.instrumento, !ehProfessor && aula.professor && `Prof. ${aula.professor.nome}`]
                              .filter(Boolean)
                              .join(' · ')}
                          </small>
                        </div>
                        <span className={`pill pill-${aula.status}`}>{rotuloStatusAula(aula.status)}</span>
                        {podeCancelar(aula) && (
                          <div className="acoes">
                            <button type="button" className="botao botao-link" onClick={() => cancelar(aula)}>
                              Cancelar
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}

      {ehCoordenacao && listas && (
        <FormAgendarAula alunos={listas.alunos} professores={listas.professores} onAgendado={aoAgendar} />
      )}
      {ehCoordenacao && professorFiltro && <HorariosDisponiveis key={professorFiltro} professorId={Number(professorFiltro)} />}
      {ehProfessor && <HorariosDisponiveis />}
    </section>
  );
}
