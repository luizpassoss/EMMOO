import { porDataEHora } from '../../domain/agenda.js';
import { ConflictError } from '../../shared/errors.js';
import { createMemoryStore } from './memoryStore.js';

const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
const porDiaEHora = (a, b) => a.diaSemana - b.diaSemana || a.horaInicio.localeCompare(b.horaInicio);
const normalizar = (texto) => String(texto).trim().toLowerCase();
const EM_ABERTO = ['pendente', 'atrasada'];

/**
 * Repositórios em memória — mesma interface dos repositórios Prisma/MySQL.
 * Usados em desenvolvimento (DB_DRIVER=memory) e nos testes.
 *
 * Multi-tenant: `escolas` é global; `paraEscola(id)` devolve os repositórios de UMA escola.
 * Tudo o que eles leem ou gravam fica restrito a ela — inclusive buscas por id de outra escola,
 * que voltam vazias —, então nenhum serviço consegue ver ou alterar dados de outra escola.
 */
export function createMemoryRepositories() {
  const escolasStore = createMemoryStore();
  const usuariosStore = createMemoryStore();
  const planosStore = createMemoryStore();
  const alunosStore = createMemoryStore();
  const horariosStore = createMemoryStore();
  const aulasStore = createMemoryStore();
  const feriadosStore = createMemoryStore();
  const solicitacoesStore = createMemoryStore();
  const diariosStore = createMemoryStore();
  const mensalidadesStore = createMemoryStore();
  const alertasStore = createMemoryStore();
  const redefinicoesStore = createMemoryStore();

  const escolas = {
    /** Todas as escolas (as rotinas automáticas passam por cada uma). */
    async list() {
      return escolasStore.todos();
    },
    async findByCodigo(codigo) {
      const alvo = normalizar(codigo);
      return escolasStore.todos().find((escola) => escola.codigo === alvo) ?? null;
    },
    async findById(id) {
      return escolasStore.buscar(id);
    },
    async create(dados) {
      const codigo = normalizar(dados.codigo);
      if (await escolas.findByCodigo(codigo)) throw new ConflictError('Este código de escola já está em uso.');
      // Mesmos padrões do banco: a escola começa sem Pix configurado.
      return escolasStore.inserir({ pixTipo: null, pixChave: null, pixRecebedor: null, pixCidade: null, ...dados, codigo });
    },
    /** Dados da escola (nome e Pix). O código não muda: é com ele que todos entram no sistema. */
    async update(id, dados) {
      const alteracoes = { ...dados };
      delete alteracoes.codigo;
      return escolasStore.atualizar(id, alteracoes);
    },
  };

  /**
   * "Esqueci minha senha" — pedidos de redefinição (global: o link chega sem sessão, só com o token).
   * Datas em ISO; `usar` só consome o pedido uma vez.
   */
  const redefinicoesDeSenha = {
    async create(dados) {
      return redefinicoesStore.inserir({ usadoEm: null, ...dados });
    },
    async findByTokenHash(tokenHash) {
      return redefinicoesStore.todos().find((pedido) => pedido.tokenHash === tokenHash) ?? null;
    },
    /** Marca como usado, se ainda não foi; devolve se esta chamada é que o usou (o mesmo link não vale duas vezes). */
    async usar(id, quando) {
      const atual = redefinicoesStore.buscar(id);
      if (!atual || atual.usadoEm) return false;
      redefinicoesStore.atualizar(id, { usadoEm: quando });
      return true;
    },
    /** Os pedidos ainda não usados da pessoa deixam de valer (pediu de novo, ou a senha já foi trocada). */
    async invalidarDoUsuario(usuarioId, quando) {
      const abertos = redefinicoesStore.todos().filter((pedido) => pedido.usuarioId === usuarioId && !pedido.usadoEm);
      for (const pedido of abertos) redefinicoesStore.atualizar(pedido.id, { usadoEm: quando });
      return abertos.length;
    },
    /** Apaga os vencidos antes de `antes` (ISO): a tabela não cresce sem limite. */
    async removerVencidos(antes) {
      const vencidos = redefinicoesStore.todos().filter((pedido) => pedido.expiraEm < antes);
      for (const pedido of vencidos) redefinicoesStore.remover(pedido.id);
      return vencidos.length;
    },
  };

  /** Recorte de um armazenamento: só enxerga e só grava registros da escola. */
  function recorte(store, escolaId) {
    const daEscola = (registro) => registro?.escolaId === escolaId;
    return {
      todos: () => store.todos().filter(daEscola),
      buscar: (id) => (daEscola(store.buscar(id)) ? store.buscar(id) : null),
      inserir: (dados) => store.inserir({ ...dados, escolaId }),
      // A escola do registro nunca muda, mesmo que os dados tentem trocá-la.
      atualizar: (id, dados) => (daEscola(store.buscar(id)) ? store.atualizar(id, { ...dados, escolaId }) : null),
      remover: (id) => (daEscola(store.buscar(id)) ? store.remover(id) : false),
    };
  }

  function paraEscola(escolaId) {
    const usuariosDaEscola = recorte(usuariosStore, escolaId);
    const planosDaEscola = recorte(planosStore, escolaId);
    const alunosDaEscola = recorte(alunosStore, escolaId);
    const horariosDaEscola = recorte(horariosStore, escolaId);
    const aulasDaEscola = recorte(aulasStore, escolaId);
    const feriadosDaEscola = recorte(feriadosStore, escolaId);
    const solicitacoesDaEscola = recorte(solicitacoesStore, escolaId);
    const diariosDaEscola = recorte(diariosStore, escolaId);
    const mensalidadesDaEscola = recorte(mensalidadesStore, escolaId);
    const alertasDaEscola = recorte(alertasStore, escolaId);
    const entre = (lista) => (valor) => lista === undefined || lista.includes(valor);

    const buscarPorEmail = async (email) =>
      usuariosDaEscola.todos().find((usuario) => usuario.email === normalizar(email)) ?? null;
    const buscarPorLogin = async (login) =>
      usuariosDaEscola.todos().find((usuario) => usuario.login === normalizar(login)) ?? null;

    /** E-mail e usuário são únicos dentro da escola (o próprio registro não conta, na edição). */
    async function garantirUnico({ email, login }, idAtual = null) {
      const comEmail = await buscarPorEmail(email);
      if (comEmail && comEmail.id !== idAtual) throw new ConflictError('E-mail já cadastrado nesta escola.');
      const comLogin = login ? await buscarPorLogin(login) : null;
      if (comLogin && comLogin.id !== idAtual) throw new ConflictError('Usuário já cadastrado nesta escola.');
    }
    const normalizarUsuario = (dados) => ({
      ...dados,
      ...(dados.email !== undefined && { email: normalizar(dados.email) }),
      ...(dados.login !== undefined && { login: dados.login ? normalizar(dados.login) : null }),
    });

    return {
      usuarios: {
        async list({ papel } = {}) {
          return usuariosDaEscola
            .todos()
            .filter((usuario) => !papel || usuario.papel === papel)
            .sort(porNome);
        },
        findByEmail: buscarPorEmail,
        findByLogin: buscarPorLogin,
        async findById(id) {
          return usuariosDaEscola.buscar(id);
        },
        async create(dados) {
          // Mesmos padrões do banco: todo usuário começa ativo, na versão de sessão 0.
          const normalizado = normalizarUsuario({ ativo: true, versaoSessao: 0, ...dados, login: dados.login ?? null });
          await garantirUnico(normalizado);
          return usuariosDaEscola.inserir(normalizado);
        },
        async update(id, dados) {
          const atual = usuariosDaEscola.buscar(id);
          if (!atual) return null;
          const normalizado = normalizarUsuario(dados);
          await garantirUnico({ ...atual, ...normalizado }, id);
          return usuariosDaEscola.atualizar(id, normalizado);
        },
      },

      planos: {
        async list() {
          return planosDaEscola.todos().sort(porNome);
        },
        async findById(id) {
          return planosDaEscola.buscar(id);
        },
        async create(dados) {
          return planosDaEscola.inserir(dados);
        },
        async update(id, dados) {
          return planosDaEscola.atualizar(id, dados);
        },
        async remove(id) {
          return planosDaEscola.remover(id);
        },
      },

      alunos: {
        async list({ status, usuarioRespId } = {}) {
          return alunosDaEscola
            .todos()
            .filter((aluno) => !status || aluno.status === status)
            .filter((aluno) => usuarioRespId === undefined || aluno.usuarioRespId === usuarioRespId)
            .sort(porNome);
        },
        async findById(id) {
          return alunosDaEscola.buscar(id);
        },
        async create(dados) {
          return alunosDaEscola.inserir(dados);
        },
        async update(id, dados) {
          return alunosDaEscola.atualizar(id, dados);
        },
        /** Exclui o aluno e todo o histórico dele: aulas e diários, solicitações, mensalidades e alertas. */
        async remove(id) {
          if (!alunosDaEscola.buscar(id)) return { aulasExcluidas: 0 };
          const aulasDoAluno = aulasDaEscola.todos().filter((aula) => aula.alunoId === id);
          const idsDasAulas = aulasDoAluno.map((aula) => aula.id);
          const mensalidadesDoAluno = mensalidadesDaEscola.todos().filter((mensalidade) => mensalidade.alunoId === id);
          const idsDasMensalidades = mensalidadesDoAluno.map((mensalidade) => mensalidade.id);
          for (const diario of diariosDaEscola.todos().filter((d) => idsDasAulas.includes(d.aulaId))) diariosDaEscola.remover(diario.id);
          for (const alerta of alertasDaEscola.todos().filter((a) => idsDasMensalidades.includes(a.mensalidadeId))) {
            alertasDaEscola.remover(alerta.id);
          }
          for (const mensalidade of mensalidadesDoAluno) mensalidadesDaEscola.remover(mensalidade.id);
          for (const solicitacao of solicitacoesDaEscola.todos().filter((s) => s.alunoId === id)) {
            solicitacoesDaEscola.remover(solicitacao.id);
          }
          for (const aula of aulasDoAluno) aulasDaEscola.remover(aula.id);
          alunosDaEscola.remover(id);
          return { aulasExcluidas: aulasDoAluno.length };
        },
      },

      horarios: {
        async list({ professorId } = {}) {
          return horariosDaEscola
            .todos()
            .filter((horario) => professorId === undefined || horario.professorId === professorId)
            .sort(porDiaEHora);
        },
        async findById(id) {
          return horariosDaEscola.buscar(id);
        },
        async create(dados) {
          return horariosDaEscola.inserir(dados);
        },
        async remove(id) {
          return horariosDaEscola.remover(id);
        },
      },

      aulas: {
        async list({ inicio, fim, professorId, alunoId, alunoIds } = {}) {
          return aulasDaEscola
            .todos()
            .filter((aula) => !inicio || aula.data >= inicio)
            .filter((aula) => !fim || aula.data <= fim)
            .filter((aula) => professorId === undefined || aula.professorId === professorId)
            .filter((aula) => alunoId === undefined || aula.alunoId === alunoId)
            .filter((aula) => alunoIds === undefined || alunoIds.includes(aula.alunoId))
            .sort(porDataEHora);
        },
        async findById(id) {
          return aulasDaEscola.buscar(id);
        },
        /** Cria várias aulas de uma vez (aula semanal). Aula comum não é reposição de nenhuma outra. */
        async createMany(lista) {
          return lista.map((dados) => aulasDaEscola.inserir({ reposicaoDeId: null, ...dados }));
        },
        async update(id, dados) {
          return aulasDaEscola.atualizar(id, dados);
        },
        /** Mesma alteração em várias aulas (ex.: cancelar as da inativação); devolve quantas mudaram. */
        async updateMany(ids, dados) {
          return ids.filter((id) => aulasDaEscola.atualizar(id, dados) !== null).length;
        },
      },

      /** RF06/RF07 — avisos de falta e pedidos de reposição. */
      solicitacoes: {
        async list({ alunoId, alunoIds, aulaIds, tipo } = {}) {
          return solicitacoesDaEscola
            .todos()
            .filter((solicitacao) => alunoId === undefined || solicitacao.alunoId === alunoId)
            .filter((solicitacao) => entre(alunoIds)(solicitacao.alunoId))
            .filter((solicitacao) => entre(aulaIds)(solicitacao.aulaId))
            .filter((solicitacao) => !tipo || solicitacao.tipo === tipo)
            .sort((a, b) => a.id - b.id);
        },
        async create(dados) {
          // Mesmos padrões do banco: pendente, sem nova data e sem liberar reposição.
          return solicitacoesDaEscola.inserir({
            aulaId: null,
            status: 'pendente',
            novaData: null,
            dataAnterior: null,
            liberaReposicao: false,
            dataSolicitacao: new Date().toISOString(),
            ...dados,
          });
        },
      },

      /** RF09 — diário de aula (um por aula). */
      diarios: {
        async list({ aulaIds } = {}) {
          return diariosDaEscola.todos().filter((diario) => entre(aulaIds)(diario.aulaId));
        },
        async findByAulaId(aulaId) {
          return diariosDaEscola.todos().find((diario) => diario.aulaId === aulaId) ?? null;
        },
        /** Cria ou atualiza o diário da aula. */
        async salvar({ aulaId, conteudoMinistrado, planoProxima }) {
          const atual = diariosDaEscola.todos().find((diario) => diario.aulaId === aulaId);
          const dados = { aulaId, conteudoMinistrado, planoProxima: planoProxima ?? null };
          return atual ? diariosDaEscola.atualizar(atual.id, dados) : diariosDaEscola.inserir(dados);
        },
      },

      /** RF10–RF12 — mensalidades (uma por aluno e mês de referência). */
      mensalidades: {
        /** `naoPagas`: só as em aberto (pendentes e atrasadas) — a cancelada não é cobrada. */
        async list({ mes, alunoId, alunoIds, naoPagas } = {}) {
          return mensalidadesDaEscola
            .todos()
            .filter((mensalidade) => !mes || mensalidade.mesReferencia === mes)
            .filter((mensalidade) => alunoId === undefined || mensalidade.alunoId === alunoId)
            .filter((mensalidade) => entre(alunoIds)(mensalidade.alunoId))
            .filter((mensalidade) => !naoPagas || EM_ABERTO.includes(mensalidade.status))
            .sort((a, b) => b.mesReferencia.localeCompare(a.mesReferencia) || a.id - b.id);
        },
        async findById(id) {
          return mensalidadesDaEscola.buscar(id);
        },
        async create(dados) {
          const repetida = mensalidadesDaEscola
            .todos()
            .some((mensalidade) => mensalidade.alunoId === dados.alunoId && mensalidade.mesReferencia === dados.mesReferencia);
          if (repetida) throw new ConflictError('Este aluno já tem mensalidade neste mês.');
          // Mesmos padrões do banco: pendente, sem pagamento, sem ajuste, sem cancelamento e sem recibo.
          return mensalidadesDaEscola.inserir({
            status: 'pendente',
            dataPagamento: null,
            formaPagamento: null,
            valorOriginal: null,
            ajusteMotivo: null,
            cancelamentoMotivo: null,
            numeroRecibo: null,
            ...dados,
          });
        },
        async update(id, dados) {
          return mensalidadesDaEscola.atualizar(id, dados);
        },
        /** RF15 — dá à mensalidade o próximo número de recibo da escola, se ainda não tem; devolve a mensalidade. */
        async registrarNumeroRecibo(id) {
          const atual = mensalidadesDaEscola.buscar(id);
          if (!atual || atual.numeroRecibo != null) return atual;
          const ultimo = mensalidadesDaEscola.todos().reduce((maior, outra) => Math.max(maior, outra.numeroRecibo ?? 0), 0);
          return mensalidadesDaEscola.atualizar(id, { numeroRecibo: ultimo + 1 });
        },
      },

      /** RF12 — alertas de pagamento por e-mail (um de cada tipo por mensalidade). */
      alertas: {
        async list({ status, mensalidadeIds } = {}) {
          return alertasDaEscola
            .todos()
            .filter((alerta) => !status || alerta.status === status)
            .filter((alerta) => entre(mensalidadeIds)(alerta.mensalidadeId))
            .sort((a, b) => a.id - b.id);
        },
        async create(dados) {
          const repetido = alertasDaEscola
            .todos()
            .some((alerta) => alerta.mensalidadeId === dados.mensalidadeId && alerta.tipo === dados.tipo);
          if (repetido) throw new ConflictError('Este alerta já foi registrado.');
          return alertasDaEscola.inserir({ status: 'pendente', tentativas: 0, ultimoErro: null, enviadoEm: null, ...dados });
        },
        async update(id, dados) {
          return alertasDaEscola.atualizar(id, dados);
        },
      },

      feriados: {
        /** Feriados e recessos que tocam o período (inicio e fim opcionais), em ordem de data. */
        async list({ inicio, fim } = {}) {
          return feriadosDaEscola
            .todos()
            .filter((feriado) => !fim || feriado.inicio <= fim)
            .filter((feriado) => !inicio || feriado.fim >= inicio)
            .sort((a, b) => a.inicio.localeCompare(b.inicio) || a.fim.localeCompare(b.fim));
        },
        async findById(id) {
          return feriadosDaEscola.buscar(id);
        },
        async create(dados) {
          return feriadosDaEscola.inserir(dados);
        },
        async remove(id) {
          return feriadosDaEscola.remover(id);
        },
      },
    };
  }

  return { escolas, redefinicoesDeSenha, paraEscola };
}
