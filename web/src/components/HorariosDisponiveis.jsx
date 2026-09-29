import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { NOMES_DIAS } from '../utils/datas.js';
import { mapearErros } from '../utils/erros.js';
import Campo from './Campo.jsx';

const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0]; // segunda a domingo
const FORM_VAZIO = { diaSemana: '1', horaInicio: '', duracaoMin: '45' };

/**
 * RF04 — horários em que o professor atende, agrupados por dia da semana.
 * Sem `professorId`, a API usa o professor logado; com ele, a coordenação edita a agenda daquele professor.
 */
export default function HorariosDisponiveis({ professorId }) {
  const [horarios, setHorarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [form, setForm] = useState(FORM_VAZIO);
  const [errosForm, setErrosForm] = useState({});
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      setHorarios(await api.get(`/horarios${professorId ? `?professorId=${professorId}` : ''}`));
    } catch (e) {
      setErro(e.message);
    } finally {
      setCarregando(false);
    }
  }, [professorId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const grupos = ORDEM_DIAS.map((dia) => ({ dia, itens: horarios.filter((h) => h.diaSemana === dia) })).filter(
    (grupo) => grupo.itens.length > 0,
  );

  function alterarCampo(evento) {
    const { name, value } = evento.target;
    setForm((atual) => ({ ...atual, [name]: value }));
  }

  async function adicionar(evento) {
    evento.preventDefault();
    setSalvando(true);
    setErrosForm({});
    try {
      await api.post('/horarios', {
        ...form,
        diaSemana: Number(form.diaSemana),
        duracaoMin: Number(form.duracaoMin),
        ...(professorId && { professorId }),
      });
      setForm((atual) => ({ ...atual, horaInicio: '' }));
      await carregar();
    } catch (e) {
      setErrosForm(mapearErros(e));
    } finally {
      setSalvando(false);
    }
  }

  async function remover(horario) {
    setErro('');
    try {
      await api.delete(`/horarios/${horario.id}`);
      await carregar();
    } catch (e) {
      setErro(e.message);
    }
  }

  return (
    <section className="card">
      <h2>Horários de atendimento</h2>
      <p className="texto-suave">Dias e horas com vaga para aula. As vagas livres aparecem ao agendar alunos.</p>
      {erro && (
        <p className="alerta" role="alert">
          {erro}
        </p>
      )}

      {carregando ? (
        <p className="texto-suave">Carregando…</p>
      ) : grupos.length === 0 ? (
        <p className="texto-suave">Nenhum horário cadastrado.</p>
      ) : (
        <ul className="lista">
          {grupos.map(({ dia, itens }) => (
            <li key={dia} className="lista-item">
              <strong className="horarios-dia">{NOMES_DIAS[dia]}</strong>
              <div className="chips">
                {itens.map((horario) => (
                  <span key={horario.id} className="chip">
                    {horario.horaInicio}
                    <small>{horario.duracaoMin} min</small>
                    <button
                      type="button"
                      className="chip-remover"
                      aria-label={`Remover ${NOMES_DIAS[dia]} ${horario.horaInicio}`}
                      onClick={() => remover(horario)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form className="formulario formulario-secao" onSubmit={adicionar} noValidate>
        {errosForm.geral && (
          <p className="alerta" role="alert">
            {errosForm.geral}
          </p>
        )}
        <div className="grade">
          <Campo rotulo="Dia da semana" erro={errosForm.diaSemana}>
            <select name="diaSemana" value={form.diaSemana} onChange={alterarCampo}>
              {ORDEM_DIAS.map((dia) => (
                <option key={dia} value={dia}>
                  {NOMES_DIAS[dia]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Início" erro={errosForm.horaInicio}>
            <input name="horaInicio" type="time" value={form.horaInicio} onChange={alterarCampo} />
          </Campo>
          <Campo rotulo="Duração (min)" erro={errosForm.duracaoMin}>
            <input name="duracaoMin" type="number" min="15" max="240" value={form.duracaoMin} onChange={alterarCampo} />
          </Campo>
        </div>
        <button type="submit" className="botao botao-secundario" disabled={salvando}>
          {salvando ? 'Adicionando…' : 'Adicionar horário'}
        </button>
      </form>
    </section>
  );
}
