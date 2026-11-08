import { jaComecou, porDataEHora } from '../../domain/agenda.js';
import { EM_ABERTO, nomeDaForma, situacaoDaMensalidade } from '../../domain/mensalidades.js';
import { horaAtual, hojeISO } from '../../shared/datas.js';
import { ForbiddenError, NotFoundError } from '../../shared/errors.js';
import { parseId } from '../../shared/validation.js';
import { createEnriquecedorDeAulas, resumoDaAula } from '../aulas/aulaEnriquecida.js';
import { percentualDePresenca } from '../indicadores/indicador.service.js';

const PROXIMAS = 5;
const somar = (lista) => Math.round(lista.reduce((total, item) => total + Number(item.valor), 0) * 100) / 100;
const maisRecentePrimeiro = (a, b) => porDataEHora(b, a);

/**
 * RF14 — histórico consolidado do aluno: presença e diário de cada aula, reposições, avisos de falta e
 * pagamentos. A coordenação vê tudo; o responsável, só dos dependentes (RN03); o professor, só as próprias
 * aulas com o aluno e nada do financeiro (RN02 e menor privilégio).
 */
export function createHistoricoService({
  alunos,
  aulas,
  planos,
  usuarios,
  diarios,
  solicitacoes,
  mensalidades,
  hoje = hojeISO,
  agora = horaAtual,
}) {
  const enriquecer = createEnriquecedorDeAulas({ alunos, usuarios, solicitacoes, diarios });

  return {
    async doAluno(id, usuario) {
      const aluno = await alunos.findById(parseId(id));
      if (!aluno || (usuario.papel === 'responsavel' && aluno.usuarioRespId !== usuario.id)) {
        throw new NotFoundError('Aluno não encontrado.');
      }
      let todas = await aulas.list({ alunoId: aluno.id });
      if (usuario.papel === 'professor') {
        todas = todas.filter((aula) => aula.professorId === usuario.id);
        if (todas.length === 0) throw new ForbiddenError('Professores só veem o histórico dos próprios alunos.');
      }
      const momento = { hoje: hoje(), agora: agora() };
      const porVir = (aula) => aula.status === 'agendada' && !jaComecou(aula, momento);
      const [historicas, proximas] = await Promise.all([
        enriquecer(todas.filter((aula) => !porVir(aula)).sort(maisRecentePrimeiro)),
        enriquecer(todas.filter(porVir).slice(0, PROXIMAS)),
      ]);
      const ids = todas.map((aula) => aula.id);
      const [diariosDoAluno, pedidos, plano, responsavel] = await Promise.all([
        diarios.list({ aulaIds: ids }),
        solicitacoes.list({ alunoId: aluno.id }),
        planos.findById(aluno.planoId),
        aluno.usuarioRespId ? usuarios.findById(aluno.usuarioRespId) : null,
      ]);
      const diarioPorAula = new Map(diariosDoAluno.map((diario) => [diario.aulaId, diario]));
      const porId = new Map(todas.map((aula) => [aula.id, aula]));
      const visiveis = new Set(ids); // o professor não vê pedidos sobre aulas de outros professores

      const reposicoes = todas
        .filter((aula) => aula.reposicaoDeId != null)
        .sort(maisRecentePrimeiro)
        .map((aula) => ({
          aula: resumoDaAula(aula),
          de: porId.has(aula.reposicaoDeId) ? resumoDaAula(porId.get(aula.reposicaoDeId)) : null,
        }));
      const daEscola = usuario.papel !== 'professor';
      const financeiro = daEscola ? await mensalidades.list({ alunoId: aluno.id }) : [];
      const emAberto = financeiro.filter((mensalidade) => EM_ABERTO.includes(mensalidade.status));

      return {
        aluno: {
          id: aluno.id,
          nome: aluno.nome,
          instrumento: aluno.instrumento,
          status: aluno.status,
          ...(daEscola && { contato: aluno.contato }),
          plano: plano ? { id: plano.id, nome: plano.nome } : null,
          responsavel: responsavel ? { id: responsavel.id, nome: responsavel.nome } : null,
        },
        resumo: {
          presencas: historicas.filter((aula) => aula.status === 'realizada').length,
          faltas: historicas.filter((aula) => aula.status === 'falta').length,
          percentual: percentualDePresenca(historicas),
          reposicoes: reposicoes.filter((reposicao) => reposicao.aula.status !== 'cancelada').length,
          ...(daEscola && { emAberto: { quantidade: emAberto.length, valor: somar(emAberto) } }),
        },
        aulas: historicas.map((aula) => {
          const diario = diarioPorAula.get(aula.id);
          return {
            ...aula,
            diario: diario ? { conteudoMinistrado: diario.conteudoMinistrado, planoProxima: diario.planoProxima ?? null } : null,
          };
        }),
        proximas,
        reposicoes,
        solicitacoes: pedidos
          .filter((pedido) => pedido.aulaId == null || visiveis.has(pedido.aulaId))
          .reverse()
          .map((pedido) => ({
            id: pedido.id,
            tipo: pedido.tipo,
            dataSolicitacao: pedido.dataSolicitacao,
            liberaReposicao: Boolean(pedido.liberaReposicao),
            novaData: pedido.novaData,
            dataAnterior: pedido.dataAnterior ?? null, // remarcação: de quando a aula saiu
            aula: porId.has(pedido.aulaId) ? resumoDaAula(porId.get(pedido.aulaId)) : null,
          })),
        mensalidades: financeiro.map((mensalidade) => ({
          id: mensalidade.id,
          mesReferencia: mensalidade.mesReferencia,
          valor: mensalidade.valor,
          vencimento: mensalidade.vencimento,
          status: situacaoDaMensalidade(mensalidade, momento.hoje),
          dataPagamento: mensalidade.dataPagamento,
          formaPagamentoNome: nomeDaForma(mensalidade.formaPagamento),
          valorOriginal: mensalidade.valorOriginal ?? null,
          numeroRecibo: mensalidade.numeroRecibo ?? null,
        })),
      };
    },
  };
}
