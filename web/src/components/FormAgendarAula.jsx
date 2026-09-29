import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { hojeISO, rotuloDia } from '../utils/datas.js';
import { mapearErros } from '../utils/erros.js';
import { plural } from '../utils/format.js';
import Campo from './Campo.jsx';

/**
 * RF05 — agendamento de aula (ou série semanal) pela coordenação.
 * Ao escolher professor e data, sugere os horários livres daquele dia.
 */
export default function FormAgendarAula({ alunos, professores, onAgendado }) {
  const [form, setForm] = useState(() => ({
    alunoId: '',
    professorId: professores.length === 1 ? String(professores[0].id) : '',
    data: '',
    hora: '',
    semanas: '1',
  }));
  const [livres, setLivres] = useState(null); // null = ainda não há professor e data para consultar
  const [versao, setVersao] = useState(0); // força nova consulta de vagas após agendar
  const [errosForm, setErrosForm] = useState({});
  const [aviso, setAviso] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!form.professorId || !form.data) {
      setLivres(null);
      return undefined;
    }
    let ativo = true;
    api
      .get(`/horarios/livres?professorId=${form.professorId}&inicio=${form.data}&fim=${form.data}`)
      .then((lista) => ativo && setLivres(lista))
      .catch(() => ativo && setLivres(null));
    return () => {
      ativo = false;
    };
  }, [form.professorId, form.data, versao]);

  function alterarCampo(evento) {
    const { name, value } = evento.target;
    setForm((atual) => ({ ...atual, [name]: value }));
  }

  async function agendar(evento) {
    evento.preventDefault();
    setSalvando(true);
    setErrosForm({});
    setAviso('');
    try {
      const criadas = await api.post('/aulas', {
        ...form,
        alunoId: Number(form.alunoId),
        professorId: Number(form.professorId),
        semanas: Number(form.semanas),
      });
      setAviso(`${plural(criadas.length, 'aula agendada', 'aulas agendadas')}.`);
      setForm((atual) => ({ ...atual, alunoId: '', hora: '' }));
      setVersao((atual) => atual + 1);
      onAgendado?.(criadas[0].data);
    } catch (e) {
      setErrosForm(mapearErros(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form className="card formulario" onSubmit={agendar} noValidate>
      <h2>Agendar aula</h2>
      {errosForm.geral && (
        <p className="alerta" role="alert">
          {errosForm.geral}
        </p>
      )}
      {aviso && (
        <p className="aviso" role="status">
          {aviso}
        </p>
      )}
      <div className="grade">
        <Campo rotulo="Aluno" erro={errosForm.alunoId}>
          <select name="alunoId" value={form.alunoId} onChange={alterarCampo}>
            <option value="">Selecione…</option>
            {alunos.map((aluno) => (
              <option key={aluno.id} value={aluno.id}>
                {aluno.nome} ({aluno.instrumento})
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Professor(a)" erro={errosForm.professorId}>
          <select name="professorId" value={form.professorId} onChange={alterarCampo}>
            <option value="">Selecione…</option>
            {professores.map((professor) => (
              <option key={professor.id} value={professor.id}>
                {professor.nome}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <div className="grade">
        <Campo rotulo="Data" erro={errosForm.data}>
          <input name="data" type="date" min={hojeISO()} value={form.data} onChange={alterarCampo} />
        </Campo>
        <Campo rotulo="Hora" erro={errosForm.hora}>
          <input name="hora" type="time" value={form.hora} onChange={alterarCampo} />
        </Campo>
        <Campo rotulo="Repetir por (semanas)" erro={errosForm.semanas}>
          <input name="semanas" type="number" min="1" max="26" value={form.semanas} onChange={alterarCampo} />
        </Campo>
      </div>

      {livres && (
        <div className="vagas">
          <span className="texto-suave">Horários livres — {rotuloDia(form.data)}:</span>
          {livres.length === 0 ? (
            <span>nenhum neste dia.</span>
          ) : (
            <div className="chips">
              {livres.map((vaga) => (
                <button
                  key={vaga.hora}
                  type="button"
                  className={`chip chip-botao${form.hora === vaga.hora ? ' ativo' : ''}`}
                  aria-pressed={form.hora === vaga.hora}
                  onClick={() => setForm((atual) => ({ ...atual, hora: vaga.hora }))}
                >
                  {vaga.hora}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <button type="submit" className="botao botao-primario" disabled={salvando}>
        {salvando ? 'Agendando…' : 'Agendar'}
      </button>
    </form>
  );
}
