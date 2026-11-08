import { feriadoNaData, jaComecou, separarRestauraveis } from '../../domain/agenda.js';
import { horaAtual, hojeISO } from '../../shared/datas.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { assertValid, parseId } from '../../shared/validation.js';
import { STATUS_ALUNO, validarAluno } from './aluno.validator.js';

export const MOTIVO_CANCELAMENTO_INATIVACAO = 'Aluno inativado.';

/** Casos de uso de alunos (RF02) e regra RN08 (aluno inativo). */
export function createAlunoService({
  alunos,
  planos,
  usuarios,
  aulas,
  feriados,
  mensalidades,
  hoje = hojeISO,
  agora = horaAtual,
}) {
  const momento = () => ({ hoje: hoje(), agora: agora() });

  /** Aulas do aluno de hoje em diante que ainda não começaram (a que já começou aconteceu: fica como está). */
  async function aulasPorVir(alunoId) {
    const quando = momento();
    return (await aulas.list({ alunoId, inicio: quando.hoje })).filter((aula) => !jaComecou(aula, quando));
  }

  async function garantirReferencias(dados) {
    const plano = await planos.findById(dados.planoId);
    if (!plano) throw new ValidationError([{ campo: 'planoId', mensagem: 'Plano não encontrado.' }]);
    if (dados.usuarioRespId !== null) {
      const responsavel = await usuarios.findById(dados.usuarioRespId);
      if (!responsavel || responsavel.papel !== 'responsavel') {
        throw new ValidationError([{ campo: 'usuarioRespId', mensagem: 'Responsável não encontrado.' }]);
      }
    }
  }

  async function buscar(id) {
    const aluno = await alunos.findById(parseId(id));
    if (!aluno) throw new NotFoundError('Aluno não encontrado.');
    return aluno;
  }

  return {
    async listar({ status } = {}) {
      if (status !== undefined && !STATUS_ALUNO.includes(status)) {
        throw new ValidationError([{ campo: 'status', mensagem: 'Situação inválida: use "ativo" ou "inativo".' }]);
      }
      return alunos.list({ status });
    },

    buscar,

    async criar(input) {
      const { erros, dados } = validarAluno(input);
      assertValid(erros);
      await garantirReferencias(dados);
      return alunos.create({ ...dados, status: 'ativo' });
    },

    async atualizar(id, input) {
      const atual = await buscar(id);
      const { erros, dados } = validarAluno(input);
      assertValid(erros);
      await garantirReferencias(dados);
      return alunos.update(atual.id, dados);
    },

    /**
     * RN08 — inativa o aluno e cancela as aulas que ainda não começaram, liberando o horário do professor.
     * Elas ficam marcadas como canceladas pela inativação, para voltarem se o aluno for reativado.
     * Com `cancelarMensalidades`, as cobranças em aberto do aluno também são canceladas (ex.: ele saiu da escola);
     * sem ele, continuam a receber — o mês já dado continua devido. Reativar não as reabre: cada uma se reabre à mão.
     */
    async inativar(id, input = {}) {
      const atual = await buscar(id);
      if (atual.status === 'inativo') throw new ConflictError('O aluno já está inativo.');
      const agendadas = (await aulasPorVir(atual.id)).filter((aula) => aula.status === 'agendada');
      await aulas.updateMany(
        agendadas.map((aula) => aula.id),
        { status: 'cancelada', motivoCancelamento: 'inativacao' },
      );
      let mensalidadesCanceladas = 0;
      if (input.cancelarMensalidades === true && mensalidades) {
        const emAberto = await mensalidades.list({ alunoId: atual.id, naoPagas: true });
        for (const mensalidade of emAberto) {
          await mensalidades.update(mensalidade.id, {
            status: 'cancelada',
            cancelamentoMotivo: MOTIVO_CANCELAMENTO_INATIVACAO,
          });
        }
        mensalidadesCanceladas = emAberto.length;
      }
      const inativado = await alunos.update(atual.id, { status: 'inativo' });
      return { ...inativado, aulasCanceladas: agendadas.length, mensalidadesCanceladas };
    },

    /**
     * Reativa o aluno e devolve as aulas que a inativação cancelou (as que ainda não começaram).
     * Se, nesse meio-tempo, o horário foi ocupado por outra aula do professor ou do aluno, aquela fica cancelada.
     */
    async reativar(id) {
      const atual = await buscar(id);
      if (atual.status === 'ativo') throw new ConflictError('O aluno já está ativo.');
      const daInativacao = (await aulasPorVir(atual.id)).filter(
        (aula) => aula.status === 'cancelada' && aula.motivoCancelamento === 'inativacao',
      );

      let restauradas = [];
      let ocupadas = [];
      let emFeriado = [];
      if (daInativacao.length > 0) {
        const periodo = { inicio: daInativacao[0].data, fim: daInativacao.at(-1).data }; // a lista vem por data
        const [doPeriodo, feriadosDoPeriodo] = await Promise.all([aulas.list(periodo), feriados.list(periodo)]);
        // Aula que caiu num feriado cadastrado nesse meio-tempo fica de fora; volta se o feriado for removido.
        emFeriado = daInativacao.filter((aula) => feriadoNaData(aula.data, feriadosDoPeriodo)).map((aula) => aula.id);
        const candidatas = daInativacao.filter((aula) => !emFeriado.includes(aula.id));
        ({ livres: restauradas, ocupadas } = separarRestauraveis(candidatas, doPeriodo));
      }
      await aulas.updateMany(restauradas, { status: 'agendada', motivoCancelamento: null });
      // As que não puderam voltar passam a ser canceladas comuns (não tentam voltar numa próxima reativação).
      await aulas.updateMany(ocupadas, { motivoCancelamento: 'manual' });
      await aulas.updateMany(emFeriado, { motivoCancelamento: 'feriado' });

      const reativado = await alunos.update(atual.id, { status: 'ativo' });
      return { ...reativado, aulasRestauradas: restauradas.length, aulasNaoRestauradas: ocupadas.length };
    },

    /**
     * Exclusão permanente — só de aluno inativo (inativar primeiro evita apagar alguém por engano).
     * Apaga também todo o histórico do aluno (aulas, diários, solicitações e mensalidades).
     */
    async excluir(id) {
      const atual = await buscar(id);
      if (atual.status !== 'inativo') {
        throw new ConflictError('Só é possível excluir aluno inativo. Inative o aluno antes.');
      }
      return alunos.remove(atual.id);
    },
  };
}
