import { porDataEHora } from '../../domain/agenda.js';
import { ConflictError } from '../../shared/errors.js';
import { createMemoryStore } from './memoryStore.js';

const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
const porDiaEHora = (a, b) => a.diaSemana - b.diaSemana || a.horaInicio.localeCompare(b.horaInicio);

/**
 * Repositórios em memória — mesma interface dos repositórios Prisma/MySQL.
 * Usados em desenvolvimento (DB_DRIVER=memory) e nos testes.
 */
export function createMemoryRepositories() {
  const usuariosStore = createMemoryStore();
  const planosStore = createMemoryStore();
  const alunosStore = createMemoryStore();
  const horariosStore = createMemoryStore();
  const aulasStore = createMemoryStore();

  async function buscarUsuarioPorEmail(email) {
    const alvo = String(email).trim().toLowerCase();
    return usuariosStore.todos().find((usuario) => usuario.email === alvo) ?? null;
  }

  return {
    usuarios: {
      async list({ papel } = {}) {
        return usuariosStore
          .todos()
          .filter((usuario) => !papel || usuario.papel === papel)
          .sort(porNome);
      },
      findByEmail: buscarUsuarioPorEmail,
      async findById(id) {
        return usuariosStore.buscar(id);
      },
      async create(dados) {
        const email = dados.email.trim().toLowerCase();
        if (await buscarUsuarioPorEmail(email)) throw new ConflictError('E-mail já cadastrado.');
        return usuariosStore.inserir({ ...dados, email });
      },
    },

    planos: {
      async list() {
        return planosStore.todos().sort(porNome);
      },
      async findById(id) {
        return planosStore.buscar(id);
      },
      async create(dados) {
        return planosStore.inserir(dados);
      },
    },

    alunos: {
      async list({ status, usuarioRespId } = {}) {
        return alunosStore
          .todos()
          .filter((aluno) => !status || aluno.status === status)
          .filter((aluno) => usuarioRespId === undefined || aluno.usuarioRespId === usuarioRespId)
          .sort(porNome);
      },
      async findById(id) {
        return alunosStore.buscar(id);
      },
      async create(dados) {
        return alunosStore.inserir(dados);
      },
      async update(id, dados) {
        return alunosStore.atualizar(id, dados);
      },
    },

    horarios: {
      async list({ professorId } = {}) {
        return horariosStore
          .todos()
          .filter((horario) => professorId === undefined || horario.professorId === professorId)
          .sort(porDiaEHora);
      },
      async findById(id) {
        return horariosStore.buscar(id);
      },
      async create(dados) {
        return horariosStore.inserir(dados);
      },
      async remove(id) {
        return horariosStore.remover(id);
      },
    },

    aulas: {
      async list({ inicio, fim, professorId, alunoId, alunoIds } = {}) {
        return aulasStore
          .todos()
          .filter((aula) => !inicio || aula.data >= inicio)
          .filter((aula) => !fim || aula.data <= fim)
          .filter((aula) => professorId === undefined || aula.professorId === professorId)
          .filter((aula) => alunoId === undefined || aula.alunoId === alunoId)
          .filter((aula) => alunoIds === undefined || alunoIds.includes(aula.alunoId))
          .sort(porDataEHora);
      },
      async findById(id) {
        return aulasStore.buscar(id);
      },
      /** Cria várias aulas de uma vez (aula semanal). */
      async createMany(lista) {
        return lista.map((dados) => aulasStore.inserir(dados));
      },
      async update(id, dados) {
        return aulasStore.atualizar(id, dados);
      },
    },
  };
}
