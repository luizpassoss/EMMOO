import { calcularHorariosLivres, horariosSeSobrepoem, PERIODO_MAXIMO_DIAS } from '../../domain/agenda.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { assertValid, parseId, parseIdOpcional, validarPeriodo } from '../../shared/validation.js';
import { NOMES_DIAS, validarHorario } from './horario.validator.js';

/** Casos de uso dos horários disponíveis do professor (RF04) e das vagas livres (RF05). */
export function createHorarioService({ horarios, aulas, usuarios }) {
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

    async remover(id, usuario) {
      const horario = await horarios.findById(parseId(id));
      if (!horario) throw new NotFoundError('Horário não encontrado.');
      if (usuario.papel === 'professor' && horario.professorId !== usuario.id) {
        throw new ForbiddenError('Professores só podem gerenciar a própria agenda.');
      }
      await horarios.remove(horario.id);
    },

    /** RF05 — vagas do professor no período que ainda não têm aula marcada. */
    async livres(query = {}, usuario) {
      const periodo = validarPeriodo(query, PERIODO_MAXIMO_DIAS);
      const professorId = await professorAlvo(parseIdOpcional(query.professorId, 'professorId'), usuario, {
        obrigatorio: true,
      });
      const [lista, aulasDoPeriodo] = await Promise.all([
        horarios.list({ professorId }),
        aulas.list({ ...periodo, professorId }),
      ]);
      return calcularHorariosLivres({ horarios: lista, aulas: aulasDoPeriodo, ...periodo });
    },
  };
}
