import { PrismaClient } from '@prisma/client';
import { paraDataISO, paraDate } from '../../shared/datas.js';
import { ConflictError } from '../../shared/errors.js';

/** Converte o Decimal do Prisma em número para manter a mesma interface dos repositórios em memória. */
const paraPlano = (plano) => (plano ? { ...plano, valor: Number(plano.valor) } : null);

/** A coluna DATE chega como Date; a interface dos repositórios usa "AAAA-MM-DD". */
const paraAula = (aula) => (aula ? { ...aula, data: paraDataISO(aula.data) } : null);
const dadosDeAula = (dados) => ({ ...dados, ...(dados.data !== undefined && { data: paraDate(dados.data) }) });
const paraFeriado = (feriado) =>
  feriado ? { ...feriado, inicio: paraDataISO(feriado.inicio), fim: paraDataISO(feriado.fim) } : null;
/** Data e hora de calendário ("AAAA-MM-DDTHH:MM"), guardada sem fuso: ida e volta. */
const paraDataHora = (data) => (data ? data.toISOString().slice(0, 16) : null);
const deDataHora = (texto) => new Date(`${texto}:00.000Z`);
/** A nova data (reposição, remarcação) e a anterior (remarcação) são datas e horas de calendário. */
const paraSolicitacao = (solicitacao) =>
  solicitacao
    ? {
        ...solicitacao,
        dataSolicitacao: solicitacao.dataSolicitacao.toISOString(),
        novaData: paraDataHora(solicitacao.novaData),
        dataAnterior: paraDataHora(solicitacao.dataAnterior),
      }
    : null;
const paraMensalidade = (mensalidade) =>
  mensalidade
    ? {
        ...mensalidade,
        valor: Number(mensalidade.valor),
        valorOriginal: mensalidade.valorOriginal == null ? null : Number(mensalidade.valorOriginal),
        vencimento: paraDataISO(mensalidade.vencimento),
        dataPagamento: mensalidade.dataPagamento ? paraDataISO(mensalidade.dataPagamento) : null,
      }
    : null;
const EM_ABERTO = ['pendente', 'atrasada'];
const TENTATIVAS_DE_NUMERACAO = 5;
const paraRedefinicao = (pedido) =>
  pedido
    ? {
        ...pedido,
        expiraEm: pedido.expiraEm.toISOString(),
        usadoEm: pedido.usadoEm ? pedido.usadoEm.toISOString() : null,
        criadoEm: pedido.criadoEm.toISOString(),
      }
    : null;
const paraAlerta = (alerta) =>
  alerta
    ? { ...alerta, criadoEm: alerta.criadoEm.toISOString(), enviadoEm: alerta.enviadoEm ? alerta.enviadoEm.toISOString() : null }
    : null;
/** Datas de calendário da mensalidade (vencimento e pagamento) viram DATE no banco. */
const dadosDeMensalidade = (dados) => ({
  ...dados,
  ...(dados.vencimento !== undefined && { vencimento: paraDate(dados.vencimento) }),
  ...(dados.dataPagamento !== undefined && { dataPagamento: dados.dataPagamento ? paraDate(dados.dataPagamento) : null }),
});

const normalizar = (texto) => String(texto).trim().toLowerCase();
const normalizarUsuario = (dados) => ({
  ...dados,
  ...(dados.email !== undefined && { email: normalizar(dados.email) }),
  ...(dados.login !== undefined && { login: dados.login ? normalizar(dados.login) : null }),
});

const filtroDeData = (inicio, fim) => {
  if (!inicio && !fim) return undefined;
  return { ...(inicio && { gte: paraDate(inicio) }), ...(fim && { lte: paraDate(fim) }) };
};

/**
 * Violação de unicidade (P2002) vira 409 com mensagem legível, como nos repositórios em memória.
 * `mensagem` pode ser uma função do erro (para escolher pelo índice violado, em `meta.target`).
 */
async function comConflito(operacao, mensagem) {
  try {
    return await operacao();
  } catch (erro) {
    if (erro?.code === 'P2002') throw new ConflictError(typeof mensagem === 'function' ? mensagem(erro) : mensagem);
    throw erro;
  }
}

/** No MySQL, `meta.target` é o nome do índice (ex.: usuario_escola_id_login_key). */
const conflitoDeUsuario = (erro) =>
  String(erro?.meta?.target ?? '').includes('login')
    ? 'Usuário já cadastrado nesta escola.'
    : 'E-mail já cadastrado nesta escola.';

/** Linha útil de um erro do Prisma (as mensagens vêm com várias linhas e cabeçalho "Invalid ... invocation"). */
function resumirErro(erro) {
  const linhas = String(erro?.message ?? erro)
    .split('\n')
    .map((linha) => linha.trim())
    .filter((linha) => linha && !linha.startsWith('Invalid'));
  return linhas[0] ?? 'erro desconhecido';
}

/**
 * Cria o cliente e testa o banco já na inicialização: falha cedo, dizendo o que fazer,
 * em vez de subir a API e responder "erro interno" no primeiro login.
 */
export async function conectarPrisma() {
  let prisma;
  try {
    prisma = new PrismaClient();
  } catch {
    throw new Error('O cliente do Prisma não foi gerado. Na pasta "api", rode: npm run prisma:generate');
  }
  try {
    await prisma.escola.count(); // conecta e confirma que as tabelas (já com escolas) existem
  } catch (erro) {
    await prisma.$disconnect().catch(() => {});
    throw new Error(
      'Não foi possível usar o banco MySQL definido em DATABASE_URL (api/.env). ' +
        'Verifique se o MySQL do XAMPP está ligado e se o banco foi importado ou migrado (api/prisma/emmoo.sql).\n' +
        `  Detalhe: ${resumirErro(erro)}`,
    );
  }
  return prisma;
}

/**
 * Repositórios persistidos em MySQL via Prisma (DB_DRIVER=mysql).
 * Implementam exatamente a mesma interface dos repositórios em memória: `escolas` global e
 * `paraEscola(id)`, em que TODA consulta e gravação leva `escolaId` — leitura, edição e exclusão
 * de registro de outra escola simplesmente não encontram nada.
 */
export function createPrismaRepositories(prisma = new PrismaClient()) {
  const escolas = {
    list: () => prisma.escola.findMany({ orderBy: { id: 'asc' } }),
    findByCodigo: (codigo) => prisma.escola.findUnique({ where: { codigo: normalizar(codigo) } }),
    findById: (id) => prisma.escola.findUnique({ where: { id } }),
    create: (dados) =>
      comConflito(
        () => prisma.escola.create({ data: { ...dados, codigo: normalizar(dados.codigo) } }),
        'Este código de escola já está em uso.',
      ),
    /** Dados da escola (nome e Pix). O código não muda: é com ele que todos entram no sistema. */
    update: async (id, dados) => {
      const alteracoes = { ...dados };
      delete alteracoes.codigo;
      const { count } = await prisma.escola.updateMany({ where: { id }, data: alteracoes });
      return count ? prisma.escola.findUnique({ where: { id } }) : null;
    },
  };

  /** "Esqueci minha senha" — pedidos de redefinição (global: o link chega sem sessão, só com o token). */
  const redefinicoesDeSenha = {
    create: async ({ expiraEm, ...dados }) =>
      paraRedefinicao(await prisma.redefinicaoSenha.create({ data: { ...dados, expiraEm: new Date(expiraEm) } })),
    findByTokenHash: async (tokenHash) => paraRedefinicao(await prisma.redefinicaoSenha.findUnique({ where: { tokenHash } })),
    // Um único UPDATE condicionado a "ainda não usado": dois envios do mesmo link não consomem o pedido duas vezes.
    usar: async (id, quando) =>
      (await prisma.redefinicaoSenha.updateMany({ where: { id, usadoEm: null }, data: { usadoEm: new Date(quando) } }))
        .count > 0,
    invalidarDoUsuario: async (usuarioId, quando) =>
      (await prisma.redefinicaoSenha.updateMany({ where: { usuarioId, usadoEm: null }, data: { usadoEm: new Date(quando) } }))
        .count,
    removerVencidos: async (antes) =>
      (await prisma.redefinicaoSenha.deleteMany({ where: { expiraEm: { lt: new Date(antes) } } })).count,
  };

  function paraEscola(escolaId) {
    const daEscola = (where = {}) => ({ ...where, escolaId });
    /** Atualiza só se o registro for da escola (o updateMany aceita o filtro); devolve o registro ou null. */
    async function atualizar(modelo, id, dados) {
      const { count } = await prisma[modelo].updateMany({ where: daEscola({ id }), data: dados });
      return count ? prisma[modelo].findUnique({ where: { id } }) : null;
    }
    const remover = async (modelo, id) => (await prisma[modelo].deleteMany({ where: daEscola({ id }) })).count > 0;

    return {
      usuarios: {
        list: ({ papel } = {}) =>
          prisma.usuario.findMany({ where: daEscola(papel ? { papel } : {}), orderBy: { nome: 'asc' } }),
        findByEmail: (email) => prisma.usuario.findFirst({ where: daEscola({ email: normalizar(email) }) }),
        findByLogin: (login) => prisma.usuario.findFirst({ where: daEscola({ login: normalizar(login) }) }),
        findById: (id) => prisma.usuario.findFirst({ where: daEscola({ id }) }),
        create: (dados) =>
          comConflito(
            () =>
              prisma.usuario.create({ data: { ...normalizarUsuario({ ...dados, login: dados.login ?? null }), escolaId } }),
            conflitoDeUsuario,
          ),
        update: (id, dados) => comConflito(() => atualizar('usuario', id, normalizarUsuario(dados)), conflitoDeUsuario),
      },
      planos: {
        list: async () => (await prisma.plano.findMany({ where: daEscola(), orderBy: { nome: 'asc' } })).map(paraPlano),
        findById: async (id) => paraPlano(await prisma.plano.findFirst({ where: daEscola({ id }) })),
        create: async (dados) => paraPlano(await prisma.plano.create({ data: { ...dados, escolaId } })),
        update: async (id, dados) => paraPlano(await atualizar('plano', id, dados)),
        remove: (id) => remover('plano', id),
      },
      alunos: {
        list: ({ status, usuarioRespId } = {}) =>
          prisma.aluno.findMany({
            where: daEscola({ ...(status && { status }), ...(usuarioRespId !== undefined && { usuarioRespId }) }),
            orderBy: { nome: 'asc' },
          }),
        findById: (id) => prisma.aluno.findFirst({ where: daEscola({ id }) }),
        create: (dados) => prisma.aluno.create({ data: { ...dados, escolaId } }),
        update: (id, dados) => atualizar('aluno', id, dados),
        // Exclusão permanente: as chaves estrangeiras exigem apagar antes tudo o que aponta para o aluno.
        // Numa transação — ou some tudo, ou nada — e sempre filtrando pela escola.
        remove: async (id) => {
          const [, , , aulas] = await prisma.$transaction([
            prisma.diarioAula.deleteMany({ where: daEscola({ aula: { alunoId: id } }) }),
            prisma.solicitacao.deleteMany({ where: daEscola({ alunoId: id }) }),
            prisma.mensalidade.deleteMany({ where: daEscola({ alunoId: id }) }),
            prisma.aula.deleteMany({ where: daEscola({ alunoId: id }) }),
            prisma.aluno.deleteMany({ where: daEscola({ id }) }),
          ]);
          return { aulasExcluidas: aulas.count };
        },
      },
      horarios: {
        list: ({ professorId } = {}) =>
          prisma.horarioDisponivel.findMany({
            where: daEscola(professorId !== undefined ? { professorId } : {}),
            orderBy: [{ diaSemana: 'asc' }, { horaInicio: 'asc' }],
          }),
        findById: (id) => prisma.horarioDisponivel.findFirst({ where: daEscola({ id }) }),
        create: (dados) => prisma.horarioDisponivel.create({ data: { ...dados, escolaId } }),
        remove: (id) => remover('horarioDisponivel', id),
      },
      aulas: {
        list: async ({ inicio, fim, professorId, alunoId, alunoIds } = {}) => {
          const aulas = await prisma.aula.findMany({
            where: daEscola({
              data: filtroDeData(inicio, fim),
              professorId,
              alunoId: alunoIds !== undefined ? { in: alunoIds } : alunoId,
            }),
            orderBy: [{ data: 'asc' }, { hora: 'asc' }],
          });
          return aulas.map(paraAula);
        },
        findById: async (id) => paraAula(await prisma.aula.findFirst({ where: daEscola({ id }) })),
        // Transação: ou todas as aulas da série são criadas, ou nenhuma.
        createMany: async (lista) => {
          const criadas = await prisma.$transaction(
            lista.map((dados) => prisma.aula.create({ data: { ...dados, data: paraDate(dados.data), escolaId } })),
          );
          return criadas.map(paraAula);
        },
        update: async (id, dados) => paraAula(await atualizar('aula', id, dadosDeAula(dados))),
        // Um único UPDATE: ou todas mudam, ou nenhuma.
        updateMany: async (ids, dados) =>
          ids.length === 0 ? 0 : (await prisma.aula.updateMany({ where: daEscola({ id: { in: ids } }), data: dados })).count,
      },
      solicitacoes: {
        list: async ({ alunoId, alunoIds, aulaIds, tipo } = {}) => {
          const lista = await prisma.solicitacao.findMany({
            where: daEscola({
              alunoId: alunoIds !== undefined ? { in: alunoIds } : alunoId,
              ...(aulaIds !== undefined && { aulaId: { in: aulaIds } }),
              ...(tipo && { tipo }),
            }),
            orderBy: { id: 'asc' },
          });
          return lista.map(paraSolicitacao);
        },
        create: async ({ novaData, dataAnterior, dataSolicitacao, ...dados }) =>
          paraSolicitacao(
            await prisma.solicitacao.create({
              data: {
                ...dados,
                ...(novaData && { novaData: deDataHora(novaData) }),
                ...(dataAnterior && { dataAnterior: deDataHora(dataAnterior) }),
                ...(dataSolicitacao && { dataSolicitacao: new Date(dataSolicitacao) }),
                escolaId,
              },
            }),
          ),
      },
      diarios: {
        list: ({ aulaIds } = {}) =>
          prisma.diarioAula.findMany({ where: daEscola(aulaIds !== undefined ? { aulaId: { in: aulaIds } } : {}) }),
        findByAulaId: (aulaId) => prisma.diarioAula.findFirst({ where: daEscola({ aulaId }) }),
        // A aula já foi conferida como da escola pelo serviço; o diário é único por aula.
        salvar: ({ aulaId, conteudoMinistrado, planoProxima }) =>
          prisma.diarioAula.upsert({
            where: { aulaId },
            create: { aulaId, conteudoMinistrado, planoProxima: planoProxima ?? null, escolaId },
            update: { conteudoMinistrado, planoProxima: planoProxima ?? null },
          }),
      },
      mensalidades: {
        // `naoPagas`: só as em aberto (pendentes e atrasadas) — a cancelada não é cobrada.
        list: async ({ mes, alunoId, alunoIds, naoPagas } = {}) => {
          const lista = await prisma.mensalidade.findMany({
            where: daEscola({
              ...(mes && { mesReferencia: mes }),
              alunoId: alunoIds !== undefined ? { in: alunoIds } : alunoId,
              ...(naoPagas && { status: { in: EM_ABERTO } }),
            }),
            orderBy: [{ mesReferencia: 'desc' }, { id: 'asc' }],
          });
          return lista.map(paraMensalidade);
        },
        findById: async (id) => paraMensalidade(await prisma.mensalidade.findFirst({ where: daEscola({ id }) })),
        create: async (dados) =>
          paraMensalidade(
            await comConflito(
              () => prisma.mensalidade.create({ data: { ...dadosDeMensalidade(dados), escolaId } }),
              'Este aluno já tem mensalidade neste mês.',
            ),
          ),
        update: async (id, dados) => paraMensalidade(await atualizar('mensalidade', id, dadosDeMensalidade(dados))),
        /**
         * RF15 — dá à mensalidade o próximo número de recibo da escola, se ainda não tem; devolve a mensalidade.
         * Duas baixas ao mesmo tempo podem calcular o mesmo número: o índice único (escola, número) barra a segunda,
         * que tenta o seguinte. O UPDATE só grava se a mensalidade continua sem número.
         */
        registrarNumeroRecibo: async (id) => {
          for (let tentativa = 1; ; tentativa += 1) {
            const atual = await prisma.mensalidade.findFirst({ where: daEscola({ id }) });
            if (!atual || atual.numeroRecibo != null) return paraMensalidade(atual);
            const { _max } = await prisma.mensalidade.aggregate({ where: daEscola(), _max: { numeroRecibo: true } });
            try {
              await prisma.mensalidade.updateMany({
                where: daEscola({ id, numeroRecibo: null }),
                data: { numeroRecibo: (_max.numeroRecibo ?? 0) + 1 },
              });
            } catch (erro) {
              if (erro?.code !== 'P2002') throw erro;
              if (tentativa >= TENTATIVAS_DE_NUMERACAO) {
                throw new ConflictError('Não foi possível numerar o recibo agora. Tente de novo.');
              }
            }
          }
        },
      },
      alertas: {
        list: async ({ status, mensalidadeIds } = {}) => {
          const lista = await prisma.alerta.findMany({
            where: daEscola({
              ...(status && { status }),
              ...(mensalidadeIds !== undefined && { mensalidadeId: { in: mensalidadeIds } }),
            }),
            orderBy: { id: 'asc' },
          });
          return lista.map(paraAlerta);
        },
        create: async (dados) =>
          paraAlerta(
            await comConflito(() => prisma.alerta.create({ data: { ...dados, escolaId } }), 'Este alerta já foi registrado.'),
          ),
        update: async (id, { enviadoEm, ...dados }) =>
          paraAlerta(
            await atualizar('alerta', id, {
              ...dados,
              ...(enviadoEm !== undefined && { enviadoEm: enviadoEm ? new Date(enviadoEm) : null }),
            }),
          ),
      },
      feriados: {
        // Os que tocam o período: começam até o fim dele e terminam a partir do início.
        list: async ({ inicio, fim } = {}) => {
          const feriados = await prisma.feriado.findMany({
            where: daEscola({
              ...(fim && { inicio: { lte: paraDate(fim) } }),
              ...(inicio && { fim: { gte: paraDate(inicio) } }),
            }),
            orderBy: [{ inicio: 'asc' }, { fim: 'asc' }],
          });
          return feriados.map(paraFeriado);
        },
        findById: async (id) => paraFeriado(await prisma.feriado.findFirst({ where: daEscola({ id }) })),
        create: async (dados) =>
          paraFeriado(
            await prisma.feriado.create({
              data: { ...dados, inicio: paraDate(dados.inicio), fim: paraDate(dados.fim), escolaId },
            }),
          ),
        remove: (id) => remover('feriado', id),
      },
    };
  }

  return { escolas, redefinicoesDeSenha, paraEscola };
}
