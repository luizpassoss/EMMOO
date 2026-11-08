import { ConflictError, NotFoundError } from '../../shared/errors.js';
import { assertValid, parseId } from '../../shared/validation.js';
import { validarPlano } from './plano.validator.js';

const alunosPorExtenso = (total) => (total === 1 ? '1 aluno' : `${total} alunos`);

/** Casos de uso de planos de mensalidade (RF03). */
export function createPlanoService({ planos, alunos }) {
  async function buscar(id) {
    const plano = await planos.findById(parseId(id));
    if (!plano) throw new NotFoundError('Plano não encontrado.');
    return plano;
  }

  /** Quantos alunos usam cada plano: total (inclui inativos) e só os ativos. */
  async function contarAlunos() {
    const contagem = new Map();
    for (const aluno of await alunos.list()) {
      const atual = contagem.get(aluno.planoId) ?? { totalAlunos: 0, alunosAtivos: 0 };
      atual.totalAlunos += 1;
      if (aluno.status === 'ativo') atual.alunosAtivos += 1;
      contagem.set(aluno.planoId, atual);
    }
    return contagem;
  }

  const comContagem = (plano, contagem) => ({
    ...plano,
    ...(contagem.get(plano.id) ?? { totalAlunos: 0, alunosAtivos: 0 }),
  });

  return {
    async listar() {
      const [lista, contagem] = await Promise.all([planos.list(), contarAlunos()]);
      return lista.map((plano) => comContagem(plano, contagem));
    },

    async criar(input) {
      const { erros, dados } = validarPlano(input);
      assertValid(erros);
      return { ...(await planos.create(dados)), totalAlunos: 0, alunosAtivos: 0 };
    },

    async atualizar(id, input) {
      const atual = await buscar(id);
      const { erros, dados } = validarPlano(input);
      assertValid(erros);
      const atualizado = await planos.update(atual.id, dados);
      return comContagem(atualizado, await contarAlunos());
    },

    /** Só exclui plano sem alunos — nem inativos, que continuam ligados a ele no banco. */
    async excluir(id) {
      const atual = await buscar(id);
      const { totalAlunos = 0 } = (await contarAlunos()).get(atual.id) ?? {};
      if (totalAlunos > 0) {
        throw new ConflictError(
          `O plano é usado por ${alunosPorExtenso(totalAlunos)} (contando os inativos). Troque o plano deles antes de excluir.`,
        );
      }
      await planos.remove(atual.id);
    },
  };
}
