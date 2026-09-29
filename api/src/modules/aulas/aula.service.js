import { encontrarAulaEmConflito, gerarDatasSemanais, PERIODO_MAXIMO_DIAS } from '../../domain/agenda.js';
import { formatarDataBR, hojeISO } from '../../shared/datas.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { assertValid, parseId, parseIdOpcional, validarPeriodo } from '../../shared/validation.js';
import { DURACAO_PADRAO_MIN } from '../planos/plano.validator.js';
import { validarAgendamento } from './aula.validator.js';

function descreverConflito(nova, existente, quem) {
  return `${formatarDataBR(nova.data)} às ${nova.hora}: ${quem} já tem aula das ${existente.hora} (${existente.duracaoMin} min).`;
}

/** Casos de uso da agenda de aulas: consulta por papel, agendamento (RF05, RN08–RN10) e cancelamento. */
export function createAulaService({ aulas, alunos, planos, usuarios, hoje = hojeISO }) {
  /** Acrescenta nome do aluno e do professor, para a agenda não precisar de outras consultas. */
  async function enriquecer(lista) {
    if (lista.length === 0) return [];
    const [todosAlunos, professores] = await Promise.all([alunos.list(), usuarios.list({ papel: 'professor' })]);
    const alunoPorId = new Map(todosAlunos.map((aluno) => [aluno.id, aluno]));
    const professorPorId = new Map(professores.map((professor) => [professor.id, professor]));
    return lista.map((aula) => {
      const aluno = alunoPorId.get(aula.alunoId);
      const professor = professorPorId.get(aula.professorId);
      return {
        ...aula,
        aluno: aluno ? { id: aluno.id, nome: aluno.nome, instrumento: aluno.instrumento } : null,
        professor: professor ? { id: professor.id, nome: professor.nome } : null,
      };
    });
  }

  /** Cada papel enxerga só a sua parte da agenda (RN01–RN03). */
  async function filtroPorPapel(query, usuario) {
    if (usuario.papel === 'professor') return { professorId: usuario.id };
    if (usuario.papel === 'responsavel') {
      const dependentes = await alunos.list({ usuarioRespId: usuario.id });
      return { alunoIds: dependentes.map((aluno) => aluno.id) };
    }
    return {
      professorId: parseIdOpcional(query.professorId, 'professorId'),
      alunoId: parseIdOpcional(query.alunoId, 'alunoId'),
    };
  }

  async function garantirReferencias({ alunoId, professorId }) {
    const [aluno, professor] = await Promise.all([alunos.findById(alunoId), usuarios.findById(professorId)]);
    const erros = [];
    if (!aluno) erros.push({ campo: 'alunoId', mensagem: 'Aluno não encontrado.' });
    else if (aluno.status !== 'ativo') erros.push({ campo: 'alunoId', mensagem: 'Aluno inativo não pode ter aulas agendadas.' }); // RN08
    if (!professor || professor.papel !== 'professor') erros.push({ campo: 'professorId', mensagem: 'Professor não encontrado.' });
    if (erros.length > 0) throw new ValidationError(erros);
    return aluno;
  }

  return {
    async listar(query = {}, usuario) {
      const periodo = validarPeriodo(query, PERIODO_MAXIMO_DIAS);
      return enriquecer(await aulas.list({ ...periodo, ...(await filtroPorPapel(query, usuario)) }));
    },

    /** Agenda a aula (ou uma série semanal). Se qualquer data conflitar, nenhuma aula é criada. */
    async agendar(input) {
      const { erros, dados } = validarAgendamento(input);
      assertValid(erros);
      if (dados.data < hoje()) {
        throw new ValidationError([{ campo: 'data', mensagem: 'Escolha uma data a partir de hoje.' }]);
      }
      const aluno = await garantirReferencias(dados);
      const plano = await planos.findById(aluno.planoId);
      const duracaoMin = dados.duracaoMin ?? plano?.duracaoMin ?? DURACAO_PADRAO_MIN;

      const datas = gerarDatasSemanais(dados.data, dados.semanas);
      const periodo = { inicio: datas[0], fim: datas.at(-1) };
      const [doProfessor, doAluno] = await Promise.all([
        aulas.list({ ...periodo, professorId: dados.professorId }),
        aulas.list({ ...periodo, alunoId: dados.alunoId }),
      ]);

      const novas = datas.map((data) => ({
        alunoId: dados.alunoId,
        professorId: dados.professorId,
        data,
        hora: dados.hora,
        duracaoMin,
        status: 'agendada',
      }));
      const conflitos = novas.flatMap((nova) => {
        const doProf = encontrarAulaEmConflito(nova, doProfessor); // RN09
        if (doProf) return [descreverConflito(nova, doProf, 'o professor')];
        const doAl = encontrarAulaEmConflito(nova, doAluno); // RN10
        return doAl ? [descreverConflito(nova, doAl, 'o aluno')] : [];
      });
      if (conflitos.length > 0) {
        const restantes = conflitos.length - 1;
        const outras =
          restantes === 0 ? '' : restantes === 1 ? ' Outra data também conflita.' : ` Outras ${restantes} datas também conflitam.`;
        throw new ConflictError('Conflito de agenda.', [{ campo: 'hora', mensagem: `${conflitos[0]}${outras}` }]);
      }
      return enriquecer(await aulas.createMany(novas));
    },

    async cancelar(id, usuario) {
      const aula = await aulas.findById(parseId(id));
      if (!aula) throw new NotFoundError('Aula não encontrada.');
      if (usuario.papel === 'professor' && aula.professorId !== usuario.id) {
        throw new ForbiddenError('Professores só podem cancelar as próprias aulas.');
      }
      if (aula.status !== 'agendada') throw new ConflictError('Apenas aulas agendadas podem ser canceladas.');
      // Aula de dia anterior não se cancela: ela será registrada como realizada ou falta (RF08).
      if (aula.data < hoje()) throw new ConflictError('Aulas de dias anteriores não podem ser canceladas.');
      const [cancelada] = await enriquecer([await aulas.update(aula.id, { status: 'cancelada' })]);
      return cancelada;
    },
  };
}
