import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/index.js';
import { hojeISO, rotuloDia } from '../utils/datas.js';
import { mapearErros } from '../utils/erros.js';
import { foiAlterado, plural } from '../utils/format.js';
import Campo from './Campo.jsx';
import { Aviso, Painel, useAviso } from './Estrutura.jsx';

/** Só aceita do link o que existe nas listas (aluno ativo, professor com acesso) e está no formato certo. */
function preenchimentoValido({ alunoId, professorId, hora, semanas } = {}, alunos, professores) {
  const numero = Number(semanas);
  return {
    alunoId: alunos.some((aluno) => String(aluno.id) === alunoId) ? alunoId : '',
    professorId: professores.some((professor) => String(professor.id) === professorId) ? professorId : '',
    hora: /^([01]\d|2[0-3]):[0-5]\d$/.test(hora ?? '') ? hora : '',
    semanas: Number.isInteger(numero) && numero >= 1 && numero <= 26 ? String(numero) : '',
  };
}

/**
 * RF05 — agendamento de aula (ou série semanal) pela coordenação.
 * Ao escolher professor e data, sugere os horários livres daquele dia.
 * `preenchimento` (aluno, professor, horário e semanas) vem do atalho "Alunos para agendar" do Início: renovar a
 * série com o mesmo professor e horário fica a um toque.
 */
export default function FormAgendarAula({
  alunos,
  professores: todosProfessores,
  planos = [],
  dataInicial = '',
  preenchimento,
  onAgendado,
  onFechar,
}) {
  // Professor com acesso desativado não recebe aula nova (a API também recusa).
  const professores = todosProfessores.filter((professor) => professor.ativo !== false);
  // `dataInicial`: o dia tocado na agenda ("Agendar" num dia sem aula) já vem preenchido.
  const [inicial, setInicial] = useState(() => {
    const doLink = preenchimentoValido(preenchimento, alunos, professores);
    return {
      alunoId: doLink.alunoId,
      professorId: doLink.professorId || (professores.length === 1 ? String(professores[0].id) : ''),
      data: dataInicial,
      hora: doLink.hora,
      semanas: doLink.semanas || '1',
    };
  });
  const [form, setForm] = useState(inicial);
  const [livres, setLivres] = useState(null); // null = ainda não há professor e data para consultar
  const [semHorarios, setSemHorarios] = useState(false); // o professor escolhido ainda não tem horários de atendimento
  const [versao, setVersao] = useState(0); // força nova consulta de vagas após agendar
  const [errosForm, setErrosForm] = useState({});
  const [aviso, setAviso] = useAviso();
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

  // Sem horários de atendimento, não há o que sugerir: o formulário diz isso e onde configurar.
  useEffect(() => {
    setSemHorarios(false);
    if (!form.professorId) return undefined;
    let ativo = true;
    api
      .get(`/horarios?professorId=${form.professorId}`)
      .then((lista) => ativo && setSemHorarios(lista.length === 0))
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [form.professorId]);

  function alterarCampo(evento) {
    const { name, value } = evento.target;
    setForm((atual) => ({ ...atual, [name]: value }));
  }

  // Plano do aluno escolhido: lembra a frequência (num plano 2x, são dois horários por semana).
  const alunoEscolhido = alunos.find((aluno) => String(aluno.id) === form.alunoId);
  const planoDoAluno = alunoEscolhido && planos.find((plano) => plano.id === alunoEscolhido.planoId);

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
      // A série não agenda em feriados e recessos: o aviso conta as datas que ficaram de fora.
      const foraDaSerie = Number(form.semanas) - criadas.length;
      const detalhe =
        foraDaSerie > 0
          ? ` ${plural(foraDaSerie, 'data não foi agendada', 'datas não foram agendadas')} por coincidir com feriado ou recesso.`
          : '';
      setAviso(`${plural(criadas.length, 'aula agendada', 'aulas agendadas')}.${detalhe}`);
      // Pronto para o próximo agendamento: o que ficou no formulário não conta como alteração pendente.
      const proximo = { ...form, alunoId: '', hora: '' };
      setForm(proximo);
      setInicial(proximo);
      setVersao((atual) => atual + 1);
      onAgendado?.(criadas[0].data);
    } catch (e) {
      setErrosForm(mapearErros(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Painel
      titulo="Agendar aula"
      onFechar={onFechar}
      onSubmit={agendar}
      erros={errosForm}
      // Só aluno e horário contam como trabalho a perder: escolher uma data para ver as vagas é consulta.
      alterado={foiAlterado({ alunoId: form.alunoId, hora: form.hora }, { alunoId: inicial.alunoId, hora: inicial.hora })}
      acao={
        <button type="submit" className="botao botao-primario" disabled={salvando}>
          {salvando ? 'Agendando…' : 'Agendar'}
        </button>
      }
    >
      {errosForm.geral && (
        <p className="alerta" role="alert">
          {errosForm.geral}
        </p>
      )}
      <Aviso>{aviso}</Aviso>
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
      {/* Só quando muda o jeito de agendar: com mais de uma aula por semana, cada dia é um agendamento. */}
      {planoDoAluno?.freqSemanal > 1 && (
        <p className="informacao">
          {alunoEscolhido.nome} tem {planoDoAluno.freqSemanal} aulas por semana: agende um horário para cada uma.
        </p>
      )}
      <div className="grade grade-3">
        <Campo rotulo="Data" erro={errosForm.data}>
          <input name="data" type="date" min={hojeISO()} value={form.data} onChange={alterarCampo} />
        </Campo>
        <Campo rotulo="Horário" erro={errosForm.hora}>
          <input name="hora" type="time" value={form.hora} onChange={alterarCampo} />
        </Campo>
        <Campo rotulo="Semanas seguidas" erro={errosForm.semanas}>
          <input name="semanas" type="number" inputMode="numeric" min="1" max="26" value={form.semanas} onChange={alterarCampo} />
        </Campo>
      </div>

      {semHorarios && (
        <p className="informacao">
          <span>
            {professores.find((professor) => String(professor.id) === form.professorId)?.nome ?? 'Este professor'} ainda não
            tem horários de atendimento, então não há horários sugeridos (dá para digitar o horário).{' '}
            <Link to={`/usuarios?usuario=${form.professorId}`} className="botao-link">
              Definir os horários
            </Link>
          </span>
        </p>
      )}

      {livres && !semHorarios && (
        <div className="vagas">
          <strong>Horários disponíveis em {rotuloDia(form.data)}</strong>
          {livres.length === 0 ? (
            <span>Nenhum horário disponível neste dia.</span>
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
    </Painel>
  );
}
