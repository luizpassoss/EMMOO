import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { NOMES_DIAS } from '../utils/datas.js';
import { mapearErros } from '../utils/erros.js';
import { plural } from '../utils/format.js';
import Campo from './Campo.jsx';
import { Carregando, TituloDaSecao, Vazio } from './Estrutura.jsx';
import Icone from './Icone.jsx';

const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0]; // segunda a domingo
const FORM_VAZIO = { diaSemana: '1', horaInicio: '', duracaoMin: '45' };

/**
 * RF04 — horários em que o professor atende, agrupados por dia da semana.
 * Sem `professorId`, a API usa o professor logado; com ele, a coordenação edita a agenda daquele professor.
 */
export default function HorariosDisponiveis({ professorId, recolhivel = false }) {
  const [aberta, setAberta] = useState(!recolhivel); // recolhida no fim da agenda do professor: só o título e o total
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
      <TituloDaSecao
        titulo="Horários de atendimento"
        resumo={carregando ? null : horarios.length === 0 ? 'nenhum' : plural(horarios.length, 'horário', 'horários')}
        recolhivel={recolhivel}
        aberta={aberta}
        onAlternar={() => setAberta((atual) => !atual)}
      />
      {erro && (
        <p className="alerta" role="alert">
          {erro}
        </p>
      )}

      {aberta && (
        <>
          <div className="formulario-secao">
            {carregando ? (
              <Carregando linhas={2} />
            ) : grupos.length === 0 ? (
              <Vazio icone="relogio" titulo="Nenhum horário cadastrado." />
            ) : (
              <ul className="lista">
                {grupos.map(({ dia, itens }) => (
                  <li key={dia} className="lista-item">
                    <span className="horarios-dia">{NOMES_DIAS[dia]}</span>
                    <div className="chips">
                      {itens.map((horario) => (
                        <span key={horario.id} className="chip" title={`Aula de ${horario.duracaoMin} minutos`}>
                          {horario.horaInicio}
                          <button
                            type="button"
                            className="chip-remover"
                            aria-label={`Remover ${NOMES_DIAS[dia]} ${horario.horaInicio}`}
                            title="Remover"
                            onClick={() => remover(horario)}
                          >
                            <Icone nome="fechar" tamanho={14} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form className="formulario formulario-secao" onSubmit={adicionar} noValidate>
            {errosForm.geral && (
              <p className="alerta" role="alert">
                {errosForm.geral}
              </p>
            )}
            <div className="formulario-linha">
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
              <Campo rotulo="Duração (minutos)" erro={errosForm.duracaoMin}>
                <input name="duracaoMin" type="number" inputMode="numeric" min="15" max="240" value={form.duracaoMin} onChange={alterarCampo} />
              </Campo>
              <button type="submit" className="botao botao-secundario" disabled={salvando}>
                <Icone nome="mais" tamanho={18} />
                {salvando ? 'Adicionando…' : 'Adicionar horário'}
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
