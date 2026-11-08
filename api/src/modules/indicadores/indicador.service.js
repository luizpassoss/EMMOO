import { jaComecou } from '../../domain/agenda.js';
import { mesDaData, situacaoDaMensalidade } from '../../domain/mensalidades.js';
import { horaAtual, hojeISO, somarDias } from '../../shared/datas.js';

export const DIAS_DE_PRESENCA = 30; // a presença do painel olha os últimos 30 dias
const DIAS_PROXIMA_AULA = 60;
export const DIAS_FIM_DA_SERIE = 14; // a última aula marcada cai nas próximas 2 semanas: hora de renovar a série
const DIAS_ULTIMA_AULA = 120; // até onde se procura a última aula de quem ficou sem nenhuma marcada
const somar = (lista) => Math.round(lista.reduce((total, item) => total + Number(item.valor), 0) * 100) / 100;

/**
 * Semana seguinte à `ultima` aula, no mesmo dia da semana e de hoje em diante (hoje, só se o horário não passou).
 * É a sugestão para renovar a série com o mesmo professor e horário.
 */
export function proximaDataSemanal(ultima, momento) {
  let data = somarDias(ultima.data, 7);
  while (jaComecou({ data, hora: ultima.hora }, momento)) data = somarDias(data, 7);
  return data;
}

/**
 * Alunos ativos que precisam de aulas na agenda: sem nenhuma aula marcada ("sem_aulas") ou com a última
 * nas próximas duas semanas ("terminando"). Com a última aula conhecida, sugere o mesmo professor e horário.
 */
export function alunosParaAgendar(ativos, aulas, momento) {
  const porVir = (aula) => aula.status === 'agendada' && !jaComecou(aula, momento);
  const limite = somarDias(momento.hoje, DIAS_FIM_DA_SERIE);
  const lista = [];
  for (const aluno of ativos) {
    const doAluno = aulas.filter((aula) => aula.alunoId === aluno.id && aula.status !== 'cancelada');
    const futuras = doAluno.filter(porVir);
    const ultima = (futuras.length ? futuras : doAluno).at(-1) ?? null; // as aulas vêm por data e hora
    if (futuras.length > 0 && ultima.data > limite) continue;
    lista.push({
      aluno: { id: aluno.id, nome: aluno.nome, instrumento: aluno.instrumento },
      situacao: futuras.length ? 'terminando' : 'sem_aulas',
      ultimaAula: ultima ? { id: ultima.id, data: ultima.data, hora: ultima.hora, professorId: ultima.professorId } : null,
      sugestao: ultima
        ? { data: proximaDataSemanal(ultima, momento), hora: ultima.hora, professorId: ultima.professorId }
        : null,
    });
  }
  // Primeiro quem está sem aula; depois, quem termina antes.
  return lista.sort(
    (a, b) =>
      (a.situacao === 'sem_aulas' ? 0 : 1) - (b.situacao === 'sem_aulas' ? 0 : 1) ||
      (a.ultimaAula?.data ?? '').localeCompare(b.ultimaAula?.data ?? '') ||
      a.aluno.nome.localeCompare(b.aluno.nome, 'pt-BR'),
  );
}

/** % de presença das aulas já registradas (realizadas ÷ realizadas + faltas); null se ainda não há registro. */
export function percentualDePresenca(aulas) {
  const presencas = aulas.filter((aula) => aula.status === 'realizada').length;
  const faltas = aulas.filter((aula) => aula.status === 'falta').length;
  return presencas + faltas === 0 ? null : Math.round((presencas * 100) / (presencas + faltas));
}

/**
 * RF13 — indicadores do painel, por papel: a coordenação vê a escola (alunos ativos, % de presença,
 * inadimplência e o mês financeiro); o professor, a própria agenda; o responsável, cada dependente (RN03).
 */
export function createIndicadorService({ alunos, aulas, mensalidades, reposicoes, hoje = hojeISO, agora = horaAtual }) {
  async function daAgenda(filtro) {
    const momento = { hoje: hoje(), agora: agora() };
    const recentes = await aulas.list({ inicio: somarDias(momento.hoje, -DIAS_DE_PRESENCA), fim: momento.hoje, ...filtro });
    return {
      aulasHoje: recentes.filter((aula) => aula.data === momento.hoje && aula.status !== 'cancelada').length,
      aRegistrar: recentes.filter((aula) => aula.status === 'agendada' && jaComecou(aula, momento)).length, // RF08
      presenca: { percentual: percentualDePresenca(recentes), dias: DIAS_DE_PRESENCA },
    };
  }

  async function daCoordenacao() {
    const momento = { hoje: hoje(), agora: agora() };
    const mes = mesDaData(momento.hoje);
    const [ativos, agenda, naoPagas, doMesTodas, recentesEFuturas] = await Promise.all([
      alunos.list({ status: 'ativo' }),
      daAgenda({}),
      mensalidades.list({ naoPagas: true }),
      mensalidades.list({ mes }),
      aulas.list({ inicio: somarDias(momento.hoje, -DIAS_ULTIMA_AULA) }),
    ]);
    const atrasadas = naoPagas.filter((mensalidade) => situacaoDaMensalidade(mensalidade, momento.hoje) === 'atrasada');
    const doMes = doMesTodas.filter((mensalidade) => mensalidade.status !== 'cancelada'); // a cancelada não é cobrada
    return {
      papel: 'coordenacao',
      alunosAtivos: ativos.length,
      ...agenda,
      inadimplencia: { quantidade: atrasadas.length, valor: somar(atrasadas) },
      mesAtual: {
        mes,
        previsto: somar(doMes),
        recebido: somar(doMes.filter((mensalidade) => mensalidade.status === 'paga')),
        geradas: doMes.length,
      },
      alunosParaAgendar: alunosParaAgendar(ativos, recentesEFuturas, momento),
    };
  }

  async function doResponsavel(usuario) {
    const momento = { hoje: hoje(), agora: agora() };
    const dependentes = (await alunos.list({ usuarioRespId: usuario.id })).filter((aluno) => aluno.status === 'ativo');
    if (dependentes.length === 0) return { papel: 'responsavel', dependentes: [] };
    const ids = dependentes.map((aluno) => aluno.id);
    const [proximas, naoPagas, creditos] = await Promise.all([
      aulas.list({ inicio: momento.hoje, fim: somarDias(momento.hoje, DIAS_PROXIMA_AULA), alunoIds: ids }),
      mensalidades.list({ alunoIds: ids, naoPagas: true }),
      reposicoes.disponiveis({}, usuario),
    ]);
    return {
      papel: 'responsavel',
      dependentes: dependentes.map((aluno) => {
        const proxima = proximas.find((aula) => aula.alunoId === aluno.id && aula.status === 'agendada' && !jaComecou(aula, momento));
        const emAberto = naoPagas.filter((mensalidade) => mensalidade.alunoId === aluno.id);
        return {
          aluno: { id: aluno.id, nome: aluno.nome, instrumento: aluno.instrumento },
          proximaAula: proxima ? { id: proxima.id, data: proxima.data, hora: proxima.hora } : null,
          reposicoesDisponiveis: creditos.filter((credito) => credito.aula.alunoId === aluno.id && credito.permitido).length,
          mensalidades: {
            emAberto: emAberto.length,
            valor: somar(emAberto),
            atrasadas: emAberto.filter((mensalidade) => situacaoDaMensalidade(mensalidade, momento.hoje) === 'atrasada').length,
          },
        };
      }),
    };
  }

  return {
    async doUsuario(usuario) {
      if (usuario.papel === 'professor') return { papel: 'professor', ...(await daAgenda({ professorId: usuario.id })) };
      if (usuario.papel === 'responsavel') return doResponsavel(usuario);
      return daCoordenacao();
    },
  };
}
