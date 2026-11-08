import {
  calcularHorariosLivres,
  feriadoNaData,
  horariosSeSobrepoem,
  jaComecou,
  PERIODO_MAXIMO_DIAS,
} from '../../domain/agenda.js';
import { horaAtual, hojeISO } from '../../shared/datas.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { assertValid, parseId, parseIdOpcional, validarPeriodo } from '../../shared/validation.js';
import { NOMES_DIAS, validarGrade, validarHorario } from './horario.validator.js';

/**
 * Cria os horários de uma grade para o professor, pulando os que se sobrepõem a um horário que ele já tem
 * (assim, aplicar a grade de novo ou completar uma agenda existente não duplica nada).
 * @returns {Promise<{ criados: number, ignorados: number }>}
 */
export function criarAplicadorDeGrade(horarios) {
  return async function aplicarGrade(professorId, lista) {
    const existentes = await horarios.list({ professorId });
    let criados = 0;
    for (const horario of lista) {
      if (existentes.some((outro) => horariosSeSobrepoem(horario, outro))) continue;
      existentes.push(await horarios.create({ ...horario, professorId, disponivel: true }));
      criados += 1;
    }
    return { criados, ignorados: lista.length - criados };
  };
}

/**
 * RF05 — vagas do professor num período: horários de atendimento sem aula marcada, que ainda não passaram
 * e fora de feriados e recessos. Usada nas vagas da agenda e na escolha do horário da reposição (RF07).
 */
export function criarConsultaDeVagas({ horarios, aulas, feriados, hoje = hojeISO, agora = horaAtual }) {
  return async function vagasLivres(professorId, periodo) {
    const [lista, aulasDoPeriodo, feriadosDoPeriodo] = await Promise.all([
      horarios.list({ professorId }),
      aulas.list({ ...periodo, professorId }),
      feriados.list(periodo),
    ]);
    const quando = { hoje: hoje(), agora: agora() };
    // Vaga que já passou (dia anterior ou hora de hoje que já foi) ou em dia sem aula não dá para agendar.
    return calcularHorariosLivres({ horarios: lista, aulas: aulasDoPeriodo, ...periodo }).filter(
      (vaga) => !jaComecou(vaga, quando) && !feriadoNaData(vaga.data, feriadosDoPeriodo),
    );
  };
}

/** Casos de uso dos horários disponíveis do professor (RF04) e das vagas livres (RF05). */
export function createHorarioService({ horarios, aulas, usuarios, feriados, alunos, hoje = hojeISO, agora = horaAtual }) {
  const vagasLivres = criarConsultaDeVagas({ horarios, aulas, feriados, hoje, agora });
  const aplicarGrade = criarAplicadorDeGrade(horarios);

  /** RF05 com RN03 — o responsável vê as vagas só dos professores que dão aula aos seus dependentes. */
  async function professorDosDependentes(professorId, usuario) {
    if (professorId === undefined) throw new ValidationError([{ campo: 'professorId', mensagem: 'Selecione o professor.' }]);
    const dependentes = await alunos.list({ usuarioRespId: usuario.id });
    const aulasDosDependentes = dependentes.length ? await aulas.list({ alunoIds: dependentes.map((aluno) => aluno.id) }) : [];
    if (!aulasDosDependentes.some((aula) => aula.professorId === professorId)) {
      throw new ForbiddenError('Você só pode ver os horários dos professores dos seus dependentes.');
    }
    return professorId;
  }
  /**
   * Professor só atua na própria agenda; a coordenação escolhe o professor.
   * @returns {Promise<number | undefined>}
   */
  async function professorAlvo(professorId, usuario, { obrigatorio }) {
    if (usuario.papel === 'professor') {
      if (professorId !== undefined && professorId !== usuario.id) {
        throw new ForbiddenError('Professores só podem gerenciar a própria agenda.');
      }
      return usuario.id;
    }
    if (professorId === undefined) {
      if (obrigatorio) throw new ValidationError([{ campo: 'professorId', mensagem: 'Selecione o professor.' }]);
      return undefined;
    }
    const professor = await usuarios.findById(professorId);
    if (!professor || professor.papel !== 'professor') {
      throw new ValidationError([{ campo: 'professorId', mensagem: 'Professor não encontrado.' }]);
    }
    return professor.id;
  }

  return {
    async listar(query = {}, usuario) {
      const professorId = await professorAlvo(parseIdOpcional(query.professorId, 'professorId'), usuario, {
        obrigatorio: false,
      });
      return horarios.list({ professorId });
    },

    async criar(input, usuario) {
      const { erros, dados } = validarHorario(input);
      assertValid(erros);
      const professorId = await professorAlvo(dados.professorId, usuario, { obrigatorio: true });
      const novo = { ...dados, professorId, disponivel: true };

      const conflito = (await horarios.list({ professorId })).find((horario) => horariosSeSobrepoem(novo, horario));
      if (conflito) {
        throw new ConflictError('O horário se sobrepõe a outro já cadastrado.', [
          {
            campo: 'horaInicio',
            mensagem: `Sobrepõe o horário de ${NOMES_DIAS[conflito.diaSemana]} às ${conflito.horaInicio} (${conflito.duracaoMin} min).`,
          },
        ]);
      }
      return horarios.create(novo);
    },

    /**
     * RF04 — grade de atendimento de uma vez (ex.: segunda a sexta, das 14:00 às 18:00, aulas de 45 min):
     * cria os horários que ainda não existem e conta os que já estavam ocupados.
     */
    async criarGrade(input = {}, usuario) {
      const { erros, dados } = validarGrade(input);
      assertValid(erros);
      const professorId = await professorAlvo(parseIdOpcional(input.professorId, 'professorId'), usuario, { obrigatorio: true });
      const resultado = await aplicarGrade(professorId, dados.horarios);
      return { ...resultado, horarios: await horarios.list({ professorId }) };
    },

    async remover(id, usuario) {
      const horario = await horarios.findById(parseId(id));
      if (!horario) throw new NotFoundError('Horário não encontrado.');
      if (usuario.papel === 'professor' && horario.professorId !== usuario.id) {
        throw new ForbiddenError('Professores só podem gerenciar a própria agenda.');
      }
      await horarios.remove(horario.id);
    },

    /** RF05 — vagas do professor no período sem aula marcada, que ainda não passaram e fora de feriados. */
    async livres(query = {}, usuario) {
      const periodo = validarPeriodo(query, PERIODO_MAXIMO_DIAS);
      const pedido = parseIdOpcional(query.professorId, 'professorId');
      const professorId =
        usuario.papel === 'responsavel'
          ? await professorDosDependentes(pedido, usuario)
          : await professorAlvo(pedido, usuario, { obrigatorio: true });
      return vagasLivres(professorId, periodo);
    },
  };
}
