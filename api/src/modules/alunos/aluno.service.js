import { hojeISO } from '../../shared/datas.js';
import { ConflictError, NotFoundError, ValidationError } from '../../shared/errors.js';
import { assertValid, parseId } from '../../shared/validation.js';
import { STATUS_ALUNO, validarAluno } from './aluno.validator.js';

/** Casos de uso de alunos (RF02) e regra RN08 (aluno inativo). */
export function createAlunoService({ alunos, planos, usuarios, aulas, hoje = hojeISO }) {
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
        throw new ValidationError([{ campo: 'status', mensagem: 'O status deve ser "ativo" ou "inativo".' }]);
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

    /** RN08 — inativa o aluno e cancela as aulas futuras, liberando o horário do professor. */
    async inativar(id) {
      const atual = await buscar(id);
      if (atual.status === 'inativo') throw new ConflictError('O aluno já está inativo.');
      const inativado = await alunos.update(atual.id, { status: 'inativo' });
      const futuras = (await aulas.list({ alunoId: atual.id, inicio: hoje() })).filter(
        (aula) => aula.status === 'agendada',
      );
      await Promise.all(futuras.map((aula) => aulas.update(aula.id, { status: 'cancelada' })));
      return { ...inativado, aulasCanceladas: futuras.length };
    },

    async reativar(id) {
      const atual = await buscar(id);
      if (atual.status === 'ativo') throw new ConflictError('O aluno já está ativo.');
      return alunos.update(atual.id, { status: 'ativo' });
    },
  };
}
