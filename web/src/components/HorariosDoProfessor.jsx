import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/index.js';
import { horaFim, NOMES_DIAS } from '../utils/datas.js';
import { mapearErros } from '../utils/erros.js';
import { plural } from '../utils/format.js';
import { Carregando } from './Estrutura.jsx';
import GradeDeHorarios, { errosDaGrade, GRADE_PADRAO, gradeParaApi } from './GradeDeHorarios.jsx';

const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];

/** { dias: "Seg, Ter e Qua", detalhe: "das 14:00 às 17:45 · 15 horários por semana" }. */
function resumir(horarios) {
  const dias = ORDEM_DIAS.filter((dia) => horarios.some((horario) => horario.diaSemana === dia)).map((dia) =>
    NOMES_DIAS[dia].slice(0, 3),
  );
  const inicio = horarios.map((horario) => horario.horaInicio).sort()[0];
  const fim = horarios.map((horario) => horaFim(horario.horaInicio, horario.duracaoMin)).sort().at(-1);
  return {
    dias: dias.length <= 1 ? dias.join('') : `${dias.slice(0, -1).join(', ')} e ${dias.at(-1)}`,
    detalhe: `das ${inicio} às ${fim} · ${plural(horarios.length, 'horário', 'horários')} por semana`,
  };
}

/**
 * RF04 — horários de atendimento de um professor, na edição do acesso dele: o resumo do que existe e a grade
 * para gerar mais de uma vez (sem duplicar o que já existe). Ajustes horário a horário ficam na Agenda.
 */
export default function HorariosDoProfessor({ professor, onAviso }) {
  const [horarios, setHorarios] = useState(null);
  const [erro, setErro] = useState('');
  const [aberta, setAberta] = useState(false);
  const [grade, setGrade] = useState(GRADE_PADRAO);
  const [erros, setErros] = useState({});
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    try {
      setHorarios(await api.get(`/horarios?professorId=${professor.id}`));
      setErro('');
    } catch (e) {
      setErro(e.message);
    }
  }, [professor.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function adicionar() {
    setSalvando(true);
    setErros({});
    try {
      const { criados, ignorados } = await api.post('/horarios/grade', { professorId: professor.id, ...gradeParaApi(grade) });
      await carregar();
      setAberta(false);
      setGrade(GRADE_PADRAO);
      const jaExistiam = ignorados > 0 ? ` ${plural(ignorados, 'já existia', 'já existiam')}.` : '';
      onAviso?.(
        criados > 0
          ? `${plural(criados, 'horário de atendimento adicionado', 'horários de atendimento adicionados')} para ${professor.nome}.${jaExistiam}`
          : `${professor.nome} já tinha todos esses horários.`,
      );
    } catch (e) {
      const mapeados = mapearErros(e);
      setErros(Object.keys(errosDaGrade(mapeados)).length ? errosDaGrade(mapeados) : mapeados);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <section className="bloco horarios-professor" aria-label="Horários de atendimento">
      <h3>Horários de atendimento</h3>
      {erro && (
        <p className="alerta" role="alert">
          {erro}
        </p>
      )}
      {!horarios ? (
        !erro && <Carregando linhas={1} />
      ) : horarios.length === 0 ? (
        <p className="informacao">
          {professor.nome} ainda não tem horários de atendimento.
        </p>
      ) : (
        <p className="resumo-horarios">
          <strong>{resumir(horarios).dias}</strong>
          <small>{resumir(horarios).detalhe}</small>
        </p>
      )}

      {aberta ? (
        <>
          <GradeDeHorarios valor={grade} onChange={setGrade} erros={erros} />
          {erros.geral && (
            <p className="alerta" role="alert">
              {erros.geral}
            </p>
          )}
          <div className="botoes">
            <button type="button" className="botao botao-secundario" disabled={salvando} onClick={adicionar}>
              {salvando ? 'Adicionando…' : 'Adicionar estes horários'}
            </button>
            <button type="button" className="botao botao-fantasma" onClick={() => setAberta(false)}>
              Agora não
            </button>
          </div>
        </>
      ) : (
        horarios && (
          <div className="botoes">
            <button type="button" className="botao botao-secundario botao-compacto" onClick={() => setAberta(true)}>
              {horarios.length === 0 ? 'Definir horários de atendimento' : 'Adicionar mais horários'}
            </button>
            {horarios.length > 0 && (
              <Link to={`/agenda?professor=${professor.id}`} className="botao botao-secundario botao-compacto">
                Ajustar na Agenda
              </Link>
            )}
          </div>
        )
      )}
    </section>
  );
}
